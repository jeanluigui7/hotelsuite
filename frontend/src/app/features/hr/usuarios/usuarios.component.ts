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
import { TooltipModule } from 'primeng/tooltip';
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
    TooltipModule,
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
                <p-button icon="pi pi-key" severity="warn" [text]="true" pTooltip="Restablecer contraseña" tooltipPosition="top" (onClick)="confirmReset(row)" />
              }
              @if (isSuperAdmin) {
                <p-button icon="pi pi-eye" severity="help" [text]="true" pTooltip="Ver contraseña" tooltipPosition="top" (onClick)="openPassword(row)" />
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

    <p-dialog [(visible)]="resetVisible" [modal]="true" [style]="{ width: '440px' }" header="Contraseña temporal">
      <p class="muted">
        Se generó una contraseña temporal para <strong>{{ resetUserName }}</strong>. Cópiala y entrégasela;
        el usuario deberá cambiarla en su próximo ingreso. <strong>No se volverá a mostrar.</strong>
      </p>
      <div class="temp-pw">
        <code>{{ resetPasswordValue }}</code>
        <p-button icon="pi pi-copy" [text]="true" pTooltip="Copiar" (onClick)="copyTemp()" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Listo" icon="pi pi-check" (onClick)="resetVisible = false" />
      </ng-template>
    </p-dialog>

    <p-dialog [(visible)]="pwVisible" [modal]="true" [style]="{ width: '460px' }" [header]="'Contraseña · ' + (pwUser?.name || '')">
      @if (pwLoading()) {
        <p class="muted"><i class="pi pi-spin pi-spinner"></i> Consultando…</p>
      } @else {
        @if (pwAvailable) {
          <p class="muted" style="margin:0 0 0.4rem">Contraseña actual de <strong>{{ pwUser?.name }}</strong>:</p>
          <div class="temp-pw">
            <code>{{ pwValue }}</code>
            <p-button icon="pi pi-copy" [text]="true" pTooltip="Copiar" (onClick)="copyPw()" />
          </div>
        } @else {
          <p class="muted">Esta contraseña <strong>aún no está registrada</strong> (es anterior a esta función o nunca se asignó desde aquí). No se puede recuperar; asígnale una para poder verla.</p>
        }
        <div class="assign">
          <label>{{ pwAvailable ? 'Asignar otra contraseña' : 'Nueva contraseña' }}</label>
          <input pInputText type="text" [(ngModel)]="pwAssignInput" placeholder="Mínimo 8 caracteres" />
          <p-button label="Asignar" icon="pi pi-check" [loading]="pwAssigning()" [disabled]="pwAssignInput.trim().length < 8" (onClick)="assignPassword()" />
        </div>
        <small class="hint">Al asignar una contraseña, el usuario la seguirá usando tal cual (no se le obliga a cambiarla) y se cerrarán sus sesiones activas.</small>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" (onClick)="pwVisible = false" />
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
      .temp-pw {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: 0.4rem;
        padding: 0.6rem 0.8rem;
        background: var(--p-content-hover-background, #f3f4f6);
        border: 1px dashed var(--p-content-border-color, #d1d5db);
        border-radius: 8px;
      }
      .temp-pw code {
        font-size: 1.15rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
      .assign {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.9rem;
      }
      .assign label {
        flex-basis: 100%;
        font-size: 0.82rem;
        color: var(--p-text-muted-color, #a1a1aa);
      }
      .assign input[pInputText] {
        flex: 1;
        min-width: 160px;
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

  // Restablecimiento de contraseña (clave temporal mostrada una sola vez).
  resetVisible = false;
  resetUserName = '';
  resetPasswordValue = '';

  // Ver / asignar contraseña (solo cargo máximo).
  pwVisible = false;
  pwUser: UserRow | null = null;
  readonly pwLoading = signal(false);
  readonly pwAssigning = signal(false);
  pwAvailable = false;
  pwValue: string | null = null;
  pwAssignInput = '';

  private lastEvent: TableLazyLoadEvent | null = null;

  readonly statusOptions = [
    { label: 'Activo', value: 'active' },
    { label: 'Inactivo', value: 'inactive' },
  ];

  readonly canCreate = this.auth.can('hr', 'create');
  readonly canEdit = this.auth.can('hr', 'edit');
  readonly canDelete = this.auth.can('hr', 'delete');
  /** Ver contraseñas: SOLO el cargo máximo (Super Admin). */
  readonly isSuperAdmin = this.auth.user()?.isSuperAdmin ?? false;

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

  confirmReset(row: UserRow): void {
    this.confirm.confirm({
      header: 'Restablecer contraseña',
      message: `Se generará una contraseña temporal para ${row.name} y se cerrarán sus sesiones activas. ¿Continuar?`,
      icon: 'pi pi-key',
      acceptLabel: 'Restablecer',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.usersApi.resetPassword(row.id).subscribe({
          next: (res) => {
            this.resetUserName = row.name;
            this.resetPasswordValue = res.data?.temporaryPassword ?? '';
            this.resetVisible = true;
          },
          error: (err: HttpErrorResponse) => {
            this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo restablecer.' });
          },
        });
      },
    });
  }

  copyTemp(): void {
    navigator.clipboard?.writeText(this.resetPasswordValue).then(
      () => this.messages.add({ severity: 'success', summary: 'Copiado', detail: 'Contraseña temporal copiada.' }),
      () => {},
    );
  }

  openPassword(row: UserRow): void {
    this.pwUser = row;
    this.pwVisible = true;
    this.pwLoading.set(true);
    this.pwAvailable = false;
    this.pwValue = null;
    this.pwAssignInput = '';
    this.usersApi.viewPassword(row.id).subscribe({
      next: (res) => {
        this.pwAvailable = res.data?.available ?? false;
        this.pwValue = res.data?.password ?? null;
        this.pwLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.pwLoading.set(false);
        this.pwVisible = false;
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo consultar.' });
      },
    });
  }

  assignPassword(): void {
    const pass = this.pwAssignInput.trim();
    if (!this.pwUser || pass.length < 8) return;
    this.pwAssigning.set(true);
    this.usersApi.resetPassword(this.pwUser.id, { password: pass, forceChange: false }).subscribe({
      next: () => {
        this.pwAssigning.set(false);
        this.pwAvailable = true;
        this.pwValue = pass;
        this.pwAssignInput = '';
        this.messages.add({ severity: 'success', summary: 'Contraseña asignada', detail: `${this.pwUser?.name}: clave actualizada.` });
      },
      error: (err: HttpErrorResponse) => {
        this.pwAssigning.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo asignar.' });
      },
    });
  }

  copyPw(): void {
    if (!this.pwValue) return;
    navigator.clipboard?.writeText(this.pwValue).then(
      () => this.messages.add({ severity: 'success', summary: 'Copiado', detail: 'Contraseña copiada.' }),
      () => {},
    );
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
