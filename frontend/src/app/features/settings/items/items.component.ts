import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { Item, ItemKind } from '../catalogs/catalog.models';
import { ITEM_KIND_OPTIONS, STATUS_OPTIONS } from '../catalogs/catalog.constants';

interface Form {
  id?: string;
  kind: ItemKind;
  name: string;
  description: string;
  price: number | null;
  status: 'active' | 'inactive';
}

const EMPTY: Form = { kind: 'CHECKIN', name: '', description: '', price: null, status: 'active' };

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Items</h1>
          <p class="muted">Items configurables de Check-In, Por Tarifa, Servicios/Penalidades y Mantenimiento.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo item" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <div class="cat-toolbar">
        <p-select [options]="kindFilterOptions" optionLabel="label" optionValue="value"
                  [(ngModel)]="kindFilter" (onChange)="reload()" placeholder="Todos los tipos" styleClass="kind-filter" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th style="width: 12rem">Tipo</th>
            <th>Nombre</th>
            <th style="width: 8rem">Precio</th>
            <th style="width: 8rem">Estado</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td><p-tag [value]="kindLabel(row.kind)" severity="secondary" /></td>
            <td>{{ row.name }}</td>
            <td>{{ row.price }}</td>
            <td><p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin items.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '480px' }" [header]="form.id ? 'Editar item' : 'Nuevo item'">
      <div class="cat-form">
        <label>Tipo</label>
        <p-select [options]="kindOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.kind" styleClass="w-full" />
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="form.description" />
        <div class="row">
          <div class="col">
            <label>Precio</label>
            <p-inputNumber [(ngModel)]="form.price" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" />
          </div>
          <div class="col">
            <label>Estado</label>
            <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
          </div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`:host ::ng-deep .kind-filter { width: 240px; }`],
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class ItemsComponent implements OnInit {
  private readonly api = inject(CatalogApiService).items;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Item[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;
  readonly kindOptions = ITEM_KIND_OPTIONS;
  readonly kindFilterOptions = [{ label: 'Todos los tipos', value: '' }, ...ITEM_KIND_OPTIONS];

  kindFilter = '';
  dialogVisible = false;
  form: Form = { ...EMPTY };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  kindLabel(kind: string): string {
    return ITEM_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name', kind: this.kindFilter || undefined }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { ...EMPTY, kind: (this.kindFilter as ItemKind) || 'CHECKIN' };
    this.dialogVisible = true;
  }

  openEdit(row: Item): void {
    this.form = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description ?? '',
      price: row.price != null ? Number(row.price) : null,
      status: row.status as 'active' | 'inactive',
    };
    this.dialogVisible = true;
  }

  save(): void {
    const dto = {
      kind: this.form.kind,
      name: this.form.name,
      description: this.form.description,
      price: this.form.price ?? undefined,
      status: this.form.status,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Item guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Item): void {
    this.confirm.confirm({
      header: 'Eliminar item',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Item eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
