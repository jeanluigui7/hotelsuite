import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import { buildSaleReceipt } from '../../finance/tickets/receipt';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';

interface Pay { method: 'CASH' | 'CARD' | 'TRANSFER' | 'YAPE' | 'PLIN' | 'WALLET'; amount: number; reference?: string; }

const METHODS = [
  { label: 'Efectivo', value: 'CASH' },
  { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' },
  { label: 'Yape', value: 'YAPE' },
  { label: 'Plin', value: 'PLIN' },
];
const DOC_TYPES = [
  { label: 'DNI', value: 'DNI' },
  { label: 'CE', value: 'CE' },
  { label: 'Pasaporte', value: 'Pasaporte' },
];

@Component({
  selector: 'app-venta-productos',
  standalone: true,
  imports: [DecimalPipe, FormsModule, DialogModule, SelectModule, InputNumberModule, InputTextModule, ButtonModule, ToggleSwitchModule],
  template: `
    <p-dialog [(visible)]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" header="Venta de Productos"
              [style]="{ width: '64rem', maxWidth: '96vw' }" styleClass="dk-dialog" (onShow)="load()">
      <p class="sub">Selecciona los productos de recepción disponibles en stock para la venta.</p>
      <div class="grid">
        <!-- Izquierda: cliente + pago -->
        <div class="client">
          <h4>Tipo de Cliente</h4>
          <label class="radio"><input type="radio" name="ct" value="ROOM" [(ngModel)]="clientType" (ngModelChange)="onClientTypeChange()" /> Asociar a habitación ocupada</label>
          <label class="radio"><input type="radio" name="ct" value="EXTERNAL" [(ngModel)]="clientType" (ngModelChange)="onClientTypeChange()" /> Cliente Externo</label>

          @if (clientType === 'ROOM') {
            <div class="field">
              <label>Habitación ocupada</label>
              <p-select [options]="stays()" [(ngModel)]="stayId" optionValue="id" [filter]="true" filterBy="room.number" placeholder="Selecciona habitación" styleClass="w">
                <ng-template let-s pTemplate="item">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
                <ng-template let-s pTemplate="selectedItem">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
              </p-select>
            </div>
          } @else {
            <div class="ext">
              <div class="ext-title"><i class="pi pi-id-card"></i> Venta Directa (Identificada)</div>
              <div class="seg2">
                <button [class.on]="idMode === 'DOC'" (click)="idMode = 'DOC'"><i class="pi pi-id-card"></i> Documento</button>
                <button [class.on]="idMode === 'PLATE'" (click)="idMode = 'PLATE'"><i class="pi pi-car"></i> Placa Vehicular</button>
              </div>
              @if (idMode === 'DOC') {
                <label>Tipo de Documento</label>
                <p-select [options]="docTypes" [(ngModel)]="docType" optionLabel="label" optionValue="value" styleClass="w" />
                <label>Número de Documento</label>
                <input pInputText [(ngModel)]="docNumber" placeholder="12345678" />
              } @else {
                <label>Placa Vehicular</label>
                <input pInputText [(ngModel)]="plate" placeholder="ABC-123" style="text-transform:uppercase" />
              }
              <label>Nombre</label>
              <input pInputText [(ngModel)]="customerName" placeholder="Nombre del cliente" />
            </div>
          }

          <div class="total">Total a cobrar <strong>{{ total() | number: '1.2-2' }}</strong></div>

          <!-- Tipo de Cobro (parcial/adeudo solo para habitación: el saldo va a la deuda del folio). -->
          @if (clientType === 'ROOM') {
            <div class="cobro-lbl">Tipo de Cobro</div>
            <div class="cobro-seg">
              <button [class.on]="cobro === 'TOTAL'" (click)="setCobro('TOTAL')"><i class="pi pi-check-circle"></i> Pago Total</button>
              <button [class.on]="cobro === 'PARCIAL'" (click)="setCobro('PARCIAL')"><i class="pi pi-hourglass"></i> Parcial</button>
              <button [class.on]="cobro === 'ADEUDO'" (click)="setCobro('ADEUDO')"><i class="pi pi-ban"></i> Adeudo</button>
            </div>
          }

          @if (cobro !== 'ADEUDO') {
            <div class="pays">
              <div class="pays-head"><span>{{ cobro === 'PARCIAL' ? 'Pago inicial' : 'Método de pago' }}</span><button class="addpay" (click)="addPay()"><i class="pi pi-plus"></i> Añadir</button></div>
              @for (p of pays(); track $index; let i = $index) {
                <div class="payrow">
                  <p-select [options]="methods" [(ngModel)]="p.method" (onChange)="onMethodChange(p)" optionLabel="label" optionValue="value" styleClass="w sm" />
                  <p-inputNumber [(ngModel)]="p.amount" mode="decimal" [minFractionDigits]="2" [min]="0" placeholder="Monto" inputStyleClass="amt" [class.err]="!(p.amount > 0)" />
                  <button class="del" (click)="removePay(i)"><i class="pi pi-times"></i></button>
                </div>
                @if (needsRef(p.method)) {
                  <div class="payref">
                    <i class="pi pi-hashtag"></i>
                    <input pInputText [(ngModel)]="p.reference" placeholder="Código de confirmación / N° de operación (opcional)" />
                  </div>
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
              @if (cobro === 'PARCIAL' && saldo() > 0) { <div class="saldo"><i class="pi pi-wallet"></i> Saldo a deuda del folio: <b>S/ {{ saldo() | number: '1.2-2' }}</b></div> }
              @if (payError()) { <p class="pay-err"><i class="pi pi-exclamation-triangle"></i> {{ payError() }}</p> }
            </div>
          } @else {
            <div class="adeudo-note"><i class="pi pi-info-circle"></i> Todo el monto (<b>S/ {{ total() | number: '1.2-2' }}</b>) quedará como <b>deuda</b> en el folio de la habitación. Se cobra al hacer el check-out.</div>
          }

          <!-- Generar Comprobante electrónico -->
          <div class="comp">
            <div class="comp-head">
              <p-toggleswitch [(ngModel)]="genComp" (onChange)="onGenComp()" />
              <span>Generar Comprobante</span>
            </div>
            @if (genComp) {
              <div class="comp-body">
                <div class="comp-t">Datos para comprobante electrónico</div>
                @if (clientType === 'ROOM' && stayId) { <label class="chk"><input type="checkbox" [(ngModel)]="compUseGuest" (change)="applyGuestData()" /> Usar los mismos datos del huésped</label> }
                <label>Tipo de Documento</label>
                <div class="seg2">
                  <button [class.on]="compDocType === 'DNI'" (click)="compDocType = 'DNI'"><i class="pi pi-id-card"></i> DNI (Boleta)</button>
                  <button [class.on]="compDocType === 'RUC'" (click)="compDocType = 'RUC'"><i class="pi pi-briefcase"></i> RUC (Factura)</button>
                </div>
                <label>Número de Documento</label>
                <input pInputText [(ngModel)]="compDocNumber" [readonly]="compUseGuest && clientType === 'ROOM' && !!stayId" placeholder="76418493" />
                <label>Nombre / Razón Social</label>
                <input pInputText [(ngModel)]="compName" [readonly]="compUseGuest && clientType === 'ROOM' && !!stayId" placeholder="Nombre o razón social" />
                <label>Dirección (Opcional)</label>
                <input pInputText [(ngModel)]="compAddress" placeholder="Dirección fiscal" />
                @if (compError()) { <p class="pay-err"><i class="pi pi-exclamation-triangle"></i> {{ compError() }}</p> }
              </div>
            }
          </div>
        </div>

        <!-- Derecha: catálogo en tabla -->
        <div class="catalog">
          <div class="cat-filters">
            <span class="search"><i class="pi pi-search"></i><input pInputText placeholder="Buscar por nombre o descripción" [(ngModel)]="search" /></span>
            <p-select [options]="categoryOptions()" [(ngModel)]="categoryFilter" placeholder="Todas" [showClear]="true" styleClass="w sm" />
          </div>
          <label class="lowstock"><p-toggleSwitch [(ngModel)]="lowStockOnly" /> Solo productos con bajo stock</label>
          <div class="tablewrap">
            <table class="ptbl">
              <thead><tr><th>Producto</th><th>Precio</th><th>Stock</th><th class="qc">Cant.</th><th>Subtotal</th></tr></thead>
              <tbody>
                @for (p of filteredProducts(); track p.id) {
                  <tr [class.low]="isLow(p)">
                    <td><div class="pn">{{ p.name }}</div>@if (p.category) { <div class="pc">Categoría: {{ p.category.name }}</div> }</td>
                    <td class="price">S/ {{ +p.salePrice | number: '1.2-2' }}</td>
                    <td><span class="stk" [class.low]="isLow(p)">Stock: {{ p.stock }}</span></td>
                    <td class="qc">
                      <div class="stepper">
                        <button (click)="dec(p)" [disabled]="(qty[p.id]||0) <= 0">-</button>
                        <span>{{ qty[p.id] || 0 }}</span>
                        <button (click)="inc(p)" [disabled]="(qty[p.id]||0) >= p.stock">+</button>
                      </div>
                    </td>
                    <td class="sub">S/ {{ (+p.salePrice) * (qty[p.id]||0) | number: '1.2-2' }}</td>
                  </tr>
                } @empty { <tr><td colspan="5" class="muted center">Sin productos.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="close()" />
        <p-button label="Procesar Venta" icon="pi pi-check" [disabled]="!canSubmit()" [loading]="saving()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      .sub { color: #8b97a8; margin: 0 0 1rem; font-size: 0.85rem; }
      .grid { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 1.1rem; min-height: 440px; }
      .muted { color: #8b97a8; } .center { text-align: center; }
      h4 { margin: 0 0 0.6rem; color: #fff; font-size: 0.95rem; }
      .client { background: #0b1119; border: 1px solid #1c2a3a; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
      .radio { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; cursor: pointer; }
      .field { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.4rem; }
      label { font-size: 0.8rem; color: #9fb0c3; margin-top: 0.3rem; }
      .ext { border: 1px solid #1f4e8a; border-radius: 10px; padding: 0.8rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .ext-title { color: #60a5fa; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; }
      .seg2 { display: flex; gap: 0.4rem; margin: 0.3rem 0; }
      .seg2 button { flex: 1; background: #131d2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.4rem; cursor: pointer; font-size: 0.8rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem; }
      .seg2 button.on { border-color: #3b82f6; color: #93c5fd; }
      :host ::ng-deep .w .p-select, :host ::ng-deep .client input[pInputText] { width: 100%; background: #131d2b; border-color: #243245; color: #e6e9ef; }
      .total { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1c2a3a; padding-top: 0.6rem; margin-top: 0.5rem; font-size: 1rem; }
      .total strong { color: #34d399; font-size: 1.2rem; }
      .pays-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      .addpay { background: transparent; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.8rem; }
      .payrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.4rem; align-items: center; margin-top: 0.4rem; }
      :host ::ng-deep .amt { width: 100%; }
      .del { background: transparent; border: 0; color: #f87171; cursor: pointer; }
      .payref { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.35rem; }
      .payref .pi { color: #8aa0bd; font-size: 0.8rem; }
      .payref input { flex: 1; background: #0f1a2b; border: 1px solid #1c2c44; color: #e6edf5; border-radius: 8px; padding: 0.5rem 0.7rem; font: inherit; font-size: 0.85rem; }
      .payref input.err { border-color: #ef4444; }
      :host ::ng-deep .payrow .err .p-inputnumber-input, :host ::ng-deep .payrow .err input { border-color: #ef4444 !important; }
      .paid { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #cdd8e6; margin-top: 0.6rem; border-top: 1px dashed #1c2a3a; padding-top: 0.5rem; }
      .paid b { color: #e6edf5; } .paid .vuelto.on b { color: #34d399; }
      .comm { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #f0b866; margin-top: 0.4rem; }
      .comm b { color: #f0b866; } .comm.total-comm { color: #e6edf5; font-weight: 700; border-top: 1px dashed #1c2a3a; padding-top: 0.4rem; } .comm.total-comm b { color: #34d399; font-size: 1.05rem; }
      .pay-hint { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #8aa0bd; margin: 0.4rem 0 0; }
      .pay-err { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #fca5a5; background: rgba(180,35,35,0.1); border: 1px solid rgba(180,35,35,0.35); border-radius: 8px; padding: 0.45rem 0.6rem; margin: 0.5rem 0 0; }
      .cobro-lbl { font-size: 0.8rem; color: #9fb0c3; margin: 0.7rem 0 0.3rem; font-weight: 600; }
      .cobro-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
      .cobro-seg button { background: #0f1a2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 9px; padding: 0.55rem 0.3rem; cursor: pointer; font-size: 0.8rem; font-weight: 700; display: inline-flex; flex-direction: column; align-items: center; gap: 0.2rem; }
      .cobro-seg button .pi { font-size: 0.95rem; }
      .cobro-seg button.on { background: rgba(16,185,129,0.14); border-color: #10b981; color: #34d399; }
      .saldo { margin-top: 0.5rem; font-size: 0.82rem; color: #fbbf24; display: flex; align-items: center; gap: 0.4rem; } .saldo b { color: #fff; }
      .adeudo-note { margin-top: 0.6rem; font-size: 0.82rem; color: #cdd8e6; background: rgba(180,35,35,0.1); border: 1px solid rgba(180,35,35,0.3); border-radius: 10px; padding: 0.7rem 0.8rem; display: flex; align-items: flex-start; gap: 0.45rem; } .adeudo-note .pi { color: #f87171; margin-top: 0.1rem; } .adeudo-note b { color: #fff; }
      .comp { margin-top: 0.9rem; border-top: 1px solid #1c2a3a; padding-top: 0.7rem; }
      .comp-head { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; color: #e6edf5; }
      .comp-body { margin-top: 0.7rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .comp-t { color: #34d399; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.2rem; }
      .comp-body label { font-size: 0.8rem; color: #9fb0c3; margin-top: 0.35rem; }
      .comp-body input[pInputText] { background: #0f1a2b; border: 1px solid #1c2c44; color: #e6edf5; border-radius: 8px; padding: 0.55rem 0.7rem; font: inherit; }
      .comp-body input[readonly] { opacity: 0.7; }
      .chk { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.85rem; color: #cdd8e6; cursor: pointer; margin-bottom: 0.2rem; }
      .comp .seg2 { display: flex; gap: 0.4rem; } .comp .seg2 button { flex: 1; background: #0f1a2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem; cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; } .comp .seg2 button.on { background: rgba(16,185,129,0.14); border-color: #10b981; color: #34d399; }

      .catalog { display: flex; flex-direction: column; gap: 0.6rem; }
      .cat-filters { display: flex; gap: 0.5rem; }
      .search { position: relative; flex: 1; }
      .search i { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .search input { width: 100%; background: #131d2b; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.55rem 0.7rem 0.55rem 2rem; }
      .lowstock { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: #9fb0c3; }
      .tablewrap { border: 1px solid #1c2a3a; border-radius: 10px; overflow: auto; max-height: 360px; }
      .ptbl { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .ptbl th { text-align: left; padding: 0.6rem 0.8rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1c2a3a; position: sticky; top: 0; background: #101a28; }
      .ptbl td { padding: 0.55rem 0.8rem; border-bottom: 1px solid #16202e; }
      .pn { font-weight: 600; } .pc { font-size: 0.72rem; color: #8b97a8; }
      .price { color: #cdd8e6; white-space: nowrap; }
      .stk { font-size: 0.78rem; color: #8b97a8; } .stk.low, tr.low .pn { color: #fbbf24; }
      .qc { text-align: center; } th.qc { text-align: center; }
      .stepper { display: inline-flex; align-items: center; gap: 0.3rem; }
      .stepper button { width: 1.7rem; height: 1.7rem; border-radius: 6px; border: 1px solid #243245; background: #131d2b; color: #e6e9ef; cursor: pointer; font-weight: 700; }
      .stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
      .stepper span { min-width: 1.4rem; text-align: center; }
      .sub { color: #34d399; font-weight: 600; white-space: nowrap; }
    `,
  ],
})
export class VentaProductosComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly inventory = inject(InventoryApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly finance = inject(FinanceApiService);
  // Comisiones POS (Configuración Operativa): recargo por método de pago.
  readonly commEnabled = signal(false);
  readonly posRates = signal<Record<string, number>>({});
  private readonly auth = inject(AuthService);
  private readonly printing = inject(PrintingService);
  private readonly toast = inject(MessageService);

  readonly products = signal<Product[]>([]);
  readonly stays = signal<(Stay & { label?: string })[]>([]);
  readonly pays = signal<Pay[]>([]);
  readonly saving = signal(false);

  readonly methods = METHODS;
  readonly docTypes = DOC_TYPES;
  clientType: 'EXTERNAL' | 'ROOM' = 'ROOM';
  idMode: 'DOC' | 'PLATE' = 'DOC';
  docType = 'DNI';
  docNumber = '';
  plate = '';
  stayId: string | null = null;
  customerName = '';
  // Tipo de cobro: pago total, parcial (queda saldo) o adeudo (todo a deuda de la habitación).
  cobro: 'TOTAL' | 'PARCIAL' | 'ADEUDO' = 'TOTAL';
  // Comprobante electrónico (al activar "Generar Comprobante").
  genComp = false;
  compUseGuest = true;
  compDocType: 'DNI' | 'RUC' = 'DNI';
  compDocNumber = '';
  compName = '';
  compAddress = '';
  search = '';
  categoryFilter: string | null = null;
  lowStockOnly = false;
  qty: Record<string, number> = {};
  private readonly qtyTick = signal(0);

  readonly categoryOptions = computed(() => [...new Set(this.products().map((p) => p.category?.name).filter((c): c is string => !!c))].sort());

  // Método (no computed) para que reaccione a búsqueda/categoría/bajo-stock (props no-signal).
  filteredProducts(): Product[] {
    const q = this.search.toLowerCase();
    return this.products().filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (this.categoryFilter && p.category?.name !== this.categoryFilter) return false;
      if (this.lowStockOnly && !this.isLow(p)) return false;
      return true;
    }).sort((a, b) => (a.sku ?? '').localeCompare(b.sku ?? '')); // orden por código, no alfabético
  }

  readonly total = computed(() => {
    void this.qtyTick();
    return this.products().reduce((a, p) => a + Number(p.salePrice) * (this.qty[p.id] || 0), 0);
  });
  readonly paid = computed(() => this.pays().reduce((a, p) => a + (p.amount || 0), 0));
  change = (): number => Math.max(0, this.paid() - this.total());

  /** Comisión POS estimada (recargo al cliente) según método(s) de pago. El backend recalcula el valor final. */
  rateFor(method: string): number { return this.commEnabled() ? (this.posRates()[method] ?? 0) : 0; }
  commission(): number { return Math.round(this.pays().reduce((a, p) => a + (p.amount || 0) * this.rateFor(p.method) / 100, 0) * 100) / 100; }
  grandTotal(): number { return Math.round((this.total() + this.commission()) * 100) / 100; }

  isLow(p: Product): boolean {
    return p.stock <= (p.reorderPoint ?? 0);
  }

  load(): void {
    this.pays.set([]); this.customerName = ''; this.stayId = null; this.clientType = 'ROOM';
    this.idMode = 'DOC'; this.docType = 'DNI'; this.docNumber = ''; this.plate = '';
    this.cobro = 'TOTAL'; this.genComp = false; this.compUseGuest = true; this.compDocType = 'DNI'; this.compDocNumber = ''; this.compName = ''; this.compAddress = '';
    this.search = ''; this.categoryFilter = null; this.lowStockOnly = false; this.qty = {};
    // Muestra el stock del almacén de RECEPCIÓN (lo que se puede vender aquí), no el general.
    this.inventory.products.list({ pageSize: 300, status: 'active', area: 'RECEPTION' }).subscribe((r) => this.products.set(r.data ?? []));
    this.ops.stays({ status: 'OPEN', pageSize: 200 }).subscribe((r) => this.stays.set(r.data ?? []));
    this.loadCommissions();
  }

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

  inc(p: Product): void { if ((this.qty[p.id] || 0) < p.stock) { this.qty[p.id] = (this.qty[p.id] || 0) + 1; this.qtyTick.update((v) => v + 1); } }
  dec(p: Product): void { if ((this.qty[p.id] || 0) > 0) { this.qty[p.id] = this.qty[p.id] - 1; this.qtyTick.update((v) => v + 1); } }

  addPay(): void { this.pays.set([...this.pays(), { method: 'CASH', amount: this.remaining() }]); }
  removePay(i: number): void { const n = [...this.pays()]; n.splice(i, 1); this.pays.set(n); }
  private remaining(): number { return Math.max(0, Math.round((this.total() - this.paid()) * 100) / 100); }

  private lines(): { productId: string; quantity: number }[] {
    return this.products().filter((p) => (this.qty[p.id] || 0) > 0).map((p) => ({ productId: p.id, quantity: this.qty[p.id] }));
  }

  /** Los pagos virtuales (no efectivo) requieren código/referencia para su rastreo. */
  needsRef(method: string): boolean { return method !== 'CASH'; }
  /** Al pasar a Efectivo se limpia la referencia (no aplica). */
  onMethodChange(p: Pay): void { if (p.method === 'CASH') p.reference = ''; this.pays.set([...this.pays()]); }

  /** Saldo que quedaría como deuda (parcial). */
  saldo(): number { return Math.max(0, Math.round((this.total() - this.paid()) * 100) / 100); }

  /** Cliente Externo no admite parcial/adeudo (no hay folio donde dejar la deuda). */
  onClientTypeChange(): void {
    if (this.clientType === 'EXTERNAL') { this.setCobro('TOTAL'); this.compUseGuest = false; }
    else this.compUseGuest = true;
  }

  setCobro(c: 'TOTAL' | 'PARCIAL' | 'ADEUDO'): void {
    this.cobro = c;
    if (c === 'ADEUDO') { this.pays.set([]); }
    else if (!this.pays().length) { this.pays.set([{ method: 'CASH', amount: c === 'TOTAL' ? this.total() : 0 }]); }
  }

  /** Al activar "Generar Comprobante", precarga los datos del huésped si aplica. */
  onGenComp(): void { if (this.genComp) this.applyGuestData(); }
  applyGuestData(): void {
    if (!(this.genComp && this.compUseGuest && this.clientType === 'ROOM' && this.stayId)) return;
    const s = this.stays().find((x) => x.id === this.stayId);
    if (!s) return;
    this.compName = `${s.guest.firstName} ${s.guest.lastName ?? ''}`.trim();
    this.compDocNumber = s.guest.documentNumber ?? '';
    this.compDocType = (s.guest.documentNumber ?? '').trim().length === 11 ? 'RUC' : 'DNI';
  }

  /** Validación del comprobante (vacío = ok o desactivado). */
  compError(): string {
    if (!this.genComp) return '';
    if (!this.compName.trim()) return 'Ingresa el nombre / razón social del comprobante.';
    if (!this.compDocNumber.trim()) return 'Ingresa el número de documento del comprobante.';
    if (this.compDocType === 'RUC' && this.compDocNumber.trim().length !== 11) return 'El RUC debe tener 11 dígitos.';
    return '';
  }

  /** Mensaje del primer problema con los pagos (vacío = todo correcto). */
  payError(): string {
    if (this.total() <= 0) return '';
    if (this.cobro === 'ADEUDO') return ''; // sin pago: todo a deuda del folio
    const ps = this.pays();
    if (!ps.length) return 'Agrega un método de pago para cobrar.';
    for (const p of ps) {
      if (!(p.amount > 0)) return 'Ingresa el monto de cada método de pago.';
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

  canSubmit(): boolean {
    if (this.saving() || this.lines().length === 0) return false;
    if (this.clientType === 'ROOM' && !this.stayId) return false;
    if (this.payError() !== '' || this.compError() !== '') return false;
    return true;
  }

  private externalName(): string {
    const name = this.customerName.trim() || 'Cliente externo';
    if (this.idMode === 'PLATE' && this.plate.trim()) return `${name} (Placa ${this.plate.trim().toUpperCase()})`;
    if (this.idMode === 'DOC' && this.docNumber.trim()) return `${name} (${this.docType} ${this.docNumber.trim()})`;
    return name;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    // Pagos registrados: topados al total (el efectivo de más es VUELTO, no se registra).
    // ADEUDO → sin pagos; PARCIAL → lo ingresado (< total, el saldo queda como deuda del folio).
    const recorded: { method: Pay['method']; amount: number; reference?: string }[] = [];
    if (this.cobro !== 'ADEUDO') {
      let remaining = this.total();
      for (const p of this.pays()) {
        if (!(p.amount > 0) || remaining <= 0) continue;
        const amt = Math.min(p.amount, remaining);
        recorded.push({ method: p.method, amount: Math.round(amt * 100) / 100, reference: p.reference?.trim() || undefined });
        remaining = Math.round((remaining - amt) * 100) / 100;
      }
    }
    this.finance.createSale({
      stayId: this.clientType === 'ROOM' ? this.stayId : null,
      customerName: this.clientType === 'EXTERNAL' ? this.externalName() : undefined,
      items: this.lines(),
      payments: recorded,
      sourceArea: 'RECEPTION',
    }).subscribe({
      next: (res) => {
        const sale = res.data;
        const finishOk = () => {
          this.saving.set(false);
          this.toast.add({ severity: 'success', summary: 'Venta registrada', detail: this.cobro === 'ADEUDO' ? 'Adeudo a la habitación · S/ ' + this.total().toFixed(2) : (this.cobro === 'PARCIAL' ? 'Pago parcial · saldo S/ ' + this.saldo().toFixed(2) : 'Total S/ ' + this.total().toFixed(2)) });
          if (sale) this.printing.printViaBrowser(buildSaleReceipt(sale, this.auth.activeBranch()?.name ?? 'RIZZOS'));
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
            error: (e: HttpErrorResponse) => {
              this.saving.set(false);
              this.toast.add({ severity: 'warn', summary: 'Venta registrada, comprobante NO emitido', detail: e.error?.error?.message ?? 'Revisa las series de folios o los permisos de facturación.' });
              this.done.emit();
              this.close();
            },
          });
        } else finishOk();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar la venta.' });
      },
    });
  }

  close(): void { this.visible = false; this.visibleChange.emit(false); }
}
