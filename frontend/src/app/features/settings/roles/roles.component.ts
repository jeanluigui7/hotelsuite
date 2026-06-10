import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule, type TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import {
  RolesApiService,
  type Permission,
  type RoleListItem,
} from '../services/roles-api.service';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Tablero',
  operations: 'Operaciones',
  finance: 'Finanzas',
  inventory: 'Inventario',
  logistics: 'Logística',
  hr: 'Recursos Humanos',
  reports: 'Reportes',
  whatsapp: 'WhatsApp',
  settings: 'Configuraciones',
};

const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'approve'] as const;
const ACTION_LABELS: Record<string, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
  approve: 'Aprobar',
};

interface MatrixRow {
  module: string;
  label: string;
  cells: (Permission | null)[];
}

interface RoleForm {
  id?: string;
  name: string;
  description: string;
  isSystem: boolean;
}

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    TableModule,
    TagModule,
  ],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Autenticación por Roles</h1>
          <p class="muted">Roles y permisos granulares por módulo y acción.</p>
        </div>
        @if (canCreate) {
          <p-button label="Nuevo rol" icon="pi pi-plus" (onClick)="openNew()" />
        }
      </header>

      <p-table
        [value]="items()"
        [lazy]="true"
        (onLazyLoad)="load($event)"
        [paginator]="true"
        [rows]="pageSize"
        [totalRecords]="total()"
        [loading]="loading()"
        dataKey="id"
        styleClass="p-datatable-sm"
      >
        <ng-template pTemplate="header">
          <tr>
            <th pSortableColumn="name">Rol</th>
            <th>Descripción</th>
            <th style="width: 9rem">Permisos</th>
            <th style="width: 8rem">Usuarios</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>
              {{ row.name }}
              @if (row.isSystem) {
                <p-tag value="Sistema" severity="info" styleClass="ml" />
              }
            </td>
            <td class="muted">{{ row.description }}</td>
            <td>{{ row._count.permissions }}</td>
            <td>{{ row._count.users }}</td>
            <td class="actions">
              @if (canEdit) {
                <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" />
              }
              @if (canDelete && !row.isSystem) {
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
            <td colspan="5" class="muted center">Sin roles.</td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog
      [(visible)]="dialogVisible"
      [modal]="true"
      [style]="{ width: '720px' }"
      [header]="form.id ? 'Editar rol' : 'Nuevo rol'"
    >
      <div class="form-row">
        <div class="field">
          <label>Nombre</label>
          <input pInputText [(ngModel)]="form.name" [disabled]="form.isSystem" />
        </div>
        <div class="field grow">
          <label>Descripción</label>
          <input pInputText [(ngModel)]="form.description" />
        </div>
      </div>

      <h3>Permisos</h3>
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="mod">Módulo</th>
              @for (action of actions; track action) {
                <th>
                  <button type="button" class="col-toggle" (click)="toggleColumn(action)">
                    {{ actionLabel(action) }}
                  </button>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of matrix(); track row.module) {
              <tr>
                <td class="mod">{{ row.label }}</td>
                @for (cell of row.cells; track $index) {
                  <td class="center">
                    @if (cell) {
                      <p-checkbox
                        [binary]="true"
                        [ngModel]="selected().has(cell.id)"
                        (ngModelChange)="toggle(cell.id)"
                      />
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>

      <ng-template pTemplate="footer">
        <span class="muted count">{{ selected().size }} permisos seleccionados</span>
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
      h3 {
        margin: 1.25rem 0 0.5rem;
        font-size: 1rem;
      }
      .muted {
        color: var(--p-text-muted-color, #a1a1aa);
        font-size: 0.9rem;
      }
      .center {
        text-align: center;
      }
      .actions {
        display: flex;
        gap: 0.2rem;
      }
      :host ::ng-deep .ml {
        margin-left: 0.5rem;
      }
      .form-row {
        display: flex;
        gap: 1rem;
      }
      .field {
        display: flex;
        flex-direction: column;
      }
      .field.grow {
        flex: 1;
      }
      .field label {
        margin: 0 0 0.35rem;
        font-size: 0.85rem;
        color: var(--p-text-muted-color, #a1a1aa);
      }
      .field input[pInputText] {
        width: 100%;
      }
      .matrix-wrap {
        overflow-x: auto;
      }
      table.matrix {
        width: 100%;
        border-collapse: collapse;
      }
      table.matrix th,
      table.matrix td {
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--p-content-border-color, #2b2b30);
        text-align: center;
      }
      table.matrix th.mod,
      table.matrix td.mod {
        text-align: left;
      }
      .col-toggle {
        background: transparent;
        border: 0;
        color: var(--p-text-color, #e4e4e7);
        cursor: pointer;
        font-size: 0.82rem;
      }
      .col-toggle:hover {
        color: var(--p-primary-color, #34d399);
      }
      .count {
        margin-right: auto;
      }
    `,
  ],
})
export class RolesComponent implements OnInit {
  private readonly rolesApi = inject(RolesApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<RoleListItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  private readonly permissions = signal<Permission[]>([]);
  readonly selected = signal<Set<string>>(new Set());

  readonly actions = ACTION_ORDER;
  readonly pageSize = 20;

  dialogVisible = false;
  form: RoleForm = { name: '', description: '', isSystem: false };

  private lastEvent: TableLazyLoadEvent | null = null;

  /** Builds the module × action matrix from the permission catalog. */
  readonly matrix = computed<MatrixRow[]>(() => {
    const byModule = new Map<string, Permission[]>();
    for (const perm of this.permissions()) {
      const list = byModule.get(perm.module) ?? [];
      list.push(perm);
      byModule.set(perm.module, list);
    }
    return [...byModule.keys()].map((module) => ({
      module,
      label: MODULE_LABELS[module] ?? module,
      cells: ACTION_ORDER.map(
        (action) => byModule.get(module)?.find((p) => p.action === action) ?? null,
      ),
    }));
  });

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.rolesApi.permissions().subscribe((res) => this.permissions.set(res.data ?? []));
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  load(event: TableLazyLoadEvent): void {
    this.lastEvent = event;
    const rows = event.rows ?? this.pageSize;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    const sortField = typeof event.sortField === 'string' ? event.sortField : undefined;
    this.loading.set(true);
    this.rolesApi
      .list({
        page,
        pageSize: rows,
        sortBy: sortField,
        sortDir: event.sortOrder === -1 ? 'desc' : 'asc',
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
    this.form = { name: '', description: '', isSystem: false };
    this.selected.set(new Set());
    this.dialogVisible = true;
  }

  openEdit(row: RoleListItem): void {
    this.rolesApi.getById(row.id).subscribe((res) => {
      const role = res.data;
      this.form = {
        id: role.id,
        name: role.name,
        description: role.description ?? '',
        isSystem: role.isSystem,
      };
      this.selected.set(new Set(role.permissionIds));
      this.dialogVisible = true;
    });
  }

  toggle(permId: string): void {
    const next = new Set(this.selected());
    if (next.has(permId)) next.delete(permId);
    else next.add(permId);
    this.selected.set(next);
  }

  /** Toggle every permission of a given action column on/off. */
  toggleColumn(action: string): void {
    const colIds = this.permissions()
      .filter((p) => p.action === action)
      .map((p) => p.id);
    const next = new Set(this.selected());
    const allOn = colIds.every((id) => next.has(id));
    for (const id of colIds) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    this.selected.set(next);
  }

  save(): void {
    const dto = {
      name: this.form.name,
      description: this.form.description || undefined,
      permissionIds: [...this.selected()],
    };
    this.saving.set(true);
    const req$ = this.form.id
      ? this.rolesApi.update(this.form.id, dto)
      : this.rolesApi.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({
          severity: 'success',
          summary: 'Guardado',
          detail: this.form.id ? 'Rol actualizado.' : 'Rol creado.',
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

  confirmDelete(row: RoleListItem): void {
    this.confirm.confirm({
      header: 'Eliminar rol',
      message: `¿Eliminar el rol "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.rolesApi.remove(row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Rol eliminado.' });
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
