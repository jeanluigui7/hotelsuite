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
import type { DocumentType, Guest } from '../catalogs/catalog.models';
import { DOCUMENT_TYPE_OPTIONS, STATUS_OPTIONS } from '../catalogs/catalog.constants';

interface Form {
  id?: string;
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  status: 'active' | 'inactive';
}

const EMPTY: Form = {
  documentType: 'DNI',
  documentNumber: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  notes: '',
  status: 'active',
};

@Component({
  selector: 'app-guests',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Clientes</h1>
          <p class="muted">Directorio global de clientes / huéspedes (compartido entre sucursales).</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo cliente" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <div class="cat-toolbar">
        <input pInputText placeholder="Buscar por nombre o documento…" [(ngModel)]="search" (keyup.enter)="reload()" />
        <p-button label="Buscar" severity="secondary" (onClick)="reload()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Documento</th>
            <th>Nombre</th>
            <th>Contacto</th>
            <th style="width: 8rem">Estado</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.documentType }} {{ row.documentNumber }}</td>
            <td>{{ row.firstName }} {{ row.lastName }}</td>
            <td class="muted">{{ row.phone }}{{ row.phone && row.email ? ' · ' : '' }}{{ row.email }}</td>
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
          <tr><td colspan="5" class="muted center">Sin clientes.</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '520px' }"
              [header]="form.id ? 'Editar cliente' : 'Nuevo cliente'">
      <div class="cat-form">
        <div class="row">
          <div class="col">
            <label>Tipo de documento</label>
            <p-select [options]="docTypes" optionLabel="label" optionValue="value" [(ngModel)]="form.documentType" styleClass="w-full" />
          </div>
          <div class="col">
            <label>Número</label>
            <input pInputText [(ngModel)]="form.documentNumber" />
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Nombres</label>
            <input pInputText [(ngModel)]="form.firstName" />
          </div>
          <div class="col">
            <label>Apellidos</label>
            <input pInputText [(ngModel)]="form.lastName" />
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Teléfono</label>
            <input pInputText [(ngModel)]="form.phone" />
          </div>
          <div class="col">
            <label>Email</label>
            <input pInputText type="email" [(ngModel)]="form.email" />
          </div>
        </div>
        <label>Notas</label>
        <input pInputText [(ngModel)]="form.notes" />
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
export class GuestsComponent implements OnInit {
  private readonly api = inject(CatalogApiService).guests;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Guest[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;
  readonly docTypes = DOCUMENT_TYPE_OPTIONS;

  search = '';
  dialogVisible = false;
  form: Form = { ...EMPTY };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 50, sortBy: 'firstName', search: this.search || undefined }).subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { ...EMPTY };
    this.dialogVisible = true;
  }

  openEdit(row: Guest): void {
    this.form = {
      id: row.id,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      firstName: row.firstName,
      lastName: row.lastName ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      notes: row.notes ?? '',
      status: row.status as 'active' | 'inactive',
    };
    this.dialogVisible = true;
  }

  save(): void {
    const { id, ...dto } = this.form;
    this.saving.set(true);
    const req$ = id ? this.api.update(id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Cliente guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Guest): void {
    this.confirm.confirm({
      header: 'Eliminar cliente',
      message: `¿Eliminar a ${row.firstName} ${row.lastName ?? ''}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Cliente eliminado.' });
            this.reload();
          },
          error: (err: HttpErrorResponse) =>
            this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
