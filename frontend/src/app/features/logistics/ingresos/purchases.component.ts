import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product, Warehouse } from '../../inventory/services/inventory.models';
import { LogisticsApiService } from '../services/logistics-api.service';
import type { Purchase, Supplier } from '../services/logistics.models';

interface Line {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Ingresos con Factura</h1>
          <p class="muted">Compras que suman stock y actualizan el costo de los productos.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo ingreso" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Proveedor</th><th>Factura</th><th style="width:8rem">Total</th><th style="width:11rem">Fecha</th><th style="width:8rem">Estado</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.supplier.name }}</td>
            <td>{{ row.documentNumber ?? '—' }}</td>
            <td>{{ row.total | number: '1.2-2' }}</td>
            <td>{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="row.status === 'RECEIVED' ? 'Recibido' : 'Anulado'" [severity]="row.status === 'RECEIVED' ? 'success' : 'danger'" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin ingresos.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '680px' }" header="Nuevo ingreso con factura">
      <div class="cat-form">
        <div class="row">
          <div class="col">
            <label>Proveedor</label>
            <p-select [options]="suppliers()" optionLabel="name" optionValue="id" [(ngModel)]="supplierId" placeholder="Seleccionar" styleClass="w-full" />
          </div>
          <div class="col">
            <label>Almacén destino</label>
            <p-select [options]="warehouses()" optionLabel="name" optionValue="id" [(ngModel)]="warehouseId" placeholder="Seleccionar" styleClass="w-full" />
          </div>
        </div>
        <label>Nº de factura</label>
        <input pInputText [(ngModel)]="documentNumber" />

        <h3>Productos</h3>
        <div class="add-row">
          <p-select [options]="products()" [(ngModel)]="pickProductId" optionValue="id" [filter]="true" filterBy="name" placeholder="Producto" styleClass="grow">
            <ng-template let-p pTemplate="item">{{ p.name }}</ng-template>
            <ng-template let-p pTemplate="selectedItem">{{ p.name }}</ng-template>
          </p-select>
          <p-inputNumber [(ngModel)]="pickQty" [min]="1" placeholder="Cant." styleClass="qty" />
          <p-inputNumber [(ngModel)]="pickCost" mode="currency" currency="PEN" locale="es-PE" placeholder="Costo" styleClass="cost" />
          <p-button icon="pi pi-plus" (onClick)="addLine()" />
        </div>
        <table class="lines">
          <thead><tr><th>Producto</th><th>Cant.</th><th>Costo</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>
            @for (l of lines(); track $index) {
              <tr>
                <td>{{ l.name }}</td><td>{{ l.quantity }}</td><td>{{ l.unitCost | number: '1.2-2' }}</td>
                <td>{{ l.subtotal | number: '1.2-2' }}</td>
                <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeLine($index)" /></td>
              </tr>
            }
            @if (lines().length === 0) { <tr><td colspan="5" class="muted center">Sin productos.</td></tr> }
          </tbody>
        </table>
        <div class="total">Total: <strong>{{ total() | number: '1.2-2' }}</strong></div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Registrar ingreso" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      h3 { margin: 1.1rem 0 0.5rem; font-size: 1rem; }
      .add-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.6rem; }
      :host ::ng-deep .grow { flex: 1; }
      :host ::ng-deep .qty { width: 90px; }
      :host ::ng-deep .cost { width: 130px; }
      table.lines { width: 100%; border-collapse: collapse; }
      table.lines th, table.lines td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--p-content-border-color, #2b2b30); text-align: left; font-size: 0.85rem; }
      .total { margin-top: 0.5rem; text-align: right; }
    `,
  ],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class PurchasesComponent implements OnInit {
  private readonly logistics = inject(LogisticsApiService);
  private readonly inventory = inject(InventoryApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly items = signal<Purchase[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly products = signal<Product[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly total = computed(() => this.lines().reduce((a, l) => a + l.subtotal, 0));

  dialogVisible = false;
  supplierId: string | null = null;
  warehouseId: string | null = null;
  documentNumber = '';
  pickProductId: string | null = null;
  pickQty = 1;
  pickCost: number | null = null;

  readonly canCreate = this.auth.can('logistics', 'create');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.logistics.listPurchases({ pageSize: 50, sortBy: 'createdAt', sortDir: 'desc' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.supplierId = null;
    this.warehouseId = null;
    this.documentNumber = '';
    this.lines.set([]);
    this.pickProductId = null;
    this.pickQty = 1;
    this.pickCost = null;
    this.logistics.suppliers.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.suppliers.set(res.data ?? []));
    this.inventory.products.list({ pageSize: 200, sortBy: 'name' }).subscribe((res) => this.products.set(res.data ?? []));
    this.inventory.warehouses.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.warehouses.set(res.data ?? []));
    this.dialogVisible = true;
  }

  addLine(): void {
    const product = this.products().find((p) => p.id === this.pickProductId);
    if (!product || this.pickQty < 1 || this.pickCost == null) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Producto, cantidad y costo.' });
      return;
    }
    this.lines.set([
      ...this.lines(),
      { productId: product.id, name: product.name, quantity: this.pickQty, unitCost: this.pickCost, subtotal: Math.round(this.pickCost * this.pickQty * 100) / 100 },
    ]);
    this.pickProductId = null;
    this.pickQty = 1;
    this.pickCost = null;
  }

  removeLine(i: number): void {
    this.lines.set(this.lines().filter((_, idx) => idx !== i));
  }

  save(): void {
    if (!this.supplierId || !this.warehouseId || this.lines().length === 0) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Proveedor, almacén y al menos un producto.' });
      return;
    }
    const input = {
      supplierId: this.supplierId,
      warehouseId: this.warehouseId,
      documentNumber: this.documentNumber || undefined,
      items: this.lines().map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })),
    };
    this.saving.set(true);
    this.logistics.createPurchase(input).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Ingreso registrado', detail: 'Stock y costos actualizados.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar.' });
      },
    });
  }
}
