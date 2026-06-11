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
import { WhatsappApiService, type WhatsAppInstance } from '../services/whatsapp-api.service';

interface Form {
  id?: string;
  name: string;
  provider: 'mock' | 'cloud' | 'twilio';
  phoneNumber: string;
  config: string;
}

@Component({
  selector: 'app-wa-instances',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Instancias de WhatsApp</h1>
          <p class="muted">Conexiones de envío. El proveedor real (Cloud API/Twilio) se configura luego.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva instancia" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>Proveedor</th><th>Número</th><th style="width:10rem">Estado</th><th style="width:14rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.provider }}</td>
            <td>{{ row.phoneNumber }}</td>
            <td><p-tag [value]="row.status === 'connected' ? 'Conectada' : 'Desconectada'" [severity]="row.status === 'connected' ? 'success' : 'secondary'" /></td>
            <td class="cat-actions">
              @if (canEdit) {
                <p-button [label]="row.status === 'connected' ? 'Desconectar' : 'Conectar'" size="small"
                          [severity]="row.status === 'connected' ? 'warn' : 'success'" (onClick)="toggle(row)" />
                <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" />
              }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin instancias.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '460px' }" [header]="form.id ? 'Editar instancia' : 'Nueva instancia'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <div class="row">
          <div class="col">
            <label>Proveedor</label>
            <p-select [options]="providers" optionLabel="label" optionValue="value" [(ngModel)]="form.provider" styleClass="w-full" />
          </div>
          <div class="col"><label>Número</label><input pInputText [(ngModel)]="form.phoneNumber" /></div>
        </div>
        <label>Configuración (token/credenciales)</label>
        <input pInputText [(ngModel)]="form.config" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class WaInstancesComponent implements OnInit {
  private readonly api = inject(WhatsappApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<WhatsAppInstance[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly providers = [
    { label: 'Mock (local)', value: 'mock' },
    { label: 'Cloud API', value: 'cloud' },
    { label: 'Twilio', value: 'twilio' },
  ];

  dialogVisible = false;
  form: Form = { name: '', provider: 'mock', phoneNumber: '', config: '' };

  readonly canCreate = this.auth.can('whatsapp', 'create');
  readonly canEdit = this.auth.can('whatsapp', 'edit');
  readonly canDelete = this.auth.can('whatsapp', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.listInstances().subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { name: '', provider: 'mock', phoneNumber: '', config: '' };
    this.dialogVisible = true;
  }

  openEdit(row: WhatsAppInstance): void {
    this.form = { id: row.id, name: row.name, provider: row.provider, phoneNumber: row.phoneNumber ?? '', config: row.config ?? '' };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name) {
      this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Ingresa el nombre.' });
      return;
    }
    const { id, ...dto } = this.form;
    this.saving.set(true);
    const req$ = id ? this.api.updateInstance(id, dto) : this.api.createInstance(dto);
    req$.subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Instancia guardada.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  toggle(row: WhatsAppInstance): void {
    this.api.toggleInstance(row.id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Estado actualizado', detail: 'Instancia actualizada.' }); this.reload(); },
      error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo cambiar.' }),
    });
  }

  confirmDelete(row: WhatsAppInstance): void {
    this.confirm.confirm({
      header: 'Eliminar instancia',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.removeInstance(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Instancia eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
