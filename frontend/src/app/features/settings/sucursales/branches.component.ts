import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CrudApi } from '../../../core/http/crud-api';
import { AuthService } from '../../../core/auth/auth.service';

interface BranchRow {
  id: string;
  name: string;
  address?: string | null;
  taxId?: string | null;
  legalName?: string | null;
  phone?: string | null;
  email?: string | null;
  currency: string;
  cutoffHour: number;
  status: string;
}
interface BranchUpsert {
  name: string;
  address?: string;
  taxId?: string;
  legalName?: string;
  phone?: string;
  email?: string;
  currency: string;
  cutoffHour: number;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-branches',
  standalone: true,
  imports: [FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, ToggleSwitchModule],
  template: `
    <section>
      <header class="head">
        <div><h1>Sucursales</h1><p class="muted">Gestiona las sucursales del hotel. La sucursal activa se cambia desde la barra superior.</p></div>
        <p-button label="Nueva sucursal" icon="pi pi-plus" (onClick)="openNew()" />
      </header>

      <p-table [value]="items()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="items().length > 15" [rows]="15">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>Dirección</th><th>RUC</th><th style="width:6rem">Moneda</th><th style="width:6rem">Corte</th><th style="width:7rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-b>
          <tr>
            <td><strong>{{ b.name }}</strong></td>
            <td class="muted">{{ b.address || '—' }}</td>
            <td class="muted">{{ b.taxId || '—' }}</td>
            <td>{{ b.currency }}</td>
            <td>{{ b.cutoffHour }}:00</td>
            <td><p-tag [value]="b.status === 'active' ? 'Activa' : 'Inactiva'" [severity]="b.status === 'active' ? 'success' : 'secondary'" /></td>
            <td>
              <p-button icon="pi pi-pencil" [text]="true" size="small" (onClick)="openEdit(b)" />
              <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="confirmDelete(b)" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="7" class="muted center">Sin sucursales.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [header]="editing() ? 'Editar sucursal' : 'Nueva sucursal'" [style]="{ width: '36rem' }">
      <div class="form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" placeholder="Ej. RIZZOS" />
        <div class="row2">
          <div>
            <label>RUC</label>
            <input pInputText [(ngModel)]="form.taxId" placeholder="20XXXXXXXXX" />
          </div>
          <div>
            <label>Razón social</label>
            <input pInputText [(ngModel)]="form.legalName" placeholder="Opcional" />
          </div>
        </div>
        <label>Dirección</label>
        <input pInputText [(ngModel)]="form.address" placeholder="Av. ..." />
        <div class="row2">
          <div>
            <label>Teléfono</label>
            <input pInputText [(ngModel)]="form.phone" placeholder="Opcional" />
          </div>
          <div>
            <label>Correo</label>
            <input pInputText [(ngModel)]="form.email" placeholder="Opcional" />
          </div>
        </div>
        <div class="row2">
          <div>
            <label>Moneda</label>
            <input pInputText [(ngModel)]="form.currency" maxlength="3" placeholder="PEN" />
          </div>
          <div>
            <label>Hora de corte de turno (0-23)</label>
            <p-inputNumber [(ngModel)]="form.cutoffHour" [min]="0" [max]="23" />
          </div>
        </div>
        <div class="switch"><p-toggleswitch [(ngModel)]="form.active" /> <span>Activa</span></div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [disabled]="!form.name || form.name.length < 2" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .center { text-align: center; }
      .form { display: flex; flex-direction: column; gap: 0.4rem; }
      .form label { font-size: 0.85rem; color: var(--p-text-muted-color, #6b7280); margin-top: 0.5rem; }
      .form input[pInputText] { width: 100%; }
      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
      .row2 > div { display: flex; flex-direction: column; }
      .switch { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.85rem; }
    `,
  ],
})
export class BranchesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  private readonly api = new CrudApi<BranchRow, BranchUpsert>(this.http, 'branches');

  readonly items = signal<BranchRow[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<BranchRow | null>(null);

  dialogVisible = false;
  form: { name: string; address: string; taxId: string; legalName: string; phone: string; email: string; currency: string; cutoffHour: number; active: boolean } = this.empty();

  ngOnInit(): void {
    this.load();
  }

  private empty(): typeof this.form {
    return { name: '', address: '', taxId: '', legalName: '', phone: '', email: '', currency: 'PEN', cutoffHour: 0, active: true };
  }

  load(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 200 }).subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.editing.set(null);
    this.form = this.empty();
    this.dialogVisible = true;
  }

  openEdit(b: BranchRow): void {
    this.editing.set(b);
    this.form = {
      name: b.name,
      address: b.address ?? '',
      taxId: b.taxId ?? '',
      legalName: b.legalName ?? '',
      phone: b.phone ?? '',
      email: b.email ?? '',
      currency: b.currency,
      cutoffHour: b.cutoffHour,
      active: b.status === 'active',
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name || this.form.name.length < 2) return;
    this.saving.set(true);
    const dto: BranchUpsert = {
      name: this.form.name,
      address: this.form.address || undefined,
      taxId: this.form.taxId || undefined,
      legalName: this.form.legalName || undefined,
      phone: this.form.phone || undefined,
      email: this.form.email || undefined,
      currency: (this.form.currency || 'PEN').toUpperCase(),
      cutoffHour: this.form.cutoffHour,
      status: this.form.active ? 'active' : 'inactive',
    };
    const editing = this.editing();
    const req = editing ? this.api.update(editing.id, dto) : this.api.create(dto);
    req.subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Sucursal guardada.' });
        this.dialogVisible = false;
        this.saving.set(false);
        this.load();
        // Refresca el selector de sucursales del topbar.
        this.auth.loadBranches().subscribe();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(b: BranchRow): void {
    this.confirm.confirm({
      header: 'Eliminar sucursal',
      message: `¿Eliminar la sucursal "${b.name}"? Solo es posible si no tiene datos asociados.`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.api.remove(b.id).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Eliminada', detail: b.name });
            this.load();
            this.auth.loadBranches().subscribe();
          },
          error: (err: HttpErrorResponse) =>
            this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar (¿tiene datos asociados?).' }),
        });
      },
    });
  }
}
