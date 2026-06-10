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
import type { RoomAttribute } from '../catalogs/catalog.models';
import { STATUS_OPTIONS } from '../catalogs/catalog.constants';

interface Form {
  id?: string;
  name: string;
  icon: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-room-attributes',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Atributos de Habitación</h1>
          <p class="muted">Características asignables a los tipos de habitación (TV, A/C, jacuzzi…).</p>
        </div>
        @if (canCreate) {
          <p-button label="Nuevo atributo" icon="pi pi-plus" (onClick)="openNew()" />
        }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th style="width: 4rem"></th>
            <th>Nombre</th>
            <th style="width: 8rem">Estado</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>@if (row.icon) {<i [class]="row.icon"></i>}</td>
            <td>{{ row.name }}</td>
            <td>
              <p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'"
                     [severity]="row.status === 'active' ? 'success' : 'danger'" />
            </td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="4" class="muted center">Sin atributos.</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '420px' }"
              [header]="form.id ? 'Editar atributo' : 'Nuevo atributo'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Ícono (clase PrimeIcons, opcional)</label>
        <input pInputText [(ngModel)]="form.icon" placeholder="pi pi-star" />
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
export class RoomAttributesComponent implements OnInit {
  private readonly api = inject(CatalogApiService).roomAttributes;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<RoomAttribute[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;

  dialogVisible = false;
  form: Form = { name: '', icon: '', status: 'active' };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { name: '', icon: '', status: 'active' };
    this.dialogVisible = true;
  }

  openEdit(row: RoomAttribute): void {
    this.form = { id: row.id, name: row.name, icon: row.icon ?? '', status: row.status as 'active' | 'inactive' };
    this.dialogVisible = true;
  }

  save(): void {
    const dto = { name: this.form.name, icon: this.form.icon, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Atributo guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: RoomAttribute): void {
    this.confirm.confirm({
      header: 'Eliminar atributo',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Atributo eliminado.' });
            this.reload();
          },
          error: (err: HttpErrorResponse) =>
            this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
