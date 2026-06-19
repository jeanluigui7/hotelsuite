import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { ClientTier, Guest, Rate } from '../../settings/catalogs/catalog.models';
import { DOCUMENT_TYPE_OPTIONS } from '../../settings/catalogs/catalog.constants';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import { OperationsApiService } from '../services/operations-api.service';
import type { CheckInInput, NewGuestInput, RoomMapItem, Stay } from '../services/operations.models';

type Tab = 'huesped' | 'adicionales' | 'venta' | 'pago';
interface Pay { method: 'CASH' | 'CARD' | 'TRANSFER' | 'WALLET'; amount: number; }

const METHODS = [
  { label: 'Efectivo', value: 'CASH' }, { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' }, { label: 'Yape/Plin', value: 'WALLET' },
];

@Component({
  selector: 'app-check-in-dialog',
  standalone: true,
  imports: [
    DecimalPipe, FormsModule, ButtonModule, DialogModule, InputTextModule,
    InputNumberModule, MultiSelectModule, SelectModule, SelectButtonModule, ToggleSwitchModule,
  ],
  template: `
    <p-dialog
      [visible]="visible"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [style]="{ width: '760px', maxWidth: '96vw' }"
      [header]="'Check-in · Habitación ' + (room?.number ?? '')"
      styleClass="ci-dialog"
    >
      <!-- Pestañas -->
      <div class="tabs">
        <button [class.on]="tab() === 'huesped'" (click)="tab.set('huesped')">Datos del Huésped</button>
        <button [class.on]="tab() === 'adicionales'" (click)="tab.set('adicionales')">Huéspedes Adicionales</button>
        <button [class.on]="tab() === 'venta'" (click)="tab.set('venta')">Venta Productos (Opcional)</button>
        <button [class.on]="tab() === 'pago'" (click)="tab.set('pago')">Métodos de Pago</button>
      </div>

      <!-- TAB: Datos del huésped -->
      @if (tab() === 'huesped') {
        <div class="form">
          <p-selectButton [options]="guestModeOptions" optionLabel="label" optionValue="value" [(ngModel)]="guestMode" [allowEmpty]="false" />
          @if (guestMode === 'existing') {
            <label>Buscar cliente</label>
            <div class="search-row">
              <input pInputText placeholder="Nombre o documento…" [(ngModel)]="guestSearch" (keyup.enter)="searchGuests()" />
              <p-button icon="pi pi-search" (onClick)="searchGuests()" />
            </div>
            <p-select [options]="guestResults()" [(ngModel)]="selectedGuestId" optionValue="id" [filter]="false" placeholder="Seleccionar cliente" styleClass="w-full">
              <ng-template let-g pTemplate="item">{{ g.firstName }} {{ g.lastName }} · {{ g.documentNumber }}</ng-template>
              <ng-template let-g pTemplate="selectedItem">{{ g.firstName }} {{ g.lastName }} · {{ g.documentNumber }}</ng-template>
            </p-select>
          } @else {
            <div class="row">
              <div class="col"><label>Tipo doc.</label><p-select [options]="docTypes" optionLabel="label" optionValue="value" [(ngModel)]="newGuest.documentType" styleClass="w-full" /></div>
              <div class="col"><label>Número</label><input pInputText [(ngModel)]="newGuest.documentNumber" /></div>
            </div>
            <div class="row">
              <div class="col"><label>Nombres</label><input pInputText [(ngModel)]="newGuest.firstName" /></div>
              <div class="col"><label>Apellidos</label><input pInputText [(ngModel)]="newGuest.lastName" /></div>
            </div>
            <div class="row">
              <div class="col"><label>Teléfono</label><input pInputText [(ngModel)]="newGuest.phone" /></div>
              <div class="col"><label>Email</label><input pInputText type="email" [(ngModel)]="newGuest.email" /></div>
            </div>
          }

          <h3>Tarifa y estancia</h3>
          <div class="row">
            <div class="col">
              <label>Tarifa</label>
              <p-select [options]="rates()" [(ngModel)]="selectedRateId" optionValue="id" (onChange)="recalc()" placeholder="Seleccionar tarifa" styleClass="w-full">
                <ng-template let-r pTemplate="item">{{ r.label }} · {{ r.durationMinutes }} min · {{ r.price }}</ng-template>
                <ng-template let-r pTemplate="selectedItem">{{ r.label }} · {{ r.price }}</ng-template>
              </p-select>
            </div>
            <div class="col"><label>Tier (opcional)</label><p-select [options]="tiers()" optionLabel="name" optionValue="id" [(ngModel)]="selectedTierId" [showClear]="true" (onChange)="recalc()" placeholder="Sin tier" styleClass="w-full" /></div>
          </div>
          <div class="row">
            <div class="col"><label>Adultos</label><p-inputNumber [(ngModel)]="adults" [min]="1" styleClass="w-full" /></div>
            <div class="col"><label>Niños</label><p-inputNumber [(ngModel)]="children" [min]="0" styleClass="w-full" /></div>
          </div>
          <label>Placa de vehículo (opcional)</label>
          <input pInputText [(ngModel)]="vehiclePlate" placeholder="Ej. ABC-123" style="text-transform: uppercase;" />
          <label>Notas</label>
          <input pInputText [(ngModel)]="notes" />
          @if (pricePreview() !== null) {
            <div class="price">Precio acordado: <strong>{{ pricePreview() | number: '1.2-2' }}</strong>
              @if (selectedTierId) { <span class="muted">(tarifa con descuento de tier)</span> }</div>
          }
        </div>
      }

      <!-- TAB: Huéspedes adicionales -->
      @if (tab() === 'adicionales') {
        <div class="form">
          <label>Huéspedes adicionales (opcional)</label>
          <p-multiSelect [options]="guestResults()" optionValue="id" [(ngModel)]="additionalGuestIds" placeholder="Buscar arriba y seleccionar" styleClass="w-full">
            <ng-template let-g pTemplate="item">{{ g.firstName }} {{ g.lastName }}</ng-template>
          </p-multiSelect>
          <p class="muted">Busca clientes en la pestaña "Datos del Huésped" para que aparezcan aquí.</p>
        </div>
      }

      <!-- TAB: Venta de productos (opcional) -->
      @if (tab() === 'venta') {
        <div class="venta">
          <div class="vleft">
            <h4>Productos Disponibles</h4>
            <div class="vfilters">
              <span class="search"><i class="pi pi-search"></i><input pInputText placeholder="Buscar producto…" [(ngModel)]="prodSearch" /></span>
              <p-select [options]="categoryOptions()" [(ngModel)]="categoryFilter" placeholder="Todas" [showClear]="true" styleClass="w sm" />
            </div>
            <div class="plist">
              @for (p of filteredProducts(); track p.id) {
                <button class="pcard" (click)="addProduct(p)" [disabled]="p.stock <= 0">
                  <span class="pn">{{ p.name }} @if (p.category) { <small>· {{ p.category.name }}</small> }</span>
                  <span class="pp">S/ {{ +p.salePrice | number: '1.2-2' }} <small [class.low]="p.stock <= 0">Stock: {{ p.stock }}</small></span>
                </button>
              } @empty { <p class="muted">Sin productos.</p> }
            </div>
          </div>
          <div class="vright">
            <h4>Productos Seleccionados</h4>
            <table class="seltbl">
              <thead><tr><th>Producto</th><th>Cant.</th><th>P.Unit</th><th>Subtotal</th><th></th></tr></thead>
              <tbody>
                @for (l of lines(); track l.product.id) {
                  <tr>
                    <td>{{ l.product.name }}</td>
                    <td><p-inputNumber [(ngModel)]="l.quantity" [min]="1" [max]="l.product.stock" [showButtons]="true" buttonLayout="horizontal" inputStyleClass="qy" (onInput)="touch()" /></td>
                    <td>S/ {{ +l.product.salePrice | number: '1.2-2' }}</td>
                    <td>S/ {{ +l.product.salePrice * l.quantity | number: '1.2-2' }}</td>
                    <td><button class="elim" (click)="removeLine(l.product.id)">Eliminar</button></td>
                  </tr>
                } @empty { <tr><td colspan="5" class="muted center">Agrega productos del inventario.</td></tr> }
              </tbody>
            </table>
            <div class="vtotal">Total: <strong>S/ {{ productsTotal() | number: '1.2-2' }}</strong></div>
          </div>
        </div>
      }

      <!-- TAB: Métodos de pago -->
      @if (tab() === 'pago') {
        <div class="form">
          <div class="caja-ok"><i class="pi pi-check-circle"></i> Los pagos de productos pueden registrarse normalmente.</div>
          <div class="comp-row">
            <span>¿Desea generar comprobante electrónico?</span>
            <label class="cmp"><p-toggleSwitch [(ngModel)]="comprobante" /> {{ comprobante ? 'Sí, generar' : 'No, sin comprobante' }}</label>
          </div>
          <div class="pago-grid">
            <div>
              <h4>Resumen de Pago</h4>
              <div class="kv"><span>Productos</span><strong>S/ {{ productsTotal() | number: '1.2-2' }}</strong></div>
              <div class="kv"><span>Pagado</span><strong>S/ {{ paid() | number: '1.2-2' }}</strong></div>
              <div class="kv total"><span>Vuelto</span><strong>S/ {{ change() | number: '1.2-2' }}</strong></div>
              <p class="muted">El precio de la habitación se registra como acordado en la estancia.</p>
            </div>
            <div>
              <div class="ph"><h4>Métodos de Pago</h4><button class="addpay" (click)="addPay()"><i class="pi pi-plus"></i> Añadir método de pago</button></div>
              @for (p of pays(); track $index; let i = $index) {
                <div class="payrow">
                  <p-select [options]="methods" [(ngModel)]="p.method" optionLabel="label" optionValue="value" styleClass="w sm" />
                  <p-inputNumber [(ngModel)]="p.amount" mode="decimal" [minFractionDigits]="2" [min]="0" inputStyleClass="amt" />
                  <button class="elim" (click)="removePay(i)"><i class="pi pi-times"></i></button>
                </div>
              } @empty { <p class="muted">Sin métodos (opcional si no hay productos).</p> }
            </div>
          </div>
        </div>
      }

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="onVisibleChange(false)" />
        @if (tab() !== 'pago') { <p-button label="Siguiente" icon="pi pi-arrow-right" iconPos="right" severity="secondary" (onClick)="nextTab()" /> }
        <p-button label="Confirmar Check-in" icon="pi pi-check" [loading]="saving()" (onClick)="confirm()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .tabs { display: flex; gap: 0.3rem; border-bottom: 1px solid var(--p-content-border-color, #1c2c44); margin-bottom: 1rem; flex-wrap: wrap; }
      .tabs button { background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--p-text-muted-color, #8aa0bd); padding: 0.6rem 0.9rem; cursor: pointer; font-size: 0.85rem; }
      .tabs button.on { color: var(--rz-accent, #10b981); border-bottom-color: var(--rz-accent, #10b981); font-weight: 700; }
      .form { display: flex; flex-direction: column; }
      h3 { margin: 1rem 0 0.5rem; font-size: 1rem; } h4 { margin: 0 0 0.6rem; font-size: 0.95rem; }
      label { margin: 0.7rem 0 0.3rem; font-size: 0.85rem; color: var(--p-text-muted-color, #a1a1aa); }
      input[pInputText] { width: 100%; }
      .row { display: flex; gap: 1rem; } .row > .col { flex: 1; display: flex; flex-direction: column; }
      .search-row { display: flex; gap: 0.5rem; } .search-row input { flex: 1; }
      .price { margin-top: 1rem; padding: 0.7rem 0.9rem; border-radius: 8px; background: rgba(52,211,153,0.12); }
      .muted { color: var(--p-text-muted-color, #a1a1aa); font-size: 0.82rem; } .center { text-align: center; }
      :host ::ng-deep .w-full, :host ::ng-deep .w .p-select { width: 100%; }

      .venta { display: grid; grid-template-columns: 1fr 1.2fr; gap: 1rem; }
      .vfilters { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
      .search { position: relative; flex: 1; } .search i { position: absolute; left: 0.6rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .search input { width: 100%; padding-left: 1.9rem; }
      .plist { display: flex; flex-direction: column; gap: 0.4rem; max-height: 300px; overflow-y: auto; }
      .pcard { text-align: left; background: var(--p-content-hover-background, #142339); border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 8px; padding: 0.55rem 0.7rem; cursor: pointer; display: flex; flex-direction: column; gap: 0.2rem; color: var(--p-text-color,#e6edf5); }
      .pcard:hover:not(:disabled) { border-color: var(--rz-accent,#10b981); } .pcard:disabled { opacity: 0.45; }
      .pn small { color: #8aa0bd; } .pp { color: #34d399; font-weight: 700; font-size: 0.85rem; } .pp small { color: #8aa0bd; font-weight: 400; margin-left: 0.4rem; } .pp small.low { color: #f87171; }
      .seltbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .seltbl th { text-align: left; color: #8aa0bd; font-weight: 600; padding: 0.3rem 0.4rem; border-bottom: 1px solid var(--p-content-border-color,#1c2c44); }
      .seltbl td { padding: 0.4rem 0.4rem; border-bottom: 1px solid #16202e; }
      .elim { background: transparent; border: 0; color: #f87171; cursor: pointer; font-size: 0.8rem; }
      .vtotal { text-align: right; margin-top: 0.6rem; } .vtotal strong { color: #34d399; font-size: 1.1rem; }

      .caja-ok { background: rgba(16,185,129,0.12); border: 1px solid #14633f; color: #6ee7b7; border-radius: 8px; padding: 0.6rem 0.8rem; font-size: 0.85rem; }
      .comp-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 0.9rem 0; padding: 0.7rem 0.9rem; border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 10px; flex-wrap: wrap; }
      .cmp { display: flex; align-items: center; gap: 0.5rem; margin: 0; }
      .pago-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
      .kv { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.9rem; }
      .kv.total { border-top: 1px solid var(--p-content-border-color,#1c2c44); margin-top: 0.3rem; padding-top: 0.5rem; } .kv.total strong { color: #34d399; }
      .ph { display: flex; justify-content: space-between; align-items: center; }
      .addpay { background: transparent; border: 1px solid var(--p-content-border-color,#1c2c44); color: #cdd8e6; border-radius: 8px; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.78rem; }
      .payrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.4rem; align-items: center; margin-top: 0.4rem; }
      :host ::ng-deep .amt { width: 100%; }
    `,
  ],
})
export class CheckInDialogComponent {
  private readonly catalog = inject(CatalogApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly inventory = inject(InventoryApiService);
  private readonly finance = inject(FinanceApiService);
  private readonly messages = inject(MessageService);

  private _room: RoomMapItem | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  @Input() set room(value: RoomMapItem | null) {
    this._room = value;
    if (value) this.init(value);
  }
  get room(): RoomMapItem | null {
    return this._room;
  }

  @Input() prefillGuestId: string | null = null;

  readonly docTypes = DOCUMENT_TYPE_OPTIONS;
  readonly methods = METHODS;
  readonly guestModeOptions = [
    { label: 'Cliente existente', value: 'existing' },
    { label: 'Nuevo cliente', value: 'new' },
  ];

  readonly tab = signal<Tab>('huesped');
  readonly rates = signal<Rate[]>([]);
  readonly tiers = signal<ClientTier[]>([]);
  readonly guestResults = signal<Guest[]>([]);
  readonly products = signal<Product[]>([]);
  readonly lines = signal<{ product: Product; quantity: number }[]>([]);
  readonly pays = signal<Pay[]>([]);
  readonly pricePreview = signal<number | null>(null);
  readonly saving = signal(false);

  guestMode: 'existing' | 'new' = 'existing';
  guestSearch = '';
  selectedGuestId: string | null = null;
  newGuest: NewGuestInput = { documentType: 'DNI', documentNumber: '', firstName: '', lastName: '', phone: '', email: '' };
  selectedRateId: string | null = null;
  selectedTierId: string | null = null;
  additionalGuestIds: string[] = [];
  adults = 1;
  children = 0;
  vehiclePlate = '';
  notes = '';
  prodSearch = '';
  categoryFilter: string | null = null;
  comprobante = false;

  private init(room: RoomMapItem): void {
    this.tab.set('huesped');
    this.guestMode = 'existing';
    this.guestSearch = '';
    this.selectedGuestId = null;
    this.newGuest = { documentType: 'DNI', documentNumber: '', firstName: '', lastName: '', phone: '', email: '' };
    this.selectedRateId = null;
    this.selectedTierId = null;
    this.additionalGuestIds = [];
    this.adults = 1;
    this.children = 0;
    this.vehiclePlate = '';
    this.notes = '';
    this.prodSearch = '';
    this.categoryFilter = null;
    this.comprobante = false;
    this.lines.set([]);
    this.pays.set([]);
    this.pricePreview.set(null);

    this.catalog.rates.list({ roomTypeId: room.roomType.id }).subscribe((res) => this.rates.set(res.data ?? []));
    this.catalog.clientTiers.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.tiers.set(res.data ?? []));
    this.inventory.products.list({ pageSize: 300, status: 'active' }).subscribe((res) => this.products.set(res.data ?? []));
    this.searchGuests();

    if (this.prefillGuestId) {
      const id = this.prefillGuestId;
      this.catalog.guests.get(id).subscribe((res) => {
        if (res.data) {
          this.guestResults.set([res.data, ...this.guestResults().filter((g) => g.id !== id)]);
          this.selectedGuestId = id;
        }
      });
    }
  }

