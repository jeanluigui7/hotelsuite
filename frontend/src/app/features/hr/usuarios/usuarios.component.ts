import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { TableModule, type TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { UsersApiService, type UserRow, type UserUpsert } from '../services/users-api.service';
import { RolesApiService, type RoleListItem } from '../../settings/services/roles-api.service';

interface UserForm extends UserUpsert {
  id?: string;
}

const EMPTY_FORM: UserForm = {
  name: '',
  email: '',
  password: '',
  roleId: '',
  status: 'active',
  branchIds: [],
};

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MultiSelectModule,
    PasswordModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Usuarios</h1>
          <p class="muted">Gestión de usuarios, roles y sucursales asignadas.</p>
        </div>
        @if (canCreate) {
          <p-button label="Nuevo usuario" icon="pi pi-plus" (onClick)="openNew()" />
        }
      </header>

      <div class="toolbar">
        <span class="p-input-icon-left search">
          <input
            pInputText
            type="text"
            placeholder="Buscar por nombre o email…"
            [(ngModel)]="search"
            (keyup.enter)="reload()"
          />
        </span>
        <p-button label="Buscar" severity="secondary" (onClick)="reload()" />
      </div>

      <p-table
        [value]="items()"
        [lazy]="true"
        (onLazyLoad)="load($event)"
        [paginator]="true"
        [rows]="pageSize"
        [totalRecords]="total()"
        [loading]="loading()"
        [rowsPerPageOptions]="[10, 20, 50]"
        dataKey="id"
        sortMode="single"
        styleClass="p-datatable-sm"
      >
        <ng-template pTemplate="header">
          <tr>
            <th pSortableColumn="name">Nombre</th>
            <th pSortableColumn="email">Email</th>
            <th>Rol</th>
            <th>Sucursales</th>
            <th pSortableColumn="status">Estado</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td>{{ row.email }}</td>
            <td>{{ row.role.name }}</td>
            <td>{{ row.branchIds.length }}</td>
            <td>
              <p-tag
                [value]="row.status === 'active' ? 'Activo' : 'Inactivo'"
                [severity]="row.status === 'active' ? 'success' : 'danger'"
              />
            </td>
            <td class="actions">
              @if (canEdit) {
                <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" />
              }
              @if (canDelete) {
                <p-button
                  icon="pi pi-trash"
                  severity="danger"
                  [text]="true"
                  (onClick)="confirmDelete(row)"
                />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="6" class="muted center">Sin usuarios.</td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog
      [(visible)]="dialogVisible"
      [modal]="true"
      [style]="{ width: '460px' }"
      [header]="form.id ? 'Editar usuario' : 'Nuevo usuario'"
    >
      <div class="form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />

        <label>Email</label>
        <input pInputText type="email" [(ngModel)]="form.email" />

        <label>{{ form.id ? 'Nueva contraseña (opcional)' : 'Contraseña' }}</label>
        <p-password
          [(ngModel)]="form.password"
          [feedback]="false"
          [toggleMask]="true"
          [inputStyle]="{ width: '100%' }"
          styleClass="w-full"
        />

        <label>Rol</label>
        <p-select
          [options]="roles()"
          optionLabel="name"
          optionValue="id"
          [(ngModel)]="form.roleId"
          placeholder="Seleccionar rol"
          styleClass="w-full"
        />

        <label>Sucursales</label>
        <p-multiSelect
          [options]="branchOptions()"
          optionLabel="name"
          optionValue="id"
          [(ngModel)]="form.branchIds"
          placeholder="Seleccionar sucursales"
          styleClass="w-full"
        />

        <label>Estado</label>
        <p-select
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          [(ngModel)]="form.status"
          styleClass="w-full"
        />
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 1.25rem;
      }
      h1 {
        margin: 0;
        font-size: 1.4rem;
      }
      .muted {
        color: var(--p-text-muted-color, #a1a1aa);
        font-size: 0.9rem;
        margin: 0.25rem 0 0;
      }
      .center {
        text-align: center;
      }
      .toolbar {
        display: flex;
        gap: 0.6rem;
        margin-bottom: 1rem;
      }
      .toolbar .search,
      .toolbar input {
        width: 320px;
        max-width: 100%;
      }
      .actions {
        display: flex;
        gap: 0.2rem;
      }
      .form {
        display: flex;
        flex-direction: column;
      }
      .form label {
        margin: 0.85rem 0 0.35rem;
        font-size: 0.85rem;
        color: var(--p-text-muted-color, #a1a1aa);
      }
      .form input[pInputText] {
        width: 100%;
      }
      :host ::ng-deep .w-full {
        width: 100%;
      }
    `,
  ],
})
export class UsuariosComponent implements OnInit {
  private readonly usersApi = inject(UsersApiService);
  private readonly rolesApi = inject(RolesApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<UserRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly roles = signal<RoleListItem[]>([]);
  readonly branchOptions = this.auth.branches;

  readonly pageSize = 20;
  search = '';

  dialogVisible = false;
  form: UserForm = { ...EMPTY_FORM };

  private lastEvent: TableLazyLoadEvent | null = null;

  readonly statusOptions = [
    { label: 'Activo', value: 'active' },
    { label: 'Inactivo', value: 'inactive' },
  ];

  readonly canCreate = this.auth.can('hr', 'create');
  readonly canEdit = this.auth.can('hr', 'edit');
  readonly canDelete = this.auth.can('hr', 'delete');

  ngOnInit(): void {
    this.rolesApi.options().subscribe((res) => this.roles.set(res.data ?? []));
  }

  load(event: TableLazyLoadEvent): void {
    this.lastEvent = event;
    const rows = event.rows ?? this.pageSize;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    const sortField = typeof event.sortField === 'string' ? event.sortField : undefined;
    this.loading.set(true);
    this.usersApi
      .list({
        page,
        pageSize: rows,
        sortBy: sortField,
        sortDir: event.sortOrder === -1 ? 'desc' : 'asc',
        search: this.search || undefined,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.data ?? []);
          this.total.set(res.meta?.total ?? 0);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  reload(): void {
    this.load(this.lastEvent ?? { first: 0, rows: this.pageSize });
  }

  openNew(): void {
    this.form = { ...EMPTY_FORM, branchIds: [] };
    this.dialogVisible = true;
  }

  openEdit(row: UserRow): void {
    this.form = {
      id: row.id,
      name: row.name,
      email: row.email,
      password: '',
      roleId: row.role.id,
      status: row.status as 'active' | 'inactive',
      branchIds: [...row.branchIds],
    };
    this.dialogVisible = true;
  }

  save(): void {
    const { id, password, ...rest } = this.form;
    const payload: UserUpsert = { ...rest, branchIds: this.form.branchIds };
    if (password) payload.password = password;

    this.saving.set(true);
    const req$ = id ? this.usersApi.update(id, payload) : this.usersApi.create(payload);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({
          severity: 'success',
          summary: 'Guardado',
          detail: id ? 'Usuario actualizado.' : 'Usuario creado.',
        });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.error?.message ?? 'No se pudo guardar.',
        });
      },
    });
  }

  confirmDelete(row: UserRow): void {
    this.confirm.confirm({
      header: 'Eliminar usuario',
      message: `¿Eliminar a ${row.name}? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.usersApi.remove(row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Usuario eliminado.' });
            this.reload();
          },
          error: (err: HttpErrorResponse) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: err.error?.error?.message ?? 'No se pudo eliminar.',
            });
          },
        });
      },
    });
  }
}
