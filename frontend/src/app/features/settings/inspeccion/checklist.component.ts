import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { ChecklistItem } from '../catalogs/catalog.models';
import { STATUS_OPTIONS } from '../catalogs/catalog.constants';

interface Form {
  id?: string;
  name: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-checklist',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Inspección de Limpieza</h1>
          <p class="muted">Ítems del checklist de inspección de habitaciones.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo ítem" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Ítem</th><th style="width:8rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td><p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="3" class="muted center">Sin ítems de inspección.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '420px' }" [header]="form.id ? 'Editar ítem' : 'Nuevo ítem'">
      <div class="cat-form">
        <label>Nombre del ítem</label>
        <input pInputText [(ngModel)]="form.name" placeholder="Ej. Cambio de sábanas" />
        <label>Estado</label>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class ChecklistComponent implements OnInit {
  private readonly api = inject(CatalogApiService).checklistItems;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<ChecklistItem[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;

  dialogVisible = false;
  form: Form = { name: '', status: 'active' };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { name: '', status: 'active' };
    this.dialogVisible = true;
  }

  openEdit(row: ChecklistItem): void {
    this.form = { id: row.id, name: row.name, status: row.status as 'active' | 'inactive' };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name) {
      this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Ingresa el ítem.' });
      return;
    }
    const dto = { name: this.form.name, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Ítem guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: ChecklistItem): void {
    this.confirm.confirm({
      header: 'Eliminar ítem',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Ítem eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
