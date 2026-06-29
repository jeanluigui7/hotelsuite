import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { OperationsApiService } from '../services/operations-api.service';
import type { Room } from '../services/operations.models';

interface Row {
  name: string; articleKind: string; category?: string | null;
  baseQty: number; required: boolean; allowExtra: boolean; quantity: number; source: string; linenItemId?: string | null;
}
interface InvResp {
  room: { id: string; number: string; floor?: string | null; roomType: { id: string; name: string } };
  rows: Row[];
}
interface RetiroRow extends Row { retiroQty: number; incidencia: string; }
interface RepoRow extends Row { repoQty: number; }

const KIND_LABEL: Record<string, string> = { LINEN_REUSABLE: 'Ropa', AMENITY: 'Amenity', SALE: 'Producto', ASSET: 'Activo' };
const INCIDENCIAS = [
  { label: 'OK (a lavandería)', value: 'OK' },
  { label: 'Manchada', value: 'MANCHADA' },
  { label: 'Dañada', value: 'DANADA' },
  { label: 'Faltante', value: 'FALTANTE' },
];

@Component({
  selector: 'app-limpieza-inventario',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputNumberModule, InputTextModule, SelectModule],
  template: `
    <section class="li">
      <header class="top">
        <div><h1>Limpieza por Inventario</h1><p class="muted">Retira la ropa usada, repón la dotación y deja la habitación disponible.</p></div>
      </header>

      <div class="bar">
        <p-select [options]="rooms()" [(ngModel)]="roomId" (onChange)="load()" optionValue="id" [filter]="true" filterBy="number" placeholder="Selecciona una habitación" styleClass="dk">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }} · {{ r.roomType?.name }} · {{ r.status }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }} · {{ r.roomType?.name }}</ng-template>
        </p-select>
      </div>

      @if (!roomId) {
        <p class="muted empty">Selecciona una habitación para iniciar la limpieza por inventario.</p>
      } @else if (data()) {
        @let d = data()!;
        <div class="head-room">
          <strong>Hab. {{ d.room.number }}</strong> · {{ d.room.roomType.name }} · Piso {{ d.room.floor || '-' }}
        </div>

        <!-- FASE 1: RETIRO -->
        <div class="panel">
          <h3><span class="step">1</span> Retiro de ropa</h3>
          @if (retiroRows().length) {
            <table class="tbl">
              <thead><tr><th>Artículo</th><th class="cn">En habitación</th><th class="cn">Retirar</th><th>Incidencia</th></tr></thead>
              <tbody>
                @for (r of retiroRows(); track r.name) {
                  <tr>
                    <td class="nm">{{ r.name }}</td>
                    <td class="cn muted">{{ r.quantity }}</td>
                    <td class="cn"><p-inputNumber [(ngModel)]="r.retiroQty" [min]="0" [max]="r.quantity" inputStyleClass="qty" /></td>
                    <td><p-select [options]="incidencias" optionLabel="label" optionValue="value" [(ngModel)]="r.incidencia" styleClass="w" appendTo="body" /></td>
                  </tr>
                }
              </tbody>
            </table>
            <button class="btn amber" [disabled]="busy()" (click)="doRetiro()"><i class="pi pi-inbox"></i> Confirmar retiro</button>
          } @else { <p class="muted">No hay ropa reutilizable en la habitación para retirar.</p> }
        </div>

        <!-- FASE 2: REPOSICIÓN -->
        <div class="panel">
          <h3><span class="step">2</span> Reposición sugerida</h3>
          @if (repoRows().length) {
            <table class="tbl">
              <thead><tr><th>Artículo</th><th>Tipo</th><th class="cn">Base</th><th class="cn">Actual</th><th class="cn">Reponer</th></tr></thead>
              <tbody>
                @for (r of repoRows(); track r.articleKind + r.name) {
                  <tr>
                    <td class="nm">{{ r.name }}</td>
                    <td><span class="kind">{{ kindLabel(r.articleKind) }}</span></td>
                    <td class="cn muted">{{ r.baseQty }}</td>
                    <td class="cn" [class.low]="r.quantity < r.baseQty">{{ r.quantity }}</td>
                    <td class="cn"><p-inputNumber [(ngModel)]="r.repoQty" [min]="0" inputStyleClass="qty" /></td>
                  </tr>
                }
              </tbody>
            </table>
            <button class="btn green" [disabled]="busy()" (click)="doReposicion()"><i class="pi pi-box"></i> Confirmar reposición</button>
          } @else { <p class="muted">Sin dotación base configurada para este tipo.</p> }
        </div>

        <!-- FINALIZAR -->
        <div class="panel">
          <h3><span class="step">3</span> Finalizar limpieza</h3>
          <p class="muted">La habitación pasará a <strong>Disponible</strong> si los ítems obligatorios están completos.</p>
          @if (faltantes().length) {
            <div class="warn"><i class="pi pi-exclamation-triangle"></i> Faltan obligatorios: {{ faltantesLabel() }}. Requiere excepción autorizada.</div>
            <div class="exc">
              <input pInputText [(ngModel)]="excMotivo" placeholder="Motivo de la excepción" />
              <input pInputText [(ngModel)]="excAutoriza" placeholder="Autorizado por" />
            </div>
          }
          <button class="btn done" [disabled]="busy()" (click)="finalizar()"><i class="pi pi-check-circle"></i> Finalizar y dejar disponible</button>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .li { background: #0b1410; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6efe9; }
      h1 { margin: 0; color: #fff; font-size: 1.6rem; } .muted { color: #8aa499; } .empty { padding: 2rem 0; text-align: center; }
      .bar { margin: 1rem 0; } :host ::ng-deep .dk { min-width: 320px; }
      .head-room { background: #12231b; border: 1px solid #1f3a2c; border-radius: 10px; padding: 0.7rem 1rem; margin-bottom: 1rem; }
      .panel { background: #0e1f18; border: 1px solid #1f3a2c; border-radius: 12px; padding: 1.1rem; margin-bottom: 1rem; }
      h3 { margin: 0 0 0.8rem; color: #34d399; display: flex; align-items: center; gap: 0.5rem; font-size: 1.05rem; }
      .step { background: #10b981; color: #04130d; width: 1.6rem; height: 1.6rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-bottom: 0.8rem; }
      .tbl th { text-align: left; padding: 0.5rem 0.7rem; color: #9fb0a8; font-weight: 600; border-bottom: 1px solid #1f3a2c; font-size: 0.76rem; }
      .tbl td { padding: 0.45rem 0.7rem; border-bottom: 1px solid #16261e; } .tbl tr:last-child td { border-bottom: 0; }
      th.cn, td.cn { text-align: center; } .nm { font-weight: 600; color: #fff; } .low { color: #f87171; font-weight: 700; }
      .kind { font-size: 0.72rem; font-weight: 700; padding: 0.14rem 0.55rem; border-radius: 999px; background: #14352a; color: #6ee7b7; }
      .btn { border: 0; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; color: #04130d; }
      .btn.green { background: #10b981; } .btn.amber { background: #f59e0b; } .btn.done { background: #34d399; } .btn:disabled { opacity: 0.5; }
      .warn { background: rgba(245,158,11,0.12); border: 1px solid #b45309; color: #fcd34d; border-radius: 8px; padding: 0.6rem 0.9rem; margin-bottom: 0.7rem; font-size: 0.85rem; }
      .exc { display: flex; gap: 0.6rem; margin-bottom: 0.8rem; flex-wrap: wrap; } .exc input { flex: 1; min-width: 180px; }
      :host ::ng-deep .qty { width: 4rem; text-align: center; } :host ::ng-deep .w { width: 100%; }
      input[pInputText] { background: #12231b; border: 1px solid #1f3a2c; color: #e6efe9; border-radius: 8px; padding: 0.5rem 0.7rem; }
    `,
  ],
})
export class LimpiezaInventarioComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly ops = inject(OperationsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly messages = inject(MessageService);

  readonly rooms = signal<Room[]>([]);
  readonly data = signal<InvResp | null>(null);
  readonly retiroRows = signal<RetiroRow[]>([]);
  readonly repoRows = signal<RepoRow[]>([]);
  readonly busy = signal(false);
  roomId: string | null = null;
  excMotivo = '';
  excAutoriza = '';
  readonly incidencias = INCIDENCIAS;

  ngOnInit(): void {
    this.ops.rooms.list({ pageSize: 300, sortBy: 'number' }).subscribe((r) => this.rooms.set(r.data ?? []));
    const pre = this.route.snapshot.queryParamMap.get('room');
    if (pre) { this.roomId = pre; this.load(); }
  }

  kindLabel(v: string): string { return KIND_LABEL[v] ?? v; }
  faltantes(): Row[] { return (this.data()?.rows ?? []).filter((r) => r.required && r.quantity < r.baseQty); }
  faltantesLabel(): string { return this.faltantes().map((f) => `${f.name} ${f.quantity}/${f.baseQty}`).join(', '); }

  load(): void {
    if (!this.roomId) { this.data.set(null); return; }
    this.http.get<ApiResponse<InvResp>>(`${this.api}/rooms/${this.roomId}/inventory`).subscribe({
      next: (r) => {
        const d = r.data ?? null;
        this.data.set(d);
        const rows = d?.rows ?? [];
        this.retiroRows.set(rows.filter((x) => x.articleKind === 'LINEN_REUSABLE' && x.quantity > 0).map((x) => ({ ...x, retiroQty: x.quantity, incidencia: 'OK' })));
        this.repoRows.set(rows.filter((x) => x.source === 'dotacion').map((x) => ({ ...x, repoQty: Math.max(0, x.baseQty - x.quantity) })));
      },
      error: () => this.data.set(null),
    });
  }

  doRetiro(): void {
    const items = this.retiroRows().filter((r) => r.retiroQty > 0).map((r) => ({ name: r.name, articleKind: r.articleKind, quantity: r.retiroQty, incidencia: r.incidencia, linenItemId: r.linenItemId || undefined }));
    if (!items.length) { this.messages.add({ severity: 'warn', summary: 'Nada que retirar', detail: 'Indica las cantidades a retirar.' }); return; }
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/rooms/${this.roomId}/cleaning/retiro`, { items }).subscribe({
      next: () => { this.busy.set(false); this.messages.add({ severity: 'success', summary: 'Retiro registrado', detail: 'Ropa enviada a Ropa Sucia Pendiente.' }); this.load(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  doReposicion(): void {
    const items = this.repoRows().filter((r) => r.repoQty > 0).map((r) => ({ name: r.name, articleKind: r.articleKind, quantity: r.repoQty, linenItemId: r.linenItemId || undefined }));
    if (!items.length) { this.messages.add({ severity: 'warn', summary: 'Nada que reponer', detail: 'Indica las cantidades a reponer.' }); return; }
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/rooms/${this.roomId}/cleaning/reposicion`, { items }).subscribe({
      next: () => { this.busy.set(false); this.messages.add({ severity: 'success', summary: 'Reposición registrada', detail: 'Dotación repuesta en la habitación.' }); this.load(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  finalizar(): void {
    const body: { exception?: { motivo: string; autorizadoPor: string } } = {};
    if (this.faltantes().length) {
      if (!this.excMotivo.trim() || !this.excAutoriza.trim()) { this.messages.add({ severity: 'warn', summary: 'Excepción requerida', detail: 'Indica motivo y quién autoriza.' }); return; }
      body.exception = { motivo: this.excMotivo.trim(), autorizadoPor: this.excAutoriza.trim() };
    }
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/rooms/${this.roomId}/cleaning/finalizar`, body).subscribe({
      next: () => { this.busy.set(false); this.messages.add({ severity: 'success', summary: 'Limpieza finalizada', detail: 'La habitación quedó Disponible.' }); this.excMotivo = ''; this.excAutoriza = ''; this.load(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo finalizar', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
