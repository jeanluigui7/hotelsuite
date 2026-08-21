import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';

interface KItem { productId: string; name: string; sku?: string | null; stockInicial: number; ingresos: number; salidas: number; ajustes: number; stock: number; min: number; belowMin: boolean; }
interface Turn { shift: string; businessDate: string; startTime: string; endTime: string; isCurrent: boolean; from?: string; to?: string; }
interface WhOpt { id: string; name: string; type: string; }
interface AdjDetail { id: string; at: string; kind: string; quantity: number; counterpart: string | null; room: string | null; reason: string | null; user: string | null; approvedBy: string | null; }
interface SalidaDetail { id: string; at: string; room: string | null; productName: string; quantity: number; user: string | null; }

const ADJ_LABEL: Record<string, string> = { TRANSFER: 'Transferencia interna', SOBRANTE: 'Sobrante', VENCIDO: 'Vencido', MERMA: 'Perdido/Merma', FALTANTE: 'Faltante', VENTA_NO_REGISTRADA: 'Venta no registrada', PERDIDA_COLABORADOR: 'Pérdida atribuida', ADJUST: 'Ajuste' };

@Component({
  selector: 'app-productos-limpieza',
  standalone: true,
  imports: [DatePipe, FormsModule, DialogModule, SelectModule, InputNumberModule, InputTextModule, ButtonModule],
  template: `
    <section class="inv">
      <header class="top">
        <div><h1>Productos - Limpieza</h1><p class="muted">Kardex del almacén de productos de frigobar gestionado por Limpieza. Separado de Inventario Limpieza (ropa/amenities).</p></div>
        <button class="iconbtn" (click)="reload()"><i class="pi pi-sync"></i> Actualizar</button>
      </header>

      @if (turn(); as t) {
        <div class="turnbar"><i class="pi pi-clock"></i> Turno {{ t.shift }} · {{ t.businessDate }} ({{ t.startTime }}–{{ t.endTime }}) {{ t.isCurrent ? '· actual' : '' }}</div>
      }

      @if (whId()) {
        <table class="tbl">
          <thead><tr>
            <th>NOMBRE</th><th class="n">STOCK INICIAL</th><th class="n">INGRESOS</th><th class="n">SALIDAS</th><th class="n">AJUSTES</th><th class="n">STOCK ACT./MÍN.</th><th class="g"></th>
          </tr></thead>
          <tbody>
            @for (it of items(); track it.productId) {
              <tr [class.low]="it.belowMin">
                <td class="name"><span class="ico"><i class="pi pi-box"></i></span><div><div>{{ it.name }}</div><small class="muted">{{ it.sku || '—' }}</small></div></td>
                <td class="n init">{{ it.stockInicial }}</td>
                <td class="n pos">{{ it.ingresos }}</td>
                <td class="n sal" [class.clk]="it.salidas !== 0" (click)="it.salidas !== 0 && openSalidas(it)"><span class="neg">{{ it.salidas }}</span>@if (it.salidas !== 0) { <i class="pi pi-search-plus av"></i> }</td>
                <td class="n adj" [class.clk]="it.ajustes !== 0" (click)="it.ajustes !== 0 && openAjustes(it)"><span [class.pos]="it.ajustes > 0" [class.neg]="it.ajustes < 0">{{ it.ajustes > 0 ? '+' : '' }}{{ it.ajustes }}</span>@if (it.ajustes !== 0) { <i class="pi pi-search-plus av"></i> }</td>
                <td class="n">@if (it.belowMin) { <span class="warn"><i class="pi pi-exclamation-triangle"></i> {{ it.stock }} u.</span> } @else { <span>{{ it.stock }} u.</span> }</td>
                <td class="g"><button class="gear" (click)="openAdjust(it)" title="Registrar ajuste"><i class="pi pi-sliders-h"></i></button></td>
              </tr>
            } @empty { <tr><td colspan="7" class="muted center">Sin productos.</td></tr> }
          </tbody>
        </table>
      } @else {
        <div class="empty"><i class="pi pi-info-circle"></i> Esta sucursal no tiene configurado el almacén <b>PRODUCTOS-LIMPIEZA</b>. Créalo desde Configuración de Almacenes.</div>
      }
    </section>

    <!-- Registrar ajuste -->
    <p-dialog [(visible)]="adjVisible" [modal]="true" [header]="'Registrar ajuste' + (adjItem ? ' · ' + adjItem.name : '')" [style]="{ width: '32rem', maxWidth: '96vw' }">
      <div class="form">
        <label>Tipo de ajuste</label>
        <p-select [options]="adjKinds" optionLabel="label" optionValue="value" [(ngModel)]="adjForm.kind" appendTo="body" styleClass="w" />
        <label>Cantidad</label>
        <p-inputNumber [(ngModel)]="adjForm.quantity" [min]="1" [showButtons]="true" styleClass="w" />
        @if (adjForm.kind === 'TRANSFER') {
          <label>Almacén destino</label>
          <p-select [options]="warehouses()" optionLabel="name" optionValue="id" [(ngModel)]="adjForm.toWarehouseId" placeholder="Elegir almacén" appendTo="body" styleClass="w" />
        }
        <label>Motivo / observación</label>
        <input pInputText [(ngModel)]="adjForm.reference" placeholder="Opcional" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="adjVisible = false" />
        <p-button label="Registrar" icon="pi pi-check" [loading]="busy()" (onClick)="saveAdjust()" />
      </ng-template>
    </p-dialog>

    <!-- Detalle de ajustes -->
    <p-dialog [(visible)]="adjDetailVisible" [modal]="true" [header]="'Ajustes' + (detailItem ? ' · ' + detailItem.name : '')" [style]="{ width: '48rem', maxWidth: '97vw' }">
      <div class="tbl-wrap">
        <table class="tbl"><thead><tr><th>Fecha/Hora</th><th>Tipo</th><th class="n">Cant.</th><th>Origen/Destino o Motivo</th><th>Usuario</th>@if (canAttributeLoss()) { <th class="c">Acción</th> }</tr></thead>
          <tbody>
            @for (a of adjDetail(); track a.id) {
              <tr><td>{{ a.at | date: 'dd/MM HH:mm' }}</td><td><span class="tag">{{ label(a.kind) }}</span></td>
                <td class="n"><span [class.pos]="a.quantity > 0" [class.neg]="a.quantity < 0">{{ a.quantity > 0 ? '+' : '' }}{{ a.quantity }}</span></td>
                <td>{{ a.counterpart || a.room || a.reason || '—' }}</td><td>{{ a.user || '—' }}@if (a.approvedBy) { <small class="muted"> · aprobó {{ a.approvedBy }}</small> }</td>
                @if (canAttributeLoss()) {
                  <td class="c">
                    @if (a.kind === 'FALTANTE') { <button class="mini warn" (click)="openAttribute(a)"><i class="pi pi-user"></i> Atribuir</button> }
                    @else if (a.kind === 'PERDIDA_COLABORADOR') { <span class="tag ok">Atribuido</span> }
                  </td>
                }</tr>
            } @empty { <tr><td [attr.colspan]="canAttributeLoss() ? 6 : 5" class="muted center">Sin ajustes en el turno.</td></tr> }
          </tbody></table>
      </div>
    </p-dialog>

    <!-- Atribuir pérdida al colaborador -->
    <p-dialog [(visible)]="attrVisible" [modal]="true" header="Atribuir pérdida al colaborador" [style]="{ width: '30rem', maxWidth: '96vw' }">
      <div class="form">
        <p class="muted">Reclasifica un faltante de inventario como pérdida atribuida a un colaborador. No mueve caja ni stock; queda registrado con tu aprobación.</p>
        <label>Colaborador</label>
        <input pInputText [(ngModel)]="attrForm.collaborator" placeholder="Nombre del responsable" />
        <label>Importe estimado (S/) — opcional</label>
        <p-inputNumber [(ngModel)]="attrForm.amount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label>Observación</label>
        <input pInputText [(ngModel)]="attrForm.note" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="attrVisible = false" />
        <p-button label="Atribuir" icon="pi pi-check" [loading]="busy()" (onClick)="saveAttribute()" />
      </ng-template>
    </p-dialog>

    <!-- Detalle de salidas (reposiciones a frigobar) -->
    <p-dialog [(visible)]="salDetailVisible" [modal]="true" [header]="'Salidas (reposición frigobar)' + (detailItem ? ' · ' + detailItem.name : '')" [style]="{ width: '44rem', maxWidth: '97vw' }">
      <div class="tbl-wrap">
        <table class="tbl"><thead><tr><th>Hora</th><th>Habitación</th><th class="n">Cantidad</th><th>Usuario</th></tr></thead>
          <tbody>
            @for (s of salDetail(); track s.id) {
              <tr><td>{{ s.at | date: 'dd/MM HH:mm' }}</td><td>{{ s.room || '—' }}</td><td class="n">{{ s.quantity }}</td><td>{{ s.user || '—' }}</td></tr>
            } @empty { <tr><td colspan="4" class="muted center">Sin reposiciones registradas. El flujo de reposición de frigobar se habilitará con el módulo FRIOBAR.</td></tr> }
          </tbody></table>
      </div>
    </p-dialog>
  `,
  styles: [
    `
      .inv { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
      h1 { margin: 0; font-size: 1.5rem; } .muted { color: #8b97a8; margin: 0.25rem 0 0; }
      .iconbtn { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.45rem 0.8rem; cursor: pointer; }
      .turnbar { display: inline-flex; align-items: center; gap: 0.4rem; background: #101c2e; border: 1px solid #1c2c44; border-radius: 8px; padding: 0.4rem 0.8rem; font-size: 0.84rem; color: #cbd5e1; margin-bottom: 0.8rem; }
      .tbl { width: 100%; border-collapse: collapse; background: #131d2b; border: 1px solid #243245; border-radius: 10px; overflow: hidden; }
      .tbl th, .tbl td { padding: 0.6rem 0.7rem; border-bottom: 1px solid #1c2a3a; text-align: left; font-size: 0.86rem; }
      .tbl th { color: #8aa0bd; font-size: 0.72rem; letter-spacing: 0.4px; }
      .tbl .n { text-align: right; } .center { text-align: center; }
      .name { display: flex; align-items: center; gap: 0.5rem; } .ico { color: #60a5fa; }
      .init { color: #cbd5e1; } .pos { color: #34d399; } .neg { color: #f87171; }
      tr.low td { background: rgba(245,158,11,0.08); } .warn { color: #fbbf24; }
      .adj.clk, .sal.clk { cursor: pointer; } .adj.clk:hover, .sal.clk:hover { background: rgba(96,165,250,0.08); }
      .adj .av, .sal .av { font-size: 0.72rem; color: #93c5fd; margin-left: 0.3rem; }
      .gear { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.3rem 0.55rem; cursor: pointer; }
      .empty { display: flex; align-items: center; gap: 0.5rem; background: #101c2e; border: 1px solid #1c2c44; border-radius: 10px; padding: 1rem; color: #cbd5e1; }
      .form { display: flex; flex-direction: column; gap: 0.35rem; } .form label { font-size: 0.82rem; color: #8aa0bd; margin-top: 0.5rem; }
      :host ::ng-deep .form .w, :host ::ng-deep .form input[pInputText] { width: 100%; }
      .tag { font-size: 0.72rem; font-weight: 700; padding: 0.12rem 0.5rem; border-radius: 6px; background: rgba(148,163,184,0.18); color: #cbd5e1; }
      .tag.ok { background: rgba(52,211,153,0.18); color: #34d399; }
      .tbl .c { text-align: center; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.3rem 0.6rem; font-size: 0.74rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; }
      .mini.warn { background: #78350f; color: #fcd34d; border-color: #b45309; }
      .tbl-wrap { overflow-x: auto; }
    `,
  ],
})
export class ProductosLimpiezaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly items = signal<KItem[]>([]);
  readonly turn = signal<Turn | null>(null);
  readonly whId = signal<string>('');
  readonly busy = signal(false);
  fDay = ''; curShift = '';

  readonly warehouses = signal<WhOpt[]>([]);
  adjVisible = false;
  adjItem: KItem | null = null;
  adjForm: { kind: 'SOBRANTE' | 'VENCIDO' | 'MERMA' | 'FALTANTE' | 'TRANSFER'; quantity: number; reference: string; toWarehouseId: string | null } = { kind: 'SOBRANTE', quantity: 1, reference: '', toWarehouseId: null };
  readonly adjKinds = [
    { label: 'Sobrante (regresa a Almacén General)', value: 'SOBRANTE' },
    { label: 'Vencido', value: 'VENCIDO' },
    { label: 'Perdido / Merma', value: 'MERMA' },
    { label: 'Faltante de inventario', value: 'FALTANTE' },
    { label: 'Transferencia interna', value: 'TRANSFER' },
  ];

  adjDetailVisible = false;
  salDetailVisible = false;
  detailItem: KItem | null = null;
  readonly adjDetail = signal<AdjDetail[]>([]);
  readonly salDetail = signal<SalidaDetail[]>([]);

  label(k: string): string { return ADJ_LABEL[k] ?? k; }

  ngOnInit(): void { this.reload(); }

  reload(): void {
    const params: Record<string, string> = {};
    if (this.fDay && this.curShift) { params['date'] = this.fDay; params['shift'] = this.curShift; }
    this.http.get<ApiResponse<{ items: KItem[]; turn: Turn | null; warehouseId: string | null }>>(`${this.api}/products-cleaning`, { params }).subscribe((r) => {
      this.items.set(r.data?.items ?? []);
      this.turn.set(r.data?.turn ?? null);
      this.whId.set(r.data?.warehouseId ?? '');
      if (r.data?.turn) { this.fDay = r.data.turn.businessDate; this.curShift = r.data.turn.shift; }
    });
  }

  openAdjust(it: KItem): void {
    this.adjItem = it;
    this.adjForm = { kind: 'SOBRANTE', quantity: 1, reference: '', toWarehouseId: null };
    if (!this.warehouses().length) this.http.get<ApiResponse<WhOpt[]>>(`${this.api}/warehouses`, { params: { pageSize: '100' } }).subscribe((r) => this.warehouses.set(r.data ?? []));
    this.adjVisible = true;
  }

  saveAdjust(): void {
    const it = this.adjItem;
    if (!it || !this.whId()) return;
    if (!this.adjForm.quantity || this.adjForm.quantity < 1) { this.toast.add({ severity: 'warn', summary: 'Cantidad', detail: 'Indica una cantidad válida.' }); return; }
    if (this.adjForm.kind === 'TRANSFER' && !this.adjForm.toWarehouseId) { this.toast.add({ severity: 'warn', summary: 'Destino', detail: 'Elige el almacén destino.' }); return; }
    this.busy.set(true);
    const body: Record<string, unknown> = { kind: this.adjForm.kind, productId: it.productId, warehouseId: this.whId(), quantity: this.adjForm.quantity, reference: this.adjForm.reference || undefined };
    if (this.adjForm.kind === 'TRANSFER') body['toWarehouseId'] = this.adjForm.toWarehouseId;
    this.http.post<ApiResponse<unknown>>(`${this.api}/adjustments`, body).subscribe({
      next: () => { this.busy.set(false); this.adjVisible = false; this.toast.add({ severity: 'success', summary: 'Ajuste registrado', detail: `${this.label(this.adjForm.kind)} · ${it.name}` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar el ajuste.' }); },
    });
  }

  openAjustes(it: KItem): void {
    this.detailItem = it; this.adjDetail.set([]); this.adjDetailVisible = true;
    const t = this.turn();
    const params: Record<string, string> = { warehouseId: this.whId(), productId: it.productId };
    if (t?.from) params['from'] = t.from;
    if (t?.to) params['to'] = t.to;
    this.http.get<ApiResponse<AdjDetail[]>>(`${this.api}/adjustments/detail`, { params }).subscribe((r) => this.adjDetail.set(r.data ?? []));
  }

  // ── Pérdida atribuida al colaborador (reclasifica un FALTANTE; solo administración) ──
  attrVisible = false;
  attrTarget: AdjDetail | null = null;
  attrForm: { collaborator: string; amount: number | null; note: string } = { collaborator: '', amount: null, note: '' };
  canAttributeLoss(): boolean { return this.auth.can('settings', 'edit'); }

  openAttribute(a: AdjDetail): void {
    this.attrTarget = a;
    this.attrForm = { collaborator: '', amount: null, note: '' };
    this.attrVisible = true;
  }

  saveAttribute(): void {
    const a = this.attrTarget;
    if (!a) return;
    this.busy.set(true);
    const body: Record<string, unknown> = { movementId: a.id, collaborator: this.attrForm.collaborator || undefined, amount: this.attrForm.amount ?? undefined, note: this.attrForm.note || undefined };
    this.http.post<ApiResponse<unknown>>(`${this.api}/reconciliation/attribute-loss`, body).subscribe({
      next: () => {
        this.busy.set(false); this.attrVisible = false;
        this.toast.add({ severity: 'success', summary: 'Pérdida atribuida', detail: 'El faltante quedó atribuido al colaborador.' });
        if (this.detailItem) this.openAjustes(this.detailItem);
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo atribuir la pérdida.' }); },
    });
  }

  openSalidas(it: KItem): void {
    this.detailItem = it; this.salDetail.set([]); this.salDetailVisible = true;
    const t = this.turn();
    const params: Record<string, string> = { productId: it.productId };
    if (t?.from) params['from'] = t.from;
    if (t?.to) params['to'] = t.to;
    this.http.get<ApiResponse<SalidaDetail[]>>(`${this.api}/products-cleaning/salidas-detail`, { params }).subscribe((r) => this.salDetail.set(r.data ?? []));
  }
}
