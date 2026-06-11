import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CrudApi } from '../../../core/http/crud-api';

interface WifiCredential {
  id: string;
  ssid: string;
  password: string;
  voucher?: string | null;
  note?: string | null;
  status: string;
}
interface WifiUpsert {
  ssid: string;
  password: string;
  voucher?: string;
  note?: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-wifi-pool',
  standalone: true,
  imports: [FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, ToggleSwitchModule],
  template: `
    <section>
      <header class="head">
        <div><h1>Pool WiFi</h1><p class="muted">Credenciales y vouchers de WiFi para entregar a los huéspedes.</p></div>
        <p-button label="Nueva credencial" icon="pi pi-plus" (onClick)="openNew()" />
      </header>

      <p-table [value]="items()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="items().length > 15" [rows]="15">
        <ng-template pTemplate="header">
          <tr><th>Red (SSID)</th><th>Contraseña</th><th>Voucher</th><th>Nota</th><th style="width:7rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-w>
          <tr>
            <td><strong>{{ w.ssid }}</strong></td>
            <td><code>{{ w.password }}</code></td>
            <td>{{ w.voucher || '—' }}</td>
            <td class="muted">{{ w.note || '—' }}</td>
            <td><p-tag [value]="w.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="w.status === 'active' ? 'success' : 'secondary'" /></td>
            <td>
              <p-button icon="pi pi-pencil" [text]="true" size="small" (onClick)="openEdit(w)" />
              <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="confirmDelete(w)" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin credenciales registradas.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [header]="editing() ? 'Editar credencial' : 'Nueva credencial'" [style]="{ width: '32rem' }">
      <div class="form">
        <label>Red (SSID)</label>
        <input pInputText [(ngModel)]="form.ssid" placeholder="Ej. Hotel-Huespedes" />
        <label>Contraseña</label>
        <input pInputText [(ngModel)]="form.password" placeholder="Clave de la red" />
        <label>Voucher (opcional)</label>
        <input pInputText [(ngModel)]="form.voucher" placeholder="Código de acceso, si aplica" />
        <label>Nota (opcional)</label>
        <input pInputText [(ngModel)]="form.note" placeholder="Ej. piso 2, vigencia 24h" />
        <div class="switch"><p-toggleswitch [(ngModel)]="form.active" /> <span>Activo</span></div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [disabled]="!form.ssid || !form.password" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .center { text-align: center; }
      code { background: var(--p-content-hover-background, #f1f5f9); padding: 0.1rem 0.4rem; border-radius: 4px; }
      .form { display: flex; flex-direction: column; gap: 0.4rem; }
      .form label { font-size: 0.85rem; color: var(--p-text-muted-color, #6b7280); margin-top: 0.5rem; }
      .switch { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.85rem; }
    `,
  ],
})
export class WifiPoolComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  private readonly api = new CrudApi<WifiCredential, WifiUpsert>(this.http, 'wifi-credentials');

  readonly items = signal<WifiCredential[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<WifiCredential | null>(null);

  dialogVisible = false;
  form: { ssid: string; password: string; voucher: string; note: string; active: boolean } = {
    ssid: '',
    password: '',
    voucher: '',
    note: '',
    active: true,
  };

  ngOnInit(): void {
    this.load();
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
    this.form = { ssid: '', password: '', voucher: '', note: '', active: true };
    this.dialogVisible = true;
  }

  openEdit(w: WifiCredential): void {
    this.editing.set(w);
    this.form = { ssid: w.ssid, password: w.password, voucher: w.voucher ?? '', note: w.note ?? '', active: w.status === 'active' };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.ssid || !this.form.password) return;
    this.saving.set(true);
    const dto: WifiUpsert = {
      ssid: this.form.ssid,
      password: this.form.password,
      voucher: this.form.voucher || undefined,
      note: this.form.note || undefined,
      status: this.form.active ? 'active' : 'inactive',
    };
    const editing = this.editing();
    const req = editing ? this.api.update(editing.id, dto) : this.api.create(dto);
    req.subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Credencial guardada.' });
        this.dialogVisible = false;
        this.saving.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(w: WifiCredential): void {
    this.confirm.confirm({
      header: 'Eliminar credencial',
      message: `¿Eliminar la red "${w.ssid}"?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.api.remove(w.id).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Eliminado', detail: w.ssid });
            this.load();
          },
          error: (err: HttpErrorResponse) =>
            this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
