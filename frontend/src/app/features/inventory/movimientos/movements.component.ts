import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { InventoryApiService } from '../services/inventory-api.service';
import type { InventoryMovement, Product, Warehouse } from '../services/inventory.models';

const TYPE_META: Record<string, { label: string; severity: 'success' | 'danger' | 'info' | 'warn' | 'secondary' }> = {
  IN: { label: 'Ingreso', severity: 'success' },
  PURCHASE: { label: 'Compra', severity: 'success' },
  OUT: { label: 'Salida', severity: 'danger' },
  SALE: { label: 'Venta', severity: 'danger' },
  ADJUST: { label: 'Ajuste', severity: 'warn' },
  TRANSFER: { label: 'Transferencia', severity: 'info' },
};

@Component({
  selector: 'app-movements',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Movimientos (Kardex)</h1>
          <p class="muted">Historial de entradas y salidas de inventario.</p>
        </div>
        <div class="head-actions">
          @if (canEdit) {
            <p-button label="Ajuste" icon="pi pi-sliders-h" severity="secondary" (onClick)="openAdjust()" />
            <p-button label="Transferencia" icon="pi pi-arrow-right-arrow-left" severity="secondary" (onClick)="openTransfer()" />
          }
        </div>
      </header>

      <div class="cat-toolbar">
        <p-select [options]="productOptions()" [(ngModel)]="filterProduct" optionValue="id" [showClear]="true" placeholder="Producto" styleClass="flt" (onChange)="reload()">
          <ng-template let-p pTemplate="item">{{ p.name }}</ng-template>
          <ng-template let-p pTemplate="selectedItem">{{ p.name }}</ng-template>
        </p-select>
        <p-select [options]="warehouses()" [(ngModel)]="filterWarehouse" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Almacén" styleClass="flt" (onChange)="reload()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="15" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width:11rem">Fecha</th><th>Tipo</th><th>Producto</th><th>Almacén</th><th style="width:7rem">Cantidad</th><th>Referencia</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td class="muted">{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="meta(row.type).label" [severity]="meta(row.type).severity" /></td>
            <td>{{ row.productName }}</td>
            <td>{{ row.warehouseName }}{{ row.relatedWarehouseName ? ' → ' + row.relatedWarehouseName : '' }}</td>
            <td [class.neg]="row.quantity < 0"><strong>{{ row.quantity > 0 ? '+' : '' }}{{ row.quantity }}</strong></td>
            <td class="muted">{{ row.reference }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin movimientos.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- Ajuste -->
    <p-dialog [(visible)]="adjustVisible" [modal]="true" [style]="{ width: '440px' }" header="Ajuste de stock">
      <div class="cat-form">
        <label>Producto</label>
        <p-select [options]="productOptions()" [(ngModel)]="adj.productId" optionValue="id" [filter]="true" filterBy="name" placeholder="Seleccionar" styleClass="w-full">
          <ng-template let-p pTemplate="item">{{ p.name }}</ng-template>
          <ng-template let-p pTemplate="selectedItem">{{ p.name }}</ng-template>
        </p-select>
        <label>Almacén</label>
        <p-select [options]="warehouses()" [(ngModel)]="adj.warehouseId" optionLabel="name" optionValue="id" placeholder="Seleccionar" styleClass="w-full" />
        <label>Cantidad (+ ingreso / − salida)</label>
        <p-inputNumber [(ngModel)]="adj.quantity" [showButtons]="true" styleClass="w-full" />
        <label>Motivo</label>
        <input pInputText [(ngModel)]="adj.reference" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="adjustVisible = false" />
        <p-button label="Aplicar" icon="pi pi-check" [loading]="saving()" (onClick)="doAdjust()" />
      </ng-template>
    </p-dialog>

    <!-- Transferencia -->
    <p-dialog [(visible)]="transferVisible" [modal]="true" [style]="{ width: '460px' }" header="Transferencia entre almacenes">
      <div class="cat-form">
        <label>Producto</label>
        <p-select [options]="productOptions()" [(ngModel)]="tr.productId" optionValue="id" [filter]="true" filterBy="name" placeholder="Seleccionar" styleClass="w-full">
          <ng-template let-p pTemplate="item">{{ p.name }}</ng-template>
          <ng-template let-p pTemplate="selectedItem">{{ p.name }}</ng-template>
        </p-select>
        <div class="row">
          <div class="col"><label>Origen</label><p-select [options]="warehouses()" [(ngModel)]="tr.fromWarehouseId" optionLabel="name" optionValue="id" placeholder="Origen" styleClass="w-full" /></div>
          <div class="col"><label>Destino</label><p-select [options]="warehouses()" [(ngModel)]="tr.toWarehouseId" optionLabel="name" optionValue="id" placeholder="Destino" styleClass="w-full" /></div>
        </div>
        <label>Cantidad</label>
        <p-inputNumber [(ngModel)]="tr.quantity" [min]="1" styleClass="w-full" />
        <label>Motivo</label>
        <input pInputText [(ngModel)]="tr.reference" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="transferVisible = false" />
        <p-button label="Transferir" icon="pi pi-check" [loading]="saving()" (onClick)="doTransfer()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .head-actions { display: flex; gap: 0.5rem; }
      :host ::ng-deep .flt { width: 200px; }
      td.neg strong { color: #f87171; }
    `,
  ],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class MovementsComponent implements OnInit {
  private readonly inventory = inject(InventoryApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly route = inject(ActivatedRoute);

  readonly items = signal<InventoryMovement[]>([]);
  readonly productOptions = signal<Product[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  filterProduct: string | null = null;
  filterWarehouse: string | null = null;

  adjustVisible = false;
  adj = { productId: null as string | null, warehouseId: null as string | null, quantity: 0, reference: '' };
  transferVisible = false;
  tr = { productId: null as string | null, fromWarehouseId: null as string | null, toWarehouseId: null as string | null, quantity: 1, reference: '' };

  readonly canEdit = this.auth.can('inventory', 'edit');

  ngOnInit(): void {
    this.inventory.products.list({ pageSize: 200, sortBy: 'name' }).subscribe((res) => this.productOptions.set(res.data ?? []));
    this.inventory.warehouses.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => {
      const ws = res.data ?? [];
      this.warehouses.set(ws);
      // Preselección de almacén por query param (?wh=<id> o ?type=<TYPE>) para deep-links del menú.
      const pm = this.route.snapshot.queryParamMap;
      const wh = pm.get('wh');
      const type = pm.get('type');
      const match = (wh && ws.find((w) => w.id === wh)) || (type && ws.find((w) => w.type === type));
      if (match) { this.filterWarehouse = match.id; this.reload(); }
    });
    this.reload();
  }

  meta(t: string) {
    return TYPE_META[t] ?? { label: t, severity: 'secondary' as const };
  }

  reload(): void {
    this.loading.set(true);
    this.inventory.listMovements({ pageSize: 100, productId: this.filterProduct || undefined, warehouseId: this.filterWarehouse || undefined }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openAdjust(): void {
    this.adj = { productId: null, warehouseId: null, quantity: 0, reference: '' };
    this.adjustVisible = true;
  }

  doAdjust(): void {
    if (!this.adj.productId || !this.adj.warehouseId || !this.adj.quantity) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Producto, almacén y cantidad (≠0).' });
      return;
    }
    this.saving.set(true);
    this.inventory.adjust({ productId: this.adj.productId, warehouseId: this.adj.warehouseId, quantity: this.adj.quantity, reference: this.adj.reference || undefined }).subscribe({
      next: () => {
        this.saving.set(false);
        this.adjustVisible = false;
        this.messages.add({ severity: 'success', summary: 'Ajuste aplicado', detail: 'Stock actualizado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo ajustar.' });
      },
    });
  }

  openTransfer(): void {
    this.tr = { productId: null, fromWarehouseId: null, toWarehouseId: null, quantity: 1, reference: '' };
    this.transferVisible = true;
  }

  doTransfer(): void {
    if (!this.tr.productId || !this.tr.fromWarehouseId || !this.tr.toWarehouseId || this.tr.quantity < 1) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa producto, almacenes y cantidad.' });
      return;
    }
    this.saving.set(true);
    this.inventory.transfer({ productId: this.tr.productId, fromWarehouseId: this.tr.fromWarehouseId, toWarehouseId: this.tr.toWarehouseId, quantity: this.tr.quantity, reference: this.tr.reference || undefined }).subscribe({
      next: () => {
        this.saving.set(false);
        this.transferVisible = false;
        this.messages.add({ severity: 'success', summary: 'Transferencia', detail: 'Stock movido.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo transferir.' });
      },
    });
  }
}
