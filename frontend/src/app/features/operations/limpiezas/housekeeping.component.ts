import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { ChecklistItem } from '../../settings/catalogs/catalog.models';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product, Warehouse } from '../../inventory/services/inventory.models';
import { UsersApiService, type UserRow } from '../../hr/services/users-api.service';
import { OperationsApiService } from '../services/operations-api.service';
import type { HousekeepingTask, Room } from '../services/operations.models';

const STATUS_META: Record<string, { label: string; severity: 'warn' | 'info' | 'success' | 'secondary' }> = {
  PENDING: { label: 'Pendiente', severity: 'warn' },
  IN_PROGRESS: { label: 'En progreso', severity: 'info' },
  DONE: { label: 'Completada', severity: 'success' },
  INSPECTED: { label: 'Inspeccionada', severity: 'secondary' },
};

interface ConsLine { productId: string; warehouseId: string; quantity: number; name: string; }
interface InspectRow { checklistItemId: string; name: string; passed: boolean; }

@Component({
  selector: 'app-housekeeping',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, CheckboxModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Historial de Limpiezas</h1>
          <p class="muted">Asignación, ejecución e inspección de limpieza de habitaciones.</p>
        </div>
        @if (canCreate) { <p-button label="Asignar limpieza" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width:6rem">Hab.</th><th>Asignado a</th><th style="width:11rem">Creada</th><th style="width:9rem">Estado</th><th style="width:9rem">Resultado</th><th style="width:14rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.roomNumber }}</td>
            <td>{{ row.assignedToName ?? '—' }}</td>
            <td class="muted">{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td>
              @if (row.result !== 'PENDING') {
                <p-tag [value]="row.result === 'APPROVED' ? 'Aprobada' : 'Rechazada'" [severity]="row.result === 'APPROVED' ? 'success' : 'danger'" />
              } @else { <span class="muted">—</span> }
            </td>
            <td class="cat-actions">
              @if (canEdit && row.status === 'PENDING') { <p-button label="Iniciar" size="small" severity="secondary" (onClick)="start(row)" /> }
              @if (canEdit && row.status === 'IN_PROGRESS') { <p-button label="Completar" size="small" (onClick)="openComplete(row)" /> }
              @if (canApprove && row.status === 'DONE') { <p-button label="Inspeccionar" size="small" severity="help" (onClick)="openInspect(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin tareas de limpieza.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- Asignar -->
    <p-dialog [(visible)]="newVisible" [modal]="true" [style]="{ width: '440px' }" header="Asignar limpieza">
      <div class="cat-form">
        <label>Habitación</label>
        <p-select [options]="rooms()" optionValue="id" [(ngModel)]="newTask.roomId" placeholder="Seleccionar" styleClass="w-full">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }}</ng-template>
        </p-select>
        <label>Asignar a (opcional)</label>
        <p-select [options]="staff()" optionLabel="name" optionValue="id" [(ngModel)]="newTask.assignedToUserId" [showClear]="true" placeholder="Sin asignar" styleClass="w-full" />
        <label>Notas</label>
        <input pInputText [(ngModel)]="newTask.notes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="newVisible = false" />
        <p-button label="Asignar" icon="pi pi-check" [loading]="saving()" (onClick)="create()" />
      </ng-template>
    </p-dialog>

    <!-- Completar (consumo) -->
    <p-dialog [(visible)]="completeVisible" [modal]="true" [style]="{ width: '560px' }" header="Completar limpieza · consumo de amenities">
      <div class="cat-form">
        <p class="muted">Agrega los amenities consumidos (opcional).</p>
        <div class="add-row">
          <p-select [options]="products()" [(ngModel)]="pickProduct" optionValue="id" [filter]="true" filterBy="name" placeholder="Producto" styleClass="grow">
            <ng-template let-p pTemplate="item">{{ p.name }}</ng-template>
            <ng-template let-p pTemplate="selectedItem">{{ p.name }}</ng-template>
          </p-select>
          <p-select [options]="warehouses()" [(ngModel)]="pickWarehouse" optionLabel="name" optionValue="id" placeholder="Almacén" styleClass="grow" />
          <p-inputNumber [(ngModel)]="pickQty" [min]="1" styleClass="qty" />
          <p-button icon="pi pi-plus" (onClick)="addCons()" />
        </div>
        <table class="lines">
          <tbody>
            @for (c of consLines(); track $index) {
              <tr><td>{{ c.name }}</td><td>{{ c.quantity }}</td><td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeCons($index)" /></td></tr>
            }
            @if (consLines().length === 0) { <tr><td colspan="3" class="muted center">Sin consumo.</td></tr> }
          </tbody>
        </table>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="completeVisible = false" />
        <p-button label="Completar" icon="pi pi-check" [loading]="saving()" (onClick)="doComplete()" />
      </ng-template>
    </p-dialog>

    <!-- Inspeccionar -->
    <p-dialog [(visible)]="inspectVisible" [modal]="true" [style]="{ width: '480px' }" header="Inspección de limpieza">
      <div class="cat-form">
        @if (inspectRows().length === 0) {
          <p class="muted">No hay ítems de checklist configurados (Configuraciones › Inspección de Limpieza).</p>
        }
        @for (r of inspectRows(); track r.checklistItemId) {
          <div class="insp-row">
            <p-checkbox [(ngModel)]="r.passed" [binary]="true" [inputId]="r.checklistItemId" />
            <label [for]="r.checklistItemId">{{ r.name }}</label>
          </div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Rechazar" severity="danger" [text]="true" [loading]="saving()" (onClick)="doInspect(false)" />
        <p-button label="Aprobar" icon="pi pi-check" severity="success" [loading]="saving()" (onClick)="doInspect(true)" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .add-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.6rem; }
      :host ::ng-deep .grow { flex: 1; }
      :host ::ng-deep .qty { width: 80px; }
      table.lines { width: 100%; border-collapse: collapse; }
      table.lines td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--p-content-border-color, #2b2b30); font-size: 0.85rem; }
      .insp-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0; }
      .insp-row label { font-size: 0.9rem; }
    `,
  ],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class HousekeepingComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly inventory = inject(InventoryApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly items = signal<HousekeepingTask[]>([]);
  readonly rooms = signal<Room[]>([]);
  readonly staff = signal<UserRow[]>([]);
  readonly products = signal<Product[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly checklist = signal<ChecklistItem[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly consLines = signal<ConsLine[]>([]);
  readonly inspectRows = signal<InspectRow[]>([]);

  newVisible = false;
  newTask = { roomId: null as string | null, assignedToUserId: null as string | null, notes: '' };
  completeVisible = false;
  inspectVisible = false;
  currentId: string | null = null;
  pickProduct: string | null = null;
  pickWarehouse: string | null = null;
  pickQty = 1;

  readonly canCreate = this.auth.can('operations', 'create');
  readonly canEdit = this.auth.can('operations', 'edit');
  readonly canApprove = this.auth.can('operations', 'approve');

  ngOnInit(): void {
    this.ops.rooms.list({ pageSize: 200, sortBy: 'number' }).subscribe((res) => this.rooms.set(res.data ?? []));
    this.usersApi.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.staff.set(res.data ?? []));
    this.inventory.products.list({ pageSize: 200, sortBy: 'name' }).subscribe((res) => this.products.set(res.data ?? []));
    this.inventory.warehouses.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.warehouses.set(res.data ?? []));
    this.catalog.checklistItems.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.checklist.set((res.data ?? []).filter((c) => c.status === 'active')));
    this.reload();
  }

  meta(s: string) {
    return STATUS_META[s] ?? { label: s, severity: 'secondary' as const };
  }

  reload(): void {
    this.loading.set(true);
    this.ops.tasks({ pageSize: 100 }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.newTask = { roomId: null, assignedToUserId: null, notes: '' };
    this.newVisible = true;
  }

  create(): void {
    if (!this.newTask.roomId) {
      this.messages.add({ severity: 'warn', summary: 'Falta habitación', detail: 'Selecciona la habitación.' });
      return;
    }
    this.saving.set(true);
    this.ops.createTask({ roomId: this.newTask.roomId, assignedToUserId: this.newTask.assignedToUserId, notes: this.newTask.notes || undefined }).subscribe({
      next: () => { this.saving.set(false); this.newVisible = false; this.messages.add({ severity: 'success', summary: 'Asignada', detail: 'Tarea creada.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo asignar.' }); },
    });
  }

  start(row: HousekeepingTask): void {
    this.ops.startTask(row.id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Iniciada', detail: 'Limpieza en progreso.' }); this.reload(); },
      error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo iniciar.' }),
    });
  }

  openComplete(row: HousekeepingTask): void {
    this.currentId = row.id;
    this.consLines.set([]);
    this.pickProduct = null;
    this.pickWarehouse = null;
    this.pickQty = 1;
    this.completeVisible = true;
  }

  addCons(): void {
    const product = this.products().find((p) => p.id === this.pickProduct);
    if (!product || !this.pickWarehouse || this.pickQty < 1) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Producto, almacén y cantidad.' });
      return;
    }
    this.consLines.set([...this.consLines(), { productId: product.id, warehouseId: this.pickWarehouse, quantity: this.pickQty, name: product.name }]);
    this.pickProduct = null;
    this.pickQty = 1;
  }

  removeCons(i: number): void {
    this.consLines.set(this.consLines().filter((_, idx) => idx !== i));
  }

  doComplete(): void {
    if (!this.currentId) return;
    this.saving.set(true);
    this.ops.completeTask(this.currentId, this.consLines().map((c) => ({ productId: c.productId, warehouseId: c.warehouseId, quantity: c.quantity }))).subscribe({
      next: () => { this.saving.set(false); this.completeVisible = false; this.messages.add({ severity: 'success', summary: 'Completada', detail: 'Limpieza completada.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo completar.' }); },
    });
  }

  openInspect(row: HousekeepingTask): void {
    this.currentId = row.id;
    this.inspectRows.set(this.checklist().map((c) => ({ checklistItemId: c.id, name: c.name, passed: true })));
    this.inspectVisible = true;
  }

  doInspect(approved: boolean): void {
    if (!this.currentId) return;
    this.saving.set(true);
    this.ops.inspectTask(this.currentId, {
      approved,
      items: this.inspectRows().map((r) => ({ checklistItemId: r.checklistItemId, passed: r.passed })),
    }).subscribe({
      next: () => { this.saving.set(false); this.inspectVisible = false; this.messages.add({ severity: 'success', summary: approved ? 'Aprobada' : 'Rechazada', detail: approved ? 'Habitación liberada.' : 'Requiere re-limpieza.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo inspeccionar.' }); },
    });
  }
}
