import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import { buildSaleReceipt } from '../../finance/tickets/receipt';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';

interface Line { product: Product; quantity: number; }
interface Pay { method: 'CASH' | 'CARD' | 'TRANSFER' | 'WALLET'; amount: number; reference?: string; }

const METHODS = [
  { label: 'Efectivo', value: 'CASH' },
  { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' },
  { label: 'Yape/Plin', value: 'WALLET' },
];

@Component({
  selector: 'app-venta-productos',
  standalone: true,
  imports: [DecimalPipe, FormsModule, DialogModule, SelectModule, InputNumberModule, InputTextModule, ButtonModule],
  template: `
    <p-dialog [(visible)]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" header="Venta de Productos"
              [style]="{ width: '60rem', maxWidth: '95vw' }" styleClass="dk-dialog" (onShow)="load()">
      <div class="grid">
        <!-- Izquierda: catálogo -->
        <div class="catalog">
          <span class="search"><i class="pi pi-search"></i><input pInputText placeholder="Buscar producto…" [(ngModel)]="search" /></span>
          <div class="prods">
            @for (p of shownProducts(); track p.id) {
              <button class="prod" (click)="add(p)" [disabled]="p.stock <= 0">
                <span class="pn">{{ p.name }}</span>
                <span class="pp">{{ +p.salePrice | number: '1.2-2' }}</span>
                <span class="ps" [class.low]="p.stock <= 0">Stock: {{ p.stock }}</span>
              </button>
            } @empty { <p class="muted">Sin productos.</p> }
          </div>
        </div>

        <!-- Derecha: carrito + cliente + pago -->
        <div class="cart">
          <div class="field">
            <label>Tipo de cliente</label>
            <p-select [options]="clientTypes" [(ngModel)]="clientType" optionLabel="label" optionValue="value" styleClass="w" />
          </div>
          @if (clientType === 'ROOM') {
            <div class="field">
              <label>Habitación ocupada</label>
              <p-select [options]="stays()" [(ngModel)]="stayId" optionValue="id" [filter]="true" filterBy="label" placeholder="Selecciona habitación" styleClass="w">
                <ng-template let-s pTemplate="item">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
                <ng-template let-s pTemplate="selectedItem">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
              </p-select>
            </div>
          } @else {
            <div class="field">
              <label>Nombre del cliente (opcional)</label>
              <input pInputText [(ngModel)]="customerName" placeholder="Cliente mostrador" />
            </div>
          }

          <div class="lines">
            @for (l of lines(); track l.product.id; let i = $index) {
              <div class="line">
                <span class="ln">{{ l.product.name }}</span>
                <p-inputNumber [(ngModel)]="l.quantity" [min]="1" [showButtons]="true" buttonLayout="horizontal" inputStyleClass="qty" (onInput)="touch()" />
                <span class="lt">{{ +l.product.salePrice * l.quantity | number: '1.2-2' }}</span>
                <button class="del" (click)="removeLine(i)"><i class="pi pi-times"></i></button>
              </div>
            } @empty { <p class="muted center">Agrega productos del catálogo.</p> }
          </div>

          <div class="total">Total a cobrar <strong>{{ total() | number: '1.2-2' }}</strong></div>

          <div class="pays">
            <div class="pays-head"><span>Métodos de pago</span><button class="addpay" (click)="addPay()"><i class="pi pi-plus"></i> Añadir</button></div>
            @for (p of pays(); track $index; let i = $index) {
              <div class="payrow">
                <p-select [options]="methods" [(ngModel)]="p.method" optionLabel="label" optionValue="value" styleClass="w sm" />
                <p-inputNumber [(ngModel)]="p.amount" mode="decimal" [minFractionDigits]="2" [min]="0" inputStyleClass="amt" />
                <button class="del" (click)="removePay(i)"><i class="pi pi-times"></i></button>
              </div>
            }
            <div class="paid" [class.warn]="paid() > total()">Pagado: {{ paid() | number: '1.2-2' }} · Vuelto: {{ change() | number: '1.2-2' }}</div>
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
      .grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 1rem; min-height: 420px; }
      .muted { color: #8b97a8; } .center { text-align: center; }
      .search { position: relative; display: block; margin-bottom: 0.6rem; }
      .search i { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .search input { width: 100%; background: #131d2b; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.55rem 0.7rem 0.55rem 2rem; }
      .prods { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px,1fr)); gap: 0.5rem; max-height: 380px; overflow-y: auto; }
      .prod { background: #131d2b; border: 1px solid #243245; border-radius: 10px; padding: 0.7rem; cursor: pointer; display: flex; flex-direction: column; gap: 0.2rem; text-align: left; color: #e6e9ef; }
      .prod:hover:not(:disabled) { border-color: #10b981; }
      .prod:disabled { opacity: 0.45; cursor: default; }
      .pn { font-weight: 600; font-size: 0.85rem; } .pp { color: #34d399; font-weight: 700; } .ps { font-size: 0.72rem; color: #8b97a8; } .ps.low { color: #f87171; }
      .cart { display: flex; flex-direction: column; gap: 0.6rem; background: #0b1119; border: 1px solid #1c2a3a; border-radius: 12px; padding: 0.9rem; }
      .field { display: flex; flex-direction: column; gap: 0.3rem; }
      label { font-size: 0.8rem; color: #9fb0c3; }
      :host ::ng-deep .w .p-select, :host ::ng-deep .cart input { width: 100%; background: #131d2b; border-color: #243245; color: #e6e9ef; }
      .lines { display: flex; flex-direction: column; gap: 0.4rem; max-height: 160px; overflow-y: auto; margin-top: 0.3rem; }
      .line { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 0.5rem; }
      .ln { font-size: 0.85rem; } .lt { font-weight: 600; min-width: 4rem; text-align: right; }
      .del { background: transparent; border: 0; color: #f87171; cursor: pointer; }
      .total { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1c2a3a; padding-top: 0.6rem; font-size: 1.05rem; }
      .total strong { color: #34d399; font-size: 1.2rem; }
      .pays-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #9fb0c3; }
      .addpay { background: transparent; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.8rem; }
      .payrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.4rem; align-items: center; margin-top: 0.4rem; }
      :host ::ng-deep .amt, :host ::ng-deep .qty { width: 100%; }
      .paid { font-size: 0.8rem; color: #8b97a8; margin-top: 0.4rem; }
      .paid.warn { color: #fbbf24; }
    `,
  ],
})
export class VentaProductosComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  private readonly inventory = inject(InventoryApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly printing = inject(PrintingService);
  private readonly toast = inject(MessageService);

  readonly products = signal<Product[]>([]);
  readonly stays = signal<(Stay & { label?: string })[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly pays = signal<Pay[]>([]);
  readonly saving = signal(false);

  readonly methods = METHODS;
  readonly clientTypes = [
    { label: 'Cliente general', value: 'GENERAL' },
    { label: 'Asociar a habitación ocupada', value: 'ROOM' },
  ];
  clientType: 'GENERAL' | 'ROOM' = 'GENERAL';
  stayId: string | null = null;
  customerName = '';
  search = '';

  readonly shownProducts = computed(() => {
    const q = this.search.toLowerCase();
    return q ? this.products().filter((p) => p.name.toLowerCase().includes(q)) : this.products();
  });
  readonly total = computed(() => this.lines().reduce((a, l) => a + Number(l.product.salePrice) * l.quantity, 0));
  readonly paid = computed(() => this.pays().reduce((a, p) => a + (p.amount || 0), 0));
  change = () => Math.max(0, this.paid() - this.total());

  load(): void {
    this.lines.set([]); this.pays.set([]); this.customerName = ''; this.stayId = null; this.clientType = 'GENERAL'; this.search = '';
    this.inventory.products.list({ pageSize: 300, status: 'active' }).subscribe((r) => this.products.set(r.data ?? []));
    this.ops.stays({ status: 'OPEN', pageSize: 200 }).subscribe((r) => this.stays.set(r.data ?? []));
  }

  add(p: Product): void {
    const ex = this.lines().find((l) => l.product.id === p.id);
    if (ex) { ex.quantity += 1; this.lines.set([...this.lines()]); }
    else this.lines.set([...this.lines(), { product: p, quantity: 1 }]);
  }
  removeLine(i: number): void { const n = [...this.lines()]; n.splice(i, 1); this.lines.set(n); }
  touch(): void { this.lines.set([...this.lines()]); }
  addPay(): void { this.pays.set([...this.pays(), { method: 'CASH', amount: this.remaining() }]); }
  removePay(i: number): void { const n = [...this.pays()]; n.splice(i, 1); this.pays.set(n); }
  private remaining(): number { return Math.max(0, Math.round((this.total() - this.paid()) * 100) / 100); }

  canSubmit(): boolean {
    if (this.saving() || this.lines().length === 0) return false;
    if (this.clientType === 'ROOM' && !this.stayId) return false;
    return true;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.finance.createSale({
      stayId: this.clientType === 'ROOM' ? this.stayId : null,
      customerName: this.clientType === 'GENERAL' ? this.customerName || 'Cliente mostrador' : undefined,
      items: this.lines().map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      payments: this.pays().filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: p.amount })),
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'Venta registrada', detail: 'Total ' + this.total().toFixed(2) });
        if (res.data) this.printing.printViaBrowser(buildSaleReceipt(res.data, this.auth.activeBranch()?.name ?? 'HotelSuite'));
        this.done.emit();
        this.close();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar la venta.' });
      },
    });
  }

  close(): void { this.visible = false; this.visibleChange.emit(false); }
}