  searchGuests(): void {
    this.catalog.guests.list({ pageSize: 20, search: this.guestSearch || undefined }).subscribe((res) =>
      this.guestResults.set(res.data ?? []),
    );
  }

  recalc(): void {
    const rate = this.rates().find((r) => r.id === this.selectedRateId);
    if (!rate) { this.pricePreview.set(null); return; }
    const tier = this.tiers().find((t) => t.id === this.selectedTierId);
    const discount = tier ? Number(tier.discountPercent) : 0;
    this.pricePreview.set(Math.round(Number(rate.price) * (1 - discount / 100) * 100) / 100);
  }

  // --- Venta de productos ---
  categoryOptions(): string[] {
    return [...new Set(this.products().map((p) => p.category?.name).filter((c): c is string => !!c))].sort();
  }
  filteredProducts(): Product[] {
    const q = this.prodSearch.toLowerCase();
    return this.products().filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (this.categoryFilter && p.category?.name !== this.categoryFilter) return false;
      return true;
    });
  }
  addProduct(p: Product): void {
    const ex = this.lines().find((l) => l.product.id === p.id);
    if (ex) { if (ex.quantity < p.stock) ex.quantity += 1; this.lines.set([...this.lines()]); }
    else this.lines.set([...this.lines(), { product: p, quantity: 1 }]);
  }
  removeLine(id: string): void { this.lines.set(this.lines().filter((l) => l.product.id !== id)); }
  touch(): void { this.lines.set([...this.lines()]); }
  productsTotal(): number { return this.lines().reduce((a, l) => a + Number(l.product.salePrice) * l.quantity, 0); }

  // --- Pagos ---
  addPay(): void { this.pays.set([...this.pays(), { method: 'CASH', amount: Math.max(0, this.productsTotal() - this.paid()) }]); }
  removePay(i: number): void { const n = [...this.pays()]; n.splice(i, 1); this.pays.set(n); }
  paid(): number { return this.pays().reduce((a, p) => a + (p.amount || 0), 0); }
  change(): number { return Math.max(0, this.paid() - this.productsTotal()); }

  nextTab(): void {
    const order: Tab[] = ['huesped', 'adicionales', 'venta', 'pago'];
    const i = order.indexOf(this.tab());
    this.tab.set(order[Math.min(order.length - 1, i + 1)]);
  }

  onVisibleChange(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  confirm(): void {
    if (!this.room || !this.selectedRateId) {
      this.tab.set('huesped');
      this.messages.add({ severity: 'warn', summary: 'Falta tarifa', detail: 'Selecciona una tarifa.' });
      return;
    }
    const input: CheckInInput = {
      roomId: this.room.id,
      rateId: this.selectedRateId,
      tierId: this.selectedTierId ?? null,
      additionalGuestIds: this.additionalGuestIds,
      adults: this.adults,
      children: this.children,
      vehiclePlate: this.vehiclePlate || undefined,
      notes: this.notes || undefined,
    };
    if (this.guestMode === 'existing') {
      if (!this.selectedGuestId) { this.tab.set('huesped'); this.messages.add({ severity: 'warn', summary: 'Falta huésped', detail: 'Selecciona un cliente.' }); return; }
      input.guestId = this.selectedGuestId;
    } else {
      if (!this.newGuest.documentNumber || !this.newGuest.firstName) { this.tab.set('huesped'); this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa documento y nombres.' }); return; }
      input.newGuest = this.newGuest;
    }

    this.saving.set(true);
    this.ops.checkIn(input).subscribe({
      next: (res) => {
        const stay = res.data as Stay | undefined;
        const hasProducts = this.lines().length > 0;
        if (hasProducts && stay?.id) {
          this.finance.createSale({
            stayId: stay.id,
            items: this.lines().map((l) => ({ productId: l.product.id, quantity: l.quantity })),
            payments: this.pays().filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: p.amount })),
          }).subscribe({
            next: () => this.finish('Habitación ocupada. Venta registrada.'),
            error: () => this.finish('Check-in hecho. La venta de productos no se pudo registrar.'),
          });
        } else {
          this.finish('Habitación ocupada.');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar el check-in.' });
      },
    });
  }

  private finish(detail: string): void {
    this.saving.set(false);
    this.messages.add({ severity: 'success', summary: 'Check-in', detail });
    this.onVisibleChange(false);
    this.done.emit();
  }
}
