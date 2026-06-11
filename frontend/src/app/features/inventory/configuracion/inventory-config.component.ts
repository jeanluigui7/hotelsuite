import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { InventoryApiService } from '../services/inventory-api.service';
import type { Warehouse } from '../services/inventory.models';

@Component({
  selector: 'app-inventory-config',
  standalone: true,
  imports: [FormsModule, SelectModule, InputNumberModule, ToggleSwitchModule, ButtonModule],
  template: `
    <section>
      <header class="head">
        <h1>Configuración de Inventario</h1>
        <p class="muted">Parámetros por defecto para productos, ventas y alertas de stock.</p>
      </header>

      <div class="card">
        <div class="field">
          <label>Almacén por defecto para ventas</label>
          <p-select [options]="warehouses()" [(ngModel)]="form.defaultWarehouseId" optionValue="id" optionLabel="name"
                    [showClear]="true" placeholder="Ninguno" styleClass="w" />
          <small class="muted">Almacén del que se descuenta el stock al registrar ventas.</small>
        </div>

        <div class="field">
          <label>Punto de reposición por defecto</label>
          <p-inputNumber [(ngModel)]="form.defaultReorderPoint" [min]="0" [showButtons]="true" />
          <small class="muted">Sugerencia inicial al crear productos nuevos.</small>
        </div>

        <div class="field row">
          <p-toggleswitch [(ngModel)]="form.lowStockAlert" />
          <div>
            <label>Alertar stock bajo</label>
            <small class="muted block">Resalta los productos en o por debajo de su punto de reposición.</small>
          </div>
        </div>

        <div class="actions">
          <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .block { display: block; }
      .card { background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 12px; padding: 1.5rem; max-width: 540px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      .field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1.25rem; }
      .field.row { flex-direction: row; align-items: center; gap: 0.85rem; }
      label { font-size: 0.9rem; font-weight: 600; }
      small { font-size: 0.8rem; }
      :host ::ng-deep .w { width: 100%; }
      .actions { margin-top: 0.5rem; }
    `,
  ],
})
export class InventoryConfigComponent implements OnInit {
  private readonly inventory = inject(InventoryApiService);
  private readonly toast = inject(MessageService);

  readonly warehouses = signal<Warehouse[]>([]);
  readonly saving = signal(false);
  form: { defaultWarehouseId: string | null; defaultReorderPoint: number; lowStockAlert: boolean } = {
    defaultWarehouseId: null,
    defaultReorderPoint: 0,
    lowStockAlert: false,
  };

  ngOnInit(): void {
    this.inventory.warehouses.list({ pageSize: 100 }).subscribe((res) => this.warehouses.set(res.data ?? []));
    this.inventory.getConfig().subscribe((res) => {
      if (res.data) this.form = { ...res.data };
    });
  }

  save(): void {
    this.saving.set(true);
    this.inventory.updateConfig(this.form).subscribe({
      next: (res) => {
        if (res.data) this.form = { ...res.data };
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuración de inventario actualizada.' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }
}
