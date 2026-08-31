import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import { buildSaleReceipt } from '../../finance/tickets/receipt';
import type { Sale } from '../../finance/services/finance.models';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';

interface Article { key: string; name: string; unitPrice: number; productId?: string; stock?: number; }
interface Line { art: Article; quantity: number; }
interface Pay { method: 'CASH' | 'CARD' | 'TRANSFER' | 'YAPE' | 'PLIN' | 'WALLET'; amount: number; reference?: string; }
interface CatalogGroup { subcategory: string; services: { id: string; name: string; price: number | null }[]; }

const METHODS = [
  { label: 'Efectivo', value: 'CASH' }, { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' }, { label: 'Yape', value: 'YAPE' }, { label: 'Plin', value: 'PLIN' },
];

@Component({
  selector: 'app-servicios-penalidades',
  standalone: true,
  imports: [DecimalPipe, FormsModule, DialogModule, SelectModule, InputNumberModule, InputTextModule, ToggleSwitchModule, ButtonModule],
  template: `
    <p-dialog [(visible)]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" header="Servicios y Penalidades"
              [style]="{ width: '62rem', maxWidth: '95vw' }" styleClass="dk-dialog" (onShow)="load()">
      <div class="grid">
        <div class="left">
          <div class="field">
            <label>Habitación ocupada</label>
            <p-select [options]="stays()" [(ngModel)]="stayId" optionValue="id" [filter]="true" filterBy="label" placeholder="Selecciona habitación" styleClass="w">
              <ng-template let-s pTemplate="item">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
              <ng-template let-s pTemplate="selectedItem">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
            </p-select>
          </div>

          <label class="sec">Servicios y artículos</label>
          <div class="arts">
            @for (a of articles(); track a.key) {
              <button class="art" (click)="add(a)" [disabled]="a.stock !== undefined && a.stock <= 0">
                <span class="an">{{ a.name }}</span>
                <span class="ap">{{ a.unitPrice | number: '1.2-2' }}</span>
                @if (a.stock !== undefined) { <span class="as" [class.low]="a.stock <= 0">Stock: {{ a.stock }}</span> }
                @else { <span class="as svc">Servicio</span> }
              </button>
            } @empty { <p class="muted">Sin servicios ni artículos.</p> }
          </div>
        </div>

        <div class="right">
          <div class="lines">
            @for (l of lines(); track l.art.key; let i = $index) {
              <div class="line">
                <span class="ln">{{ l.art.name }}</span>
                <p-inputNumber [(ngModel)]="l.quantity" [min]="1" [showButtons]="true" buttonLayout="horizontal" inputStyleClass="qty" (onInput)="touch()" />
                <span class="lt">{{ l.art.unitPrice * l.quantity | number: '1.2-2' }}</span>
                <button class="del" (click)="rm(i)"><i class="pi pi-times"></i></button>
              </div>
            } @empty { <p class="muted center">Agrega servicios o artículos.</p> }
          </div>

          <div class="total">Total a cobrar <strong>{{ total() | number: '1.2-2' }}</strong></div>

          <div class="cobro-lbl">Tipo de Cobro</div>
          <div class="cobro-seg">
            <button [class.on]="cobro === 'TOTAL'" (click)="setCobro('TOTAL')"><i class="pi pi-check-circle"></i> Pago Total</button>
            <button [class.on]="cobro === 'PARCIAL'" (click)="setCobro('PARCIAL')"><i class="pi pi-hourglass"></i> Parcial</button>
            <button [class.on]="cobro === 'ADEUDO'" (click)="setCobro('ADEUDO')"><i class="pi pi-ban"></i> Adeudo</button>
          </div>

          @if (cobro !== 'ADEUDO') {
            <div class="pays">
              <div class="pays-head"><span>{{ cobro === 'PARCIAL' ? 'Pago inicial' : 'Métodos de pago' }}</span><button class="addpay" (click)="addPay()"><i class="pi pi-plus"></i> Añadir</button></div>
              @for (p of pays(); track $index; let i = $index) {
                <div class="payrow">
                  <p-select [options]="methods" [(ngModel)]="p.method" (onChange)="onMethodChange(p)" optionLabel="label" optionValue="value" styleClass="w sm" />
                  <p-inputNumber [(ngModel)]="p.amount" mode="decimal" [minFractionDigits]="2" [min]="0" placeholder="Monto" inputStyleClass="amt" [class.err]="!(p.amount > 0)" />
                  <button class="del" (click)="rmPay(i)"><i class="pi pi-times"></i></button>
                </div>
                @if (needsRef(p.method)) {
                  <div class="payref"><i class="pi pi-hashtag"></i><input pInputText [(ngModel)]="p.reference" placeholder="Código de verificación / N° de operación (obligatorio)" /></div>
                }
              }
              @if (!pays().length) { <p class="pay-hint"><i class="pi pi-info-circle"></i> Agrega un método de pago para poder cobrar.</p> }
              @if (commission() > 0) {
                <div class="comm"><span><i class="pi pi-percentage"></i> Comisión POS</span><b>+S/ {{ commission() | number: '1.2-2' }}</b></div>
                <div class="comm total-comm"><span>Total a cobrar (con comisión)</span><b>S/ {{ grandTotal() | number: '1.2-2' }}</b></div>
              }
              <div class="paid">
                <span>Pagado: <b>S/ {{ paid() | number: '1.2-2' }}</b></span>
                <span class="vuelto" [class.on]="change() > 0">Vuelto: <b>S/ {{ change() | number: '1.2-2' }}</b></span>
              </div>
              @if (cobro === 'PARCIAL' && owed() > 0) { <div class="saldo"><i class="pi pi-wallet"></i> Saldo a deuda del folio: <b>S/ {{ owed() | number: '1.2-2' }}</b></div> }
              @if (payError()) { <p class="pay-err"><i class="pi pi-exclamation-triangle"></i> {{ payError() }}</p> }
            </div>
          } @else {
            <div class="adeudo-note"><i class="pi pi-info-circle"></i> Todo el total (<b>S/ {{ total() | number: '1.2-2' }}</b>) quedará como <strong>adeudo</strong> de la habitación.</div>
          }

          <div class="switch"><p-toggleswitch [(ngModel)]="createSupply" /> <span>Generar suministro pendiente (entrega por limpieza)</span></div>

          <!-- Generar Comprobante electrónico -->
          <div class="comp">
            <div class="comp-head"><p-toggleswitch [(ngModel)]="genComp" (onChange)="onGenComp()" /> <span>Generar Comprobante</span></div>
            @if (genComp) {
              <div class="comp-body">
                <div class="comp-t">Datos para comprobante electrónico</div>
                @if (stayId) { <label class="chk"><input type="checkbox" [(ngModel)]="compUseGuest" (change)="applyGuestData()" /> Usar los mismos datos del huésped</label> }
                <label>Tipo de Documento</label>
                <div class="seg2">
                  <button [class.on]="compDocType === 'DNI'" (click)="compDocType = 'DNI'"><i class="pi pi-id-card"></i> DNI (Boleta)</button>
                  <button [class.on]="compDocType === 'RUC'" (click)="compDocType = 'RUC'"><i class="pi pi-briefcase"></i> RUC (Factura)</button>
                </div>
                <label>Número de Documento</label>
                <input pInputText [(ngModel)]="compDocNumber" [readonly]="compUseGuest && !!stayId" placeholder="76418493" />
                <label>Nombre / Razón Social</label>
                <input pInputText [(ngModel)]="compName" [readonly]="compUseGuest && !!stayId" placeholder="Nombre o razón social" />
                <label>Dirección (Opcional)</label>
                <input pInputText [(ngModel)]="compAddress" placeholder="Dirección fiscal" />
                @if (compError()) { <p class="pay-err"><i class="pi pi-exclamation-triangle"></i> {{ compError() }}</p> }
              </div>
            }
          </div>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="close()" />
        <p-button label="Procesar Cobro" icon="pi pi-check" [disabled]="!canSubmit()" [loading]="saving()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; min-height: 430px; }
      .muted { color: #8b97a8; } .center { text-align: center; }
      .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.7rem; }
      label { font-size: 0.8rem; color: #9fb0c3; } .sec { display: block; margin: 0.4rem 0; }
      :host ::ng-deep .w .p-select { width: 100%; background: #131d2b; border-color: #243245; }
      .arts { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px,1fr)); gap: 0.5rem; max-height: 320px; overflow-y: auto; }
      .art { background: #131d2b; border: 1px solid #243245; border-radius: 10px; padding: 0.6rem; cursor: pointer; display: flex; flex-direction: column; gap: 0.15rem; text-align: left; color: #e6e9ef; }
      .art:hover:not(:disabled) { border-color: #ec4899; } .art:disabled { opacity: 0.45; }
      .an { font-weight: 600; font-size: 0.82rem; } .ap { color: #34d399; font-weight: 700; } .as { font-size: 0.7rem; color: #8b97a8; } .as.low { color: #f87171; } .as.svc { color: #f0a; }
      .right { background: #0b1119; border: 1px solid #1c2a3a; border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem; }
      .lines { display: flex; flex-direction: column; gap: 0.4rem; max-height: 150px; overflow-y: auto; }
      .line { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 0.5rem; }
      .ln { font-size: 0.85rem; } .lt { font-weight: 600; min-width: 4rem; text-align: right; }
      .del { background: transparent; border: 0; color: #f87171; cursor: pointer; }
      .total { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1c2a3a; padding-top: 0.5rem; }
      .total strong { color: #34d399; font-size: 1.2rem; }
      .pays-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #9fb0c3; }
      .addpay { background: transparent; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.8rem; }
      .payrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.4rem; align-items: center; margin-top: 0.4rem; }
      :host ::ng-deep .payrow .err .p-inputnumber-input, :host ::ng-deep .payrow .err input { border-color: #ef4444 !important; }
      .payref { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.35rem; }
      .payref .pi { color: #8aa0bd; font-size: 0.8rem; }
      .payref input { flex: 1; background: #0f1a2b; border: 1px solid #1c2c44; color: #e6edf5; border-radius: 8px; padding: 0.5rem 0.7rem; font: inherit; font-size: 0.85rem; }
      .paid { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #cdd8e6; margin-top: 0.5rem; border-top: 1px dashed #1c2a3a; padding-top: 0.5rem; } .paid b { color: #e6edf5; } .paid .vuelto.on b { color: #34d399; }
      .comm { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #f0b866; margin-top: 0.4rem; } .comm b { color: #f0b866; } .comm.total-comm { color: #e6edf5; font-weight: 700; border-top: 1px dashed #1c2a3a; padding-top: 0.4rem; } .comm.total-comm b { color: #34d399; font-size: 1.05rem; }
      .saldo { margin-top: 0.4rem; font-size: 0.82rem; color: #fbbf24; display: flex; align-items: center; gap: 0.4rem; } .saldo b { color: #fff; }
      .pay-hint { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #8aa0bd; margin: 0.4rem 0 0; }
      .pay-err { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #fca5a5; background: rgba(180,35,35,0.1); border: 1px solid rgba(180,35,35,0.35); border-radius: 8px; padding: 0.45rem 0.6rem; margin: 0.5rem 0 0; }
      .cobro-lbl { font-size: 0.8rem; color: #9fb0c3; margin: 0.7rem 0 0.3rem; font-weight: 600; }
      .cobro-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
      .cobro-seg button { background: #0f1a2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 9px; padding: 0.55rem 0.3rem; cursor: pointer; font-size: 0.8rem; font-weight: 700; display: inline-flex; flex-direction: column; align-items: center; gap: 0.2rem; }
      .cobro-seg button .pi { font-size: 0.95rem; }
      .cobro-seg button.on { background: rgba(16,185,129,0.14); border-color: #10b981; color: #34d399; }
      .adeudo-note { background: #2a1d12; border: 1px solid #6b4f2a; color: #fbbf24; padding: 0.5rem 0.7rem; border-radius: 8px; font-size: 0.82rem; } .adeudo-note b { color: #fff; }
      .switch { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: #cdd8e6; margin-top: 0.5rem; }
      .comp { margin-top: 0.8rem; border-top: 1px solid #1c2a3a; padding-top: 0.7rem; }
      .comp-head { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; color: #e6edf5; }
      .comp-body { margin-top: 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .comp-t { color: #34d399; font-weight: 700; font-size: 0.85rem; }
      .comp-body label { font-size: 0.8rem; color: #9fb0c3; margin-top: 0.3rem; }
      .comp-body input[pInputText] { background: #0f1a2b; border: 1px solid #1c2c44; color: #e6edf5; border-radius: 8px; padding: 0.55rem 0.7rem; font: inherit; }
      .comp-body input[readonly] { opacity: 0.7; }
      .chk { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.85rem; color: #cdd8e6; cursor: pointer; }
      .comp .seg2 { display: flex; gap: 0.4rem; } .comp .seg2 button { flex: 1; background: #0f1a2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem; cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; } .comp .seg2 button.on { background: rgba(16,185,129,0.14); border-color: #10b981; color: #34d399; }
    `,
  ],
})
export class ServiciosPenalidadesComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly inventory = inject(InventoryApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly printing = inject(PrintingService);
  private readonly finance = inject(FinanceApiService);
  private readonly toast = inject(MessageService);

  readonly stays = signal<(Stay & { label?: string })[]>([]);
  readonly articles = signal<Article[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly pays = signal<Pay[]>([]);
  readonly saving = signal(false);

  readonly methods = METHODS;
  readonly cobroTypes = [
    { label: 'Pago Total', value: 'TOTAL' },
    { label: 'Pago Parcial', value: 'PARCIAL' },
    { label: 'Adeudo', value: 'ADEUDO' },
  ];
  cobro: 'TOTAL' | 'PARCIAL' | 'ADEUDO' = 'TOTAL';
  stayId: string | null = null;
  createSupply = true;
  // Comprobante electrónico
  genComp = false;
  compUseGuest = true;
  compDocType: 'DNI' | 'RUC' = 'DNI';
  compDocNumber = '';
  compName = '';
  compAddress = '';

  readonly total = computed(() => this.lines().reduce((a, l) => a + l.art.unitPrice * l.quantity, 0));
  readonly paid = computed(() => this.pays().reduce((a, p) => a + (p.amount || 0), 0));
  owed = () => Math.max(0, Math.round((this.total() - this.paid()) * 100) / 100);
  change = (): number => Math.max(0, Math.round((this.paid() - this.total()) * 100) / 100);

  // Comisiones POS (Configuración Operativa): recargo por método de pago; el backend recalcula el valor final.
  readonly commEnabled = signal(false);
  readonly posRates = signal<Record<string, number>>({});
  rateFor(method: string): number { return this.commEnabled() ? (this.posRates()[method] ?? 0) : 0; }
  commission(): number { return Math.round(this.pays().reduce((a, p) => a + (p.amount || 0) * this.rateFor(p.method) / 100, 0) * 100) / 100; }
  grandTotal(): number { return Math.round((this.total() + this.commission()) * 100) / 100; }
  private loadCommissions(): void {
    this.http.get<ApiResponse<{ commissionsEnabled: boolean; pos: Record<string, { enabled: boolean; pct: number }> }>>(`${this.api}/operations-config`).subscribe((res) => {
      const c = res.data;
      this.commEnabled.set(!!c?.commissionsEnabled);
      const pos = c?.pos ?? {};
      const card = pos['credit']?.enabled ? pos['credit'] : pos['debit'];
      this.posRates.set({
        TRANSFER: pos['transfer']?.enabled ? pos['transfer'].pct : 0,
        YAPE: pos['yape']?.enabled ? pos['yape'].pct : 0,
        PLIN: pos['plin']?.enabled ? pos['plin'].pct : 0,
        CARD: card?.enabled ? card.pct : 0,
      });
    });
  }

  needsRef(method: string): boolean { return method !== 'CASH'; }
  onMethodChange(p: Pay): void { if (p.method === 'CASH') p.reference = ''; this.pays.set([...this.pays()]); }

  onGenComp(): void { if (this.genComp) this.applyGuestData(); }
  applyGuestData(): void {
    if (!(this.genComp && this.compUseGuest && this.stayId)) return;
    const s = this.stays().find((x) => x.id === this.stayId);
    if (!s) return;
    this.compName = `${s.guest.firstName} ${s.guest.lastName ?? ''}`.trim();
    this.compDocNumber = s.guest.documentNumber ?? '';
    this.compDocType = (s.guest.documentNumber ?? '').trim().length === 11 ? 'RUC' : 'DNI';
  }
  compError(): string {
    if (!this.genComp) return '';
    if (!this.compName.trim()) return 'Ingresa el nombre / razón social del comprobante.';
    if (!this.compDocNumber.trim()) return 'Ingresa el número de documento del comprobante.';
    if (this.compDocType === 'RUC' && this.compDocNumber.trim().length !== 11) return 'El RUC debe tener 11 dígitos.';
    return '';
  }
  payError(): string {
    if (this.total() <= 0) return '';
    if (this.cobro === 'ADEUDO') return '';
    const ps = this.pays();
    if (!ps.length) return 'Agrega un método de pago para cobrar.';
    for (const p of ps) {
      if (!(p.amount > 0)) return 'Ingresa el monto de cada método de pago.';
      if (this.needsRef(p.method) && !(p.reference?.trim())) return 'Ingresa el código de verificación de los pagos con Yape, Plin, Transferencia o Tarjeta.';
    }
    const paid = this.paid();
    const total = this.total();
    if (this.cobro === 'TOTAL' && paid + 0.001 < total) return `El pago no cubre el total (faltan S/ ${(total - paid).toFixed(2)}).`;
    if (this.cobro === 'PARCIAL') {
      if (paid <= 0) return 'Ingresa el pago inicial.';
      if (paid > total + 0.001) return 'El pago parcial no puede superar el total (usa Pago Total).';
    }
    return '';
  }

  load(): void {
    this.lines.set([]); this.pays.set([]); this.stayId = null; this.cobro = 'TOTAL'; this.createSupply = true;
    this.genComp = false; this.compUseGuest = true; this.compDocType = 'DNI'; this.compDocNumber = ''; this.compName = ''; this.compAddress = '';
    this.loadCommissions();
    this.ops.stays({ status: 'OPEN', pageSize: 200 }).subscribe((r) => this.stays.set(r.data ?? []));
    // Catálogo de servicios + productos como artículos cobrables
    this.http.get<ApiResponse<CatalogGroup[]>>(`${this.api}/services/catalog`).subscribe((res) => {
      const svc: Article[] = (res.data ?? []).flatMap((g) =>
        g.services.map((s) => ({ key: 's-' + s.id, name: s.name, unitPrice: s.price ?? 0 })),
      );
      this.inventory.products.list({ pageSize: 300, status: 'active' }).subscribe((pr) => {
        const prods: Article[] = (pr.data ?? []).map((p: Product) => ({
          key: 'p-' + p.id, name: p.name, unitPrice: Number(p.salePrice), productId: p.id, stock: p.stock,
        }));
        this.articles.set([...svc, ...prods]);
      });
    });
  }

  add(a: Article): void {
    const ex = this.lines().find((l) => l.art.key === a.key);
    if (ex) { ex.quantity += 1; this.lines.set([...this.lines()]); }
    else this.lines.set([...this.lines(), { art: a, quantity: 1 }]);
  }
  rm(i: number): void { const n = [...this.lines()]; n.splice(i, 1); this.lines.set(n); }
  touch(): void { this.lines.set([...this.lines()]); }
  addPay(): void { this.pays.set([...this.pays(), { method: 'CASH', amount: this.owed() }]); }
  rmPay(i: number): void { const n = [...this.pays()]; n.splice(i, 1); this.pays.set(n); }

  setCobro(c: 'TOTAL' | 'PARCIAL' | 'ADEUDO'): void { this.cobro = c; this.onCobro(); }
  onCobro(): void {
    if (this.cobro === 'ADEUDO') this.pays.set([]);
    else if (this.cobro === 'TOTAL') this.pays.set([{ method: 'CASH', amount: this.total() }]);
    else if (this.pays().length === 0) this.pays.set([{ method: 'CASH', amount: 0 }]);
  }

  canSubmit(): boolean {
    return !this.saving() && !!this.stayId && this.lines().length > 0 && this.payError() === '' && this.compError() === '';
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    const items = this.lines().map((l) =>
      l.art.productId
        ? { productId: l.art.productId, quantity: l.quantity }
        : { description: l.art.name, unitPrice: l.art.unitPrice, quantity: l.quantity },
    );
    // Pagos topados al total (el efectivo de más es vuelto, no se registra).
    const payments: { method: Pay['method']; amount: number; reference?: string }[] = [];
    if (this.cobro !== 'ADEUDO') {
      let remaining = this.total();
      for (const p of this.pays()) {
        if (!(p.amount > 0) || remaining <= 0) continue;
        const amt = Math.min(p.amount, remaining);
        payments.push({ method: p.method, amount: Math.round(amt * 100) / 100, reference: p.reference?.trim() || undefined });
        remaining = Math.round((remaining - amt) * 100) / 100;
      }
    }
    this.http.post<ApiResponse<{ sale: Sale; owed: number }>>(`${this.api}/services/charge`, {
      stayId: this.stayId, items, payments, createSupply: this.createSupply,
    }).subscribe({
      next: (res) => {
        const sale = res.data?.sale;
        const finishOk = () => {
          this.saving.set(false);
          this.toast.add({ severity: 'success', summary: 'Cobro procesado', detail: 'Adeudo: S/ ' + (res.data?.owed ?? 0).toFixed(2) });
          if (sale) this.printing.printViaBrowser(buildSaleReceipt(sale, this.auth.activeBranch()?.name ?? 'HotelSuite'));
          this.done.emit();
          this.close();
        };
        if (this.genComp && sale) {
          this.finance.issueInvoice({
            saleId: sale.id,
            type: this.compDocType === 'DNI' ? 'BOLETA' : 'FACTURA',
            customerName: this.compName.trim(),
            customerDoc: this.compDocNumber.trim(),
            customerAddress: this.compAddress.trim() || undefined,
          }).subscribe({
            next: () => finishOk(),
            error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'warn', summary: 'Cobro procesado, comprobante NO emitido', detail: e.error?.error?.message ?? 'Revisa las series de folios o los permisos de facturación.' }); this.done.emit(); this.close(); },
          });
        } else finishOk();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo procesar el cobro.' });
      },
    });
  }

  close(): void { this.visible = false; this.visibleChange.emit(false); }
}
