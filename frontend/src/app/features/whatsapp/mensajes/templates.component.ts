import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextarea } from 'primeng/inputtextarea';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { WhatsappApiService, TEMPLATE_VARIABLES, type MessageLog, type MessageTemplate } from '../services/whatsapp-api.service';

interface Form {
  id?: string;
  name: string;
  body: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-wa-templates',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputTextarea, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Configuración de Mensajes</h1>
          <p class="muted">Plantillas con variables: {{ varsHint }}</p>
        </div>
        @if (canCreate) { <p-button label="Nueva plantilla" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="8" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>Mensaje</th><th style="width:8rem">Estado</th><th style="width:12rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.body }}</td>
            <td><p-tag [value]="row.status === 'active' ? 'Activa' : 'Inactiva'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              <p-button label="Probar" icon="pi pi-send" size="small" (onClick)="openSend(row)" />
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="muted center">Sin plantillas.</td></tr></ng-template>
      </p-table>

      <h3>Mensajes enviados</h3>
      <p-table [value]="logs()" [paginator]="true" [rows]="8" styleClass="p-datatable-sm">
        <ng-template pTemplate="header"><tr><th style="width:12rem">Fecha</th><th>Para</th><th>Mensaje</th><th style="width:7rem">Estado</th></tr></ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td class="muted">{{ r.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td>{{ r.to }}</td>
            <td class="muted">{{ r.body }}</td>
            <td><p-tag [value]="r.status === 'SENT' ? 'Enviado' : 'Fallido'" [severity]="r.status === 'SENT' ? 'success' : 'danger'" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="muted center">Sin envíos.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- Plantilla -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '520px' }" [header]="form.id ? 'Editar plantilla' : 'Nueva plantilla'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Mensaje (usa variables como {{ '{cliente}' }})</label>
        <textarea pInputTextarea [(ngModel)]="form.body" rows="4"></textarea>
        <label>Estado</label>
        <p-select [options]="statusOpts" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <!-- Probar envío -->
    <p-dialog [(visible)]="sendVisible" [modal]="true" [style]="{ width: '520px' }" header="Probar envío">
      <div class="cat-form">
        <p class="muted">Plantilla: <strong>{{ sendTemplate?.name }}</strong></p>
        <label>Número destino</label>
        <input pInputText [(ngModel)]="sendTo" placeholder="+51 999..." />
        <h4>Variables</h4>
        @for (v of vars; track v) {
          <label>{{ '{' + v + '}' }}</label>
          <input pInputText [(ngModel)]="sendVars[v]" />
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="sendVisible = false" />
        <p-button label="Enviar prueba" icon="pi pi-send" [loading]="saving()" (onClick)="doSend()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`h3 { margin: 1.5rem 0 0.5rem; font-size: 1rem; } h4 { margin: 0.8rem 0 0.3rem; font-size: 0.9rem; color: var(--p-text-muted-color, #a1a1aa); } textarea { width: 100%; }`],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class WaTemplatesComponent implements OnInit {
  private readonly api = inject(WhatsappApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<MessageTemplate[]>([]);
  readonly logs = signal<MessageLog[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly vars = TEMPLATE_VARIABLES;
  readonly varsHint = TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(', ');
  readonly statusOpts = [
    { label: 'Activa', value: 'active' },
    { label: 'Inactiva', value: 'inactive' },
  ];

  dialogVisible = false;
  form: Form = { name: '', body: '', status: 'active' };

  sendVisible = false;
  sendTemplate: MessageTemplate | null = null;
  sendTo = '';
  sendVars: Record<string, string> = {};

  readonly canCreate = this.auth.can('whatsapp', 'create');
  readonly canEdit = this.auth.can('whatsapp', 'edit');
  readonly canDelete = this.auth.can('whatsapp', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.listTemplates().subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.logs().subscribe((res) => this.logs.set(res.data ?? []));
  }

  openNew(): void {
    this.form = { name: '', body: '', status: 'active' };
    this.dialogVisible = true;
  }

  openEdit(row: MessageTemplate): void {
    this.form = { id: row.id, name: row.name, body: row.body, status: row.status as 'active' | 'inactive' };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name || !this.form.body) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Nombre y mensaje requeridos.' });
      return;
    }
    const { id, ...dto } = this.form;
    this.saving.set(true);
    const req$ = id ? this.api.updateTemplate(id, dto) : this.api.createTemplate(dto);
    req$.subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Plantilla guardada.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  openSend(row: MessageTemplate): void {
    this.sendTemplate = row;
    this.sendTo = '';
    this.sendVars = {};
    this.sendVisible = true;
  }

  doSend(): void {
    if (!this.sendTemplate || !this.sendTo) {
      this.messages.add({ severity: 'warn', summary: 'Falta destino', detail: 'Ingresa el número.' });
      return;
    }
    this.saving.set(true);
    this.api.send({ templateId: this.sendTemplate.id, to: this.sendTo, variables: this.sendVars }).subscribe({
      next: () => { this.saving.set(false); this.sendVisible = false; this.messages.add({ severity: 'success', summary: 'Enviado', detail: 'Mensaje de prueba enviado.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo enviar.' }); },
    });
  }

  confirmDelete(row: MessageTemplate): void {
    this.confirm.confirm({
      header: 'Eliminar plantilla',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.removeTemplate(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Plantilla eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
