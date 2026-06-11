import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CrudApi } from '../../../core/http/crud-api';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';

interface ServiceItem {
  id: string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  status: string;
  kind: string;
}
interface ServiceUpsert {
  kind: 'SERVICE';
  name: string;
  description?: string;
  price?: number;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-productos-servicios',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule],
  template: `
    <section>
      <header class="head">
        <h1>Productos y Servicios</h1>
        <p class="muted">Servicios cobrables (lavandería, late check-out, etc.) y productos vendibles del catálogo.</p>
      </header>

      <div class="block">
        <div class="block-head">
          <h3>Servicios</h3>
          <p-button label="Nuevo servicio" icon="pi pi-plus" size="small" (onClick)="openNew()" />
        </div>
        <p-table [value]="services()" [loading]="loadingServices()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr><th>Nombre</th><th>Descripción</th><th style="width:9rem">Precio</th><th style="width:7rem">Estado</th><th style="width:8rem"></th></tr>
          </ng-template>
          <ng-template pTemplate="body" let-s>
            <tr>
              <td>{{ s.name }}</td>
              <td class="muted">{{ s.description || '—' }}</td>
              <td>{{ s.price != null ? (+s.price | number: '1.2-2') : '—' }}</td>
              <td><p-tag [value]="s.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="s.status === 'active' ? 'success' : 'secondary'" /></td>
              <td>
                <p-button icon="pi pi-pencil" [text]="true" size="small" (onClick)="openEdit(s)" />
                <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="confirmDelete(s)" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin servicios registrados.</td></tr></ng-template>
        </p-table>
      </div>

      <div class="block">
        <div class="block-head">
          <h3>Productos vendibles</h3>
          <span class="muted sm">Se gestionan en Inventario › Artículos.</span>
        </div>
        <p-table [value]="products()" [loading]="loadingProducts()" styleClass="p-datatable-sm" [paginator]="products().length > 10" [rows]="10">
          <ng-template pTemplate="header">
            <tr><th>Producto</th><th>SKU</th><th style="width:9rem">Precio</th><th style="width:7rem">Stock</th><th style="width:7rem">Estado</th></tr>
          </ng-template>
          <ng-template pTemplate="body" let-p>
            <tr>
              <td>{{ p.name }}</td>
              <td class="muted">{{ p.sku || '—' }}</td>
              <td>{{ +p.salePrice | number: '1.2-2' }}</td>
              <td>{{ p.stock }}</td>
              <td><p-tag [value]="p.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="p.status === 'active' ? 'success' : 'secondary'" /></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin productos.</td></tr></ng-template>
        </p-table>
      </div>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [header]="editing() ? 'Editar servicio' : 'Nuevo servicio'" [style]="{ width: '32rem' }">
      <div class="form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" placeholder="Ej. Lavandería express" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="form.description" placeholder="Opcional" />
        <label>Precio</label>
        <p-inputNumber [(ngModel)]="form.price" mode="decimal" [minFractionDigits]="2" [min]="0" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [disabled]="!form.name" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 0; font-size: 1.05rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .sm { font-size: 0.82rem; }
      .center { text-align: center; }
      .block { margin-bottom: 2rem; }
      .block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
      .form { display: flex; flex-direction: column; gap: 0.4rem; }
      .form label { font-size: 0.85rem; color: var(--p-text-muted-color, #6b7280); margin-top: 0.5rem; }
    `,
  ],
})
export class ProductosServiciosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly inventory = inject(InventoryApiService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  private readonly servicesApi = new CrudApi<ServiceItem, ServiceUpsert>(this.http, 'items');

  readonly services = signal<ServiceItem[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loadingServices = signal(false);
  readonly loadingProducts = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<ServiceItem | null>(null);

  dialogVisible = false;
  form: { name: string; description: string; price: number | null } = { name: '', description: '', price: null };

  ngOnInit(): void {
    this.loadServices();
    this.loadingProducts.set(true);
    this.inventory.products.list({ pageSize: 300 }).subscribe({
      next: (res) => {
        this.products.set(res.data ?? []);
        this.loadingProducts.set(false);
      },
      error: () => this.loadingProducts.set(false),
    });
  }

  loadServices(): void {
    this.loadingServices.set(true);
    this.servicesApi.list({ pageSize: 200, kind: 'SERVICE' }).subscribe({
      next: (res) => {
        this.services.set(res.data ?? []);
        this.loadingServices.set(false);
      },
      error: () => this.loadingServices.set(false),
    });
  }

  openNew(): void {
    this.editing.set(null);
    this.form = { name: '', description: '', price: null };
    this.dialogVisible = true;
  }

  openEdit(s: ServiceItem): void {
    this.editing.set(s);
    this.form = { name: s.name, description: s.description ?? '', price: s.price != null ? Number(s.price) : null };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name) return;
    this.saving.set(true);
    const dto: ServiceUpsert = {
      kind: 'SERVICE',
      name: this.form.name,
      description: this.form.description || undefined,
      price: this.form.price ?? undefined,
      status: 'active',
    };
    const editing = this.editing();
    const req = editing ? this.servicesApi.update(editing.id, dto) : this.servicesApi.create(dto);
    req.subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Servicio guardado.' });
        this.dialogVisible = false;
        this.saving.set(false);
        this.loadServices();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(s: ServiceItem): void {
    this.confirm.confirm({
      header: 'Eliminar servicio',
      message: `¿Eliminar "${s.name}"?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.servicesApi.remove(s.id).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Eliminado', detail: s.name });
            this.loadServices();
          },
          error: (err: HttpErrorResponse) =>
            this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
