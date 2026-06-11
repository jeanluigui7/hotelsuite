import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { RemindersApiService, type Reminder } from '../services/reminders-api.service';
import { WhatsappApiService, type MessageTemplate } from '../../whatsapp/services/whatsapp-api.service';

interface Form {
  id?: string;
  name: string;
  templateId: string | null;
  trigger: string;
  active: boolean;
}

@Component({
  selector: 'app-reminders',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, ToggleSwitchModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Recordatorios</h1>
          <p class="muted">Recordatorios basados en plantillas de mensaje.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo recordatorio" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>Plantilla</th><th>Disparador</th><th style="width:8rem">Activo</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ templateName(row.templateId) }}</td>
            <td class="muted">{{ row.trigger }}</td>
            <td><p-tag [value]="row.active ? 'Sí' : 'No'" [severity]="row.active ? 'success' : 'secondary'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin recordatorios.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '460px' }" [header]="form.id ? 'Editar recordatorio' : 'Nuevo recordatorio'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Plantilla</label>
        <p-select [options]="templates()" optionLabel="name" optionValue="id" [(ngModel)]="form.templateId" [showClear]="true" placeholder="Sin plantilla" styleClass="w-full" />
        <label>Disparador</label>
        <input pInputText [(ngModel)]="form.trigger" placeholder="Ej. 1h antes del check-out" />
        <div class="switch"><p-toggleswitch [(ngModel)]="form.active" /> <span>Activo</span></div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`.switch { display: flex; align-items: center; gap: 0.6rem; margin-top: 1rem; }`],
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class RemindersComponent implements OnInit {
  private readonly api = inject(RemindersApiService).reminders;
  private readonly wa = inject(WhatsappApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Reminder[]>([]);
  readonly templates = signal<MessageTemplate[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  dialogVisible = false;
  form: Form = { name: '', templateId: null, trigger: '', active: true };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.wa.listTemplates().subscribe((res) => this.templates.set(res.data ?? []));
    this.reload();
  }

  templateName(id: string | null | undefined): string {
    return id ? (this.templates().find((t) => t.id === id)?.name ?? '—') : '—';
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { name: '', templateId: null, trigger: '', active: true };
    this.dialogVisible = true;
  }

  openEdit(row: Reminder): void {
    this.form = { id: row.id, name: row.name, templateId: row.templateId ?? null, trigger: row.trigger ?? '', active: row.active };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name) {
      this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Ingresa el nombre.' });
      return;
    }
    const { id, ...dto } = this.form;
    this.saving.set(true);
    const req$ = id ? this.api.update(id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Recordatorio guardado.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  confirmDelete(row: Reminder): void {
    this.confirm.confirm({
      header: 'Eliminar recordatorio',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Recordatorio eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
