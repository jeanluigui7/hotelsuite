import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { OperationsApiService } from '../../operations/services/operations-api.service';
import type { Stay } from '../../operations/services/operations.models';
import { FinanceApiService } from '../services/finance-api.service';
import type { PaymentInput, PaymentMethod, Sale, SaleItemInput } from '../services/finance.models';

const METHODS: { label: string; value: PaymentMethod }[] = [
  { label: 'Efectivo', value: 'CASH' },
  { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' },
  { label: 'Yape/Plin', value: 'WALLET' },
];

interface Line extends SaleItemInput {
  name: string;
  subtotal: number;
}

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    MessageModule,
    TooltipModule,
  ],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Pagos / Ventas</h1>
          <p class="muted">Venta de productos a estancia o cliente externo.</p>
        </div>
        @if (canCreate) {
          <p-button label="Nueva venta" icon="pi pi-shopping-cart" [disabled]="!hasOpenSession()" (onClick)="openNew()" />
        }
      </header>

      @if (!hasOpenSession()) {
        <p-message severity="warn" text="No hay un turno de caja abierto. Ábrelo en Finanzas › Cajas para registrar ventas." styleClass="mb" />
      }

      <p-table [value]="sales()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Cliente / Estancia</th><th style="width:7rem">Total</th><th style="width:7rem">Pagado</th>
            <th style="width:11rem">Fecha</th><th style="width:8rem">Estado</th><th style="width:6rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.customerName ?? (row.stayId ? 'Estancia ' + row.stayId.substring(0,8) : 'Cliente') }}</td>
            <td>{{ row.total | number: '1.2-2' }}</td>
            <td>{{ row.paid | number: '1.2-2' }}</td>
            <td>{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="statusLabel(row.status)" [severity]="statusSeverity(row.status)" /></td>
            <td>
              @if (canEdit && row.status !== 'CANCELLED') {
                <p-button icon="pi pi-times" severity="danger" [text]="true" (onClick)="cancel(row)" pTooltip="Anular" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin ventas en el turno.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '720px' }" header="Nueva venta">
      <div class="sale">
        <!-- Destino -->
        <p-selectButton [options]="destOptions" optionLabel="label" optionValue="value" [(ngModel)]="dest" [allowEmpty]="false" />
        @if (dest === 'stay') {
          <label>Estancia (habitación ocupada)</label>
          <p-select [options]="openStays()" [(ngModel)]="stayId" optionValue="id" placeholder="Seleccionar estancia" styleClass="w-full">
            <ng-template let-s pTemplate="item">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
            <ng-template let-s pTemplate="selectedItem">Hab. {{ s.room.number }} · {{ s.guest.firstName }}</ng-template>
          </p-select>
        } @else {
          <label>Nombre del cliente</label>
          <input pInputText [(ngModel)]="customerName" />
        }

        <!-- Items -->
        <h3>Productos</h3>
        <div class="add-row">
          <p-select [options]="products()" [(ngModel)]="pickProductId" optionValue="id" [filter]="true" filterBy="name" placeholder="Producto" styleClass="grow">
            <ng-template let-p pTemplate="item">{{ p.name }} · {{ p.salePrice }} · stock {{ p.stock }}</ng-template>
            <ng-template let-p pTemplate="selectedItem">{{ p.name }}</ng-template>
          </p-select>
          <p-inputNumber [(ngModel)]="pickQty" [min]="1" styleClass="qty" />
          <p-button icon="pi pi-plus" label="Agregar" (onClick)="addLine()" />
        </div>

        <table class="lines">
          <thead><tr><th>Producto</th><th>Cant.</th><th>P.U.</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>
            @for (l of lines(); track $index) {
              <tr>
                <td>{{ l.name }}</td><td>{{ l.quantity }}</td><td>{{ l.unitPrice | number: '1.2-2' }}</td>
                <td>{{ l.subtotal | number: '1.2-2' }}</td>
                <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeLine($index)" /></td>
              </tr>
            }
            @if (lines().length === 0) { <tr><td colspan="5" class="muted center">Sin productos.</td></tr> }
          </tbody>
        </table>
        <div class="total">Total: <strong>{{ total() | number: '1.2-2' }}</strong></div>

        <!-- Pagos -->
        <h3>Pagos</h3>
        <div class="add-row">
          <p-select [options]="methods" optionLabel="label" optionValue="value" [(ngModel)]="pickMethod" styleClass="grow" />
          <p-inputNumber [(ngModel)]="pickAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="qty2" />
          <p-button icon="pi pi-plus" label="Agregar" (onClick)="addPayment()" />
        </div>
        <table class="lines">
          <tbody>
            @for (p of payments(); track $index) {
              <tr>
                <td>{{ methodLabel(p.method) }}</td><td>{{ p.amount | number: '1.2-2' }}</td>
                <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removePayment($index)" /></td>
              </tr>
            }
          </tbody>
        </table>
        <div class="total">Pagado: <strong>{{ paid() | number: '1.2-2' }}</strong> · Saldo: <strong>{{ remaining() | number: '1.2-2' }}</strong></div>
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Registrar venta" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 1.1rem 0 0.5rem; font-size: 1rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
      :host ::ng-deep .mb { display: block; margin-bottom: 1rem; }
      .sale { display: flex; flex-direction: column; }
      label { margin: 0.7rem 0 0.3rem; font-size: 0.85rem; color: var(--p-text-muted-color, #a1a1aa); }
      input[pInputText] { width: 100%; }
      .add-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.6rem; }
      :host ::ng-deep .grow { flex: 1; }
      :host ::ng-deep .qty { width: 90px; }
      :host ::ng-deep .qty2 { width: 140px; }
      table.lines { width: 100%; border-collapse: collapse; }
      table.lines th, table.lines td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--p-content-border-color, #2b2b30); text-align: left; font-size: 0.85rem; }
      .total { margin: 0.5rem 0; text-align: right; }
      :host ::ng-deep .w-full { width: 100%; }
    `,
  ],
})
export class SalesComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  private readonly inventory = inject(InventoryApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly sales = signal<Sale[]>([]);
  readonly products = signal<Product[]>([]);
  readonly openStays = signal<Stay[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly payments = signal<PaymentInput[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly hasOpenSession = signal(false);

  readonly methods = METHODS;
  readonly destOptions = [
    { label: 'A estancia', value: 'stay' },
    { label: 'Cliente externo', value: 'external' },
  ];

  dest: 'stay' | 'external' = 'external';
  stayId: string | null = null;
  customerName = '';
  pickProductId: string | null = null;
  pickQty = 1;
  pickMethod: PaymentMethod = 'CASH';
  pickAmount: number | null = null;

  dialogVisible = false;

  readonly total = computed(() => this.lines().reduce((a, l) => a + l.subtotal, 0));
  readonly paid = computed(() => this.payments().reduce((a, p) => a + p.amount, 0));
  readonly remaining = computed(() => Math.round((this.total() - this.paid()) * 100) / 100);

  readonly canCreate = this.auth.can('finance', 'create');
  readonly canEdit = this.auth.can('finance', 'edit');

  ngOnInit(): void {
    this.inventory.products.list({ pageSize: 200, sortBy: 'name' }).subscribe((res) => this.products.set(res.data ?? []));
    this.refreshSession();
  }

  statusLabel(s: string): string {
    return s === 'PAID' ? 'Pagada' : s === 'OPEN' ? 'Pendiente' : 'Anulada';
  }
  statusSeverity(s: string): 'success' | 'warn' | 'danger' {
    return s === 'PAID' ? 'success' : s === 'OPEN' ? 'warn' : 'danger';
  }
  methodLabel(m: string): string {
    return METHODS.find((x) => x.value === m)?.label ?? m;
  }

  private refreshSession(): void {
    this.loading.set(true);
    this.finance.cashCurrent().subscribe({
      next: (res) => {
        const session = res.data.session;
        this.hasOpenSession.set(!!session);
        if (session) {
          this.finance.listSales({ pageSize: 100, sortBy: 'createdAt', sortDir: 'desc', cashSessionId: session.id }).subscribe((r) => {
            this.sales.set(r.data ?? []);
            this.loading.set(false);
          });
        } else {
          this.sales.set([]);
          this.loading.set(false);
        }
      },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.dest = 'external';
    this.stayId = null;
    this.customerName = '';
    this.lines.set([]);
    this.payments.set([]);
    this.pickProductId = null;
    this.pickQty = 1;
    this.pickAmount = null;
    this.ops.stays({ pageSize: 100, status: 'OPEN' }).subscribe((res) => this.openStays.set(res.data ?? []));
    this.dialogVisible = true;
  }

  addLine(): void {
    const product = this.products().find((p) => p.id === this.pickProductId);
    if (!product || this.pickQty < 1) return;
    const unitPrice = Number(product.salePrice);
    this.lines.set([
      ...this.lines(),
      { productId: product.id, name: product.name, quantity: this.pickQty, unitPrice, subtotal: Math.round(unitPrice * this.pickQty * 100) / 100 },
    ]);
    this.pickProductId = null;
    this.pickQty = 1;
  }

  removeLine(i: number): void {
    this.lines.set(this.lines().filter((_, idx) => idx !== i));
  }

  addPayment(): void {
    if (this.pickAmount == null || this.pickAmount <= 0) return;
    this.payments.set([...this.payments(), { method: this.pickMethod, amount: this.pickAmount }]);
    this.pickAmount = null;
  }

  removePayment(i: number): void {
    this.payments.set(this.payments().filter((_, idx) => idx !== i));
  }

  save(): void {
    if (this.lines().length === 0) {
      this.messages.add({ severity: 'warn', summary: 'Sin productos', detail: 'Agrega al menos un producto.' });
      return;
    }
    if (this.dest === 'stay' && !this.stayId) {
      this.messages.add({ severity: 'warn', summary: 'Falta estancia', detail: 'Selecciona la estancia.' });
      return;
    }
    if (this.dest === 'external' && !this.customerName) {
      this.messages.add({ severity: 'warn', summary: 'Falta cliente', detail: 'Ingresa el nombre del cliente.' });
      return;
    }
    const input = {
      stayId: this.dest === 'stay' ? this.stayId : null,
      customerName: this.dest === 'external' ? this.customerName : undefined,
      items: this.lines().map((l) => ({ productId: l.productId, quantity: l.quantity })),
      payments: this.payments(),
    };
    this.saving.set(true);
    this.finance.createSale(input).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Venta registrada', detail: 'Stock descontado.' });
        this.refreshSession();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar la venta.' });
      },
    });
  }

  cancel(row: Sale): void {
    this.confirm.confirm({
      header: 'Anular venta',
      message: '¿Anular esta venta? (No repone stock automáticamente)',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Anular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.finance.cancelSale(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Anulada', detail: 'Venta anulada.' }); this.refreshSession(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo anular.' }),
        });
      },
    });
  }
}
