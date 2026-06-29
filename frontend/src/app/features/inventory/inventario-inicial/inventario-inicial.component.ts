import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { OperationsApiService } from '../../operations/services/operations-api.service';
import type { Room } from '../../operations/services/operations.models';

interface Row {
  name: string;
  articleKind: string;
  category?: string | null;
  baseQty: number;
  required: boolean;
  allowExtra: boolean;
  quantity: number;
  source: string;
}
interface InvResp {
  room: { id: string; number: string; floor?: string | null; roomType: { id: string; name: string } };
  rows: Row[];
}
const KIND_LABEL: Record<string, string> = { LINEN_REUSABLE: 'Ropa', AMENITY: 'Amenity', SALE: 'Producto', ASSET: 'Activo' };

@Component({
  selector: 'app-inventario-inicial',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputNumberModule, SelectModule],
  template: `
    <section class="ii">
      <header class="top">
        <div><h1>Inventario Inicial por Habitación</h1><p class="muted">Registra la cantidad real que hay actualmente en cada habitación. Se carga la dotación base sugerida según el tipo; edita las cantidades reales y guarda. No descuenta de los almacenes (es el conteo de arranque).</p></div>
      </header>

      <div class="bar">
        <div class="fld"><label>Habitación</label>
          <p-select [options]="rooms()" [(ngModel)]="roomId" (onChange)="load()" optionValue="id" [filter]="true" filterBy="number" placeholder="Selecciona una habitación" styleClass="dk">
            <ng-template let-r pTemplate="item">Hab. {{ r.number }} · {{ r.roomType?.name }} · Piso {{ r.floor || '-' }}</ng-template>
            <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }} · {{ r.roomType?.name }}</ng-template>
          </p-select>
        </div>
        @if (data(); as d) {
          <span class="spacer"></span>
          <button class="btn ghost" (click)="suggest()"><i class="pi pi-magic"></i> Sugerir dotación base</button>
          <button class="btn green" [disabled]="saving()" (click)="save()"><i class="pi pi-check"></i> Guardar inventario inicial</button>
        }
      </div>

      @if (!roomId) {
        <p class="muted empty">Selecciona una habitación para registrar su inventario inicial.</p>
      } @else if (data()) {
        @let d = data()!;
        <div class="tablewrap">
          <table class="tbl">
            <thead><tr><th>Categoría</th><th>Artículo</th><th>Tipo</th><th class="cn">Esperado (base)</th><th class="cn">Cantidad real</th><th class="cn">Obligatorio</th></tr></thead>
            <tbody>
              @for (r of d.rows; track r.articleKind + r.name) {
                <tr [class.extra]="r.source === 'extra'">
                  <td class="muted">{{ r.category || '—' }}</td>
                  <td class="nm">{{ r.name }} @if (r.source === 'extra') { <span class="tag-extra">extra</span> }</td>
                  <td><span class="kind">{{ kindLabel(r.articleKind) }}</span></td>
                  <td class="cn muted">{{ r.baseQty }}</td>
                  <td class="cn"><p-inputNumber [(ngModel)]="r.quantity" [min]="0" [showButtons]="true" buttonLayout="horizontal" inputStyleClass="qty" /></td>
                  <td class="cn"><span class="pill" [class.yes]="r.required">{{ r.required ? 'Sí' : 'No' }}</span></td>
                </tr>
              } @empty { <tr><td colspan="6" class="muted center">Este tipo de habitación no tiene dotación base configurada. Configúrala en Configuraciones › Dotación Base.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .ii { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; font-size: 1.6rem; } .muted { color: #8b97a8; } .center { text-align: center; } .empty { padding: 2rem 0; text-align: center; }
      .bar { display: flex; align-items: flex-end; gap: 0.8rem; margin: 1rem 0; flex-wrap: wrap; }
      .bar .fld { display: flex; flex-direction: column; gap: 0.35rem; } .bar label { font-size: 0.8rem; color: #9fb0c3; }
      .spacer { flex: 1; }
      :host ::ng-deep .dk { min-width: 300px; }
      .btn { border: 0; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; }
      .btn.green { background: #10b981; color: #04130d; } .btn.green:disabled { opacity: 0.5; }
      .btn.ghost { background: #131b27; border: 1px solid #243245; color: #cdd8e6; }
      .tablewrap { background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.88rem; min-width: 720px; }
      .tbl th { text-align: left; padding: 0.8rem 1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; font-size: 0.78rem; }
      .tbl td { padding: 0.6rem 1rem; border-bottom: 1px solid #16202e; vertical-align: middle; } .tbl tr:last-child td { border-bottom: 0; }
      .tbl tr.extra { background: rgba(20,184,166,0.06); }
      th.cn, td.cn { text-align: center; }
      .nm { font-weight: 600; color: #fff; }
      .tag-extra { background: rgba(20,184,166,0.2); color: #5eead4; font-size: 0.65rem; font-weight: 700; border-radius: 999px; padding: 0.1rem 0.45rem; margin-left: 0.35rem; }
      .kind { font-size: 0.72rem; font-weight: 700; padding: 0.16rem 0.6rem; border-radius: 999px; background: #1a2333; color: #9fb0c3; }
      .pill { display: inline-block; border-radius: 999px; padding: 0.16rem 0.65rem; font-size: 0.72rem; font-weight: 700; background: #1a2333; color: #9fb0c3; }
      .pill.yes { background: rgba(37,99,235,0.22); color: #60a5fa; }
      :host ::ng-deep .qty { width: 4rem; text-align: center; }
    `,
  ],
})
export class InventarioInicialComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly ops = inject(OperationsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly messages = inject(MessageService);

  readonly rooms = signal<Room[]>([]);
  readonly data = signal<InvResp | null>(null);
  readonly saving = signal(false);
  roomId: string | null = null;

  ngOnInit(): void {
    this.ops.rooms.list({ pageSize: 300, sortBy: 'number' }).subscribe((r) => this.rooms.set(r.data ?? []));
    const pre = this.route.snapshot.queryParamMap.get('room');
    if (pre) { this.roomId = pre; this.load(); }
  }

  kindLabel(v: string): string { return KIND_LABEL[v] ?? v; }

  load(): void {
    if (!this.roomId) { this.data.set(null); return; }
    this.http.get<ApiResponse<InvResp>>(`${this.api}/rooms/${this.roomId}/inventory`)
      .subscribe({ next: (r) => this.data.set(r.data ?? null), error: () => this.data.set(null) });
  }

  suggest(): void {
    const d = this.data();
    if (!d) return;
    d.rows.forEach((r) => { if (r.source === 'dotacion') r.quantity = r.baseQty; });
  }

  save(): void {
    const d = this.data();
    if (!this.roomId || !d) return;
    const items = d.rows.map((r) => ({ name: r.name, articleKind: r.articleKind, category: r.category || undefined, quantity: r.quantity }));
    if (!items.length) { this.messages.add({ severity: 'warn', summary: 'Sin artículos', detail: 'No hay dotación que registrar.' }); return; }
    this.saving.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/rooms/${this.roomId}/inventory/initial`, { items })
      .subscribe({
        next: () => { this.saving.set(false); this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Inventario inicial registrado.' }); this.load(); },
        error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
      });
  }
}
