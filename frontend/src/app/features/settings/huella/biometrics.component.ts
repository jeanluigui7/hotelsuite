import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { BiometricsApiService, type BiometricDevice, type DeviceEnrollment } from '../services/biometrics-api.service';
import { UsersApiService, type UserRow } from '../../hr/services/users-api.service';

interface DeviceForm {
  id?: string;
  name: string;
  ip: string;
  port: number;
  notes: string;
}

const STATUS_META: Record<string, { label: string; severity: 'success' | 'secondary' | 'danger' }> = {
  online: { label: 'En línea', severity: 'success' },
  offline: { label: 'Desconectado', severity: 'secondary' },
  error: { label: 'Error', severity: 'danger' },
};

@Component({
  selector: 'app-biometrics',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule, TooltipModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Huella Digital</h1>
          <p class="muted">Lectores ZKTeco (TCP 4370). La lectura real requiere el equipo en la red.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo dispositivo" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>IP : Puerto</th><th style="width:9rem">Estado</th><th style="width:8rem">Tiempo real</th><th style="width:22rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.ip }}:{{ row.port }}</td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td>
              <p-tag [value]="row.realtimeActive ? 'Escuchando' : 'Inactivo'" [severity]="row.realtimeActive ? 'success' : 'secondary'" />
            </td>
            <td class="cat-actions">
              @if (canEdit) { <p-button label="Probar" icon="pi pi-wifi" size="small" severity="secondary" (onClick)="test(row)" [loading]="busyId() === row.id" /> }
              @if (canEdit && !row.realtimeActive) { <p-button label="Conectar" icon="pi pi-play" size="small" (onClick)="connect(row)" /> }
              @if (canEdit && row.realtimeActive) { <p-button label="Detener" icon="pi pi-stop" size="small" severity="warn" (onClick)="disconnect(row)" /> }
              @if (canEdit) { <p-button icon="pi pi-users" [text]="true" (onClick)="openEnroll(row)" pTooltip="Enrolamiento" /> }
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin dispositivos.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- Dispositivo -->
    <p-dialog [(visible)]="deviceVisible" [modal]="true" [style]="{ width: '440px' }" [header]="deviceForm.id ? 'Editar dispositivo' : 'Nuevo dispositivo'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="deviceForm.name" />
        <div class="row">
          <div class="col"><label>IP</label><input pInputText [(ngModel)]="deviceForm.ip" placeholder="192.168.1.201" /></div>
          <div class="col"><label>Puerto</label><p-inputNumber [(ngModel)]="deviceForm.port" [useGrouping]="false" styleClass="w-full" /></div>
        </div>
        <label>Notas</label>
        <input pInputText [(ngModel)]="deviceForm.notes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="deviceVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="saveDevice()" />
      </ng-template>
    </p-dialog>

    <!-- Enrolamiento -->
    <p-dialog [(visible)]="enrollVisible" [modal]="true" [style]="{ width: '560px' }" header="Enrolamiento de usuarios">
      <div class="cat-form">
        <p class="muted">Mapea el ID de usuario del huellero con un usuario del sistema.</p>
        <div class="add-row">
          <p-select [options]="users()" optionLabel="name" optionValue="id" [(ngModel)]="enrollForm.userId" placeholder="Usuario" styleClass="grow" />
          <input pInputText [(ngModel)]="enrollForm.deviceUserId" placeholder="ID en huellero" class="duid" />
          <p-button icon="pi pi-plus" label="Enrolar" (onClick)="enroll()" [loading]="saving()" />
        </div>
        <table class="lines">
          <thead><tr><th>ID huellero</th><th>Usuario</th><th></th></tr></thead>
          <tbody>
            @for (e of enrollments(); track e.id) {
              <tr>
                <td>{{ e.deviceUserId }}</td>
                <td>{{ e.name }}</td>
                <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeEnroll(e)" /></td>
              </tr>
            }
            @if (enrollments().length === 0) { <tr><td colspan="3" class="muted center">Sin enrolamientos.</td></tr> }
          </tbody>
        </table>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="enrollVisible = false" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .add-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.6rem; }
      :host ::ng-deep .grow { flex: 1; }
      .duid { width: 140px; }
      table.lines { width: 100%; border-collapse: collapse; }
      table.lines th, table.lines td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--p-content-border-color, #2b2b30); text-align: left; font-size: 0.85rem; }
    `,
  ],
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class BiometricsComponent implements OnInit {
  private readonly api = inject(BiometricsApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<BiometricDevice[]>([]);
  readonly users = signal<UserRow[]>([]);
  readonly enrollments = signal<DeviceEnrollment[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);

  deviceVisible = false;
  deviceForm: DeviceForm = { name: '', ip: '', port: 4370, notes: '' };

  enrollVisible = false;
  enrollDeviceId: string | null = null;
  enrollForm = { userId: null as string | null, deviceUserId: '' };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.usersApi.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.users.set(res.data ?? []));
    this.reload();
  }

  meta(s: string) {
    return STATUS_META[s] ?? { label: s, severity: 'secondary' as const };
  }

  reload(): void {
    this.loading.set(true);
    this.api.devices.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.deviceForm = { name: '', ip: '', port: 4370, notes: '' };
    this.deviceVisible = true;
  }

  openEdit(row: BiometricDevice): void {
    this.deviceForm = { id: row.id, name: row.name, ip: row.ip, port: row.port, notes: row.notes ?? '' };
    this.deviceVisible = true;
  }

  saveDevice(): void {
    if (!this.deviceForm.name || !this.deviceForm.ip) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Nombre e IP requeridos.' });
      return;
    }
    const { id, ...dto } = this.deviceForm;
    this.saving.set(true);
    const req$ = id ? this.api.devices.update(id, dto) : this.api.devices.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.deviceVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Dispositivo guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  test(row: BiometricDevice): void {
    this.busyId.set(row.id);
    this.api.test(row.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.messages.add({ severity: 'success', summary: 'Conexión OK', detail: 'El dispositivo respondió.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.messages.add({ severity: 'error', summary: 'Sin conexión', detail: err.error?.error?.message ?? 'No respondió.' });
        this.reload();
      },
    });
  }

  connect(row: BiometricDevice): void {
    this.api.connect(row.id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Conectado', detail: 'Escucha en tiempo real activa.' }); this.reload(); },
      error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo conectar.' }),
    });
  }

  disconnect(row: BiometricDevice): void {
    this.api.disconnect(row.id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Detenido', detail: 'Escucha detenida.' }); this.reload(); },
      error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo detener.' }),
    });
  }

  openEnroll(row: BiometricDevice): void {
    this.enrollDeviceId = row.id;
    this.enrollForm = { userId: null, deviceUserId: '' };
    this.loadEnrollments();
    this.enrollVisible = true;
  }

  private loadEnrollments(): void {
    if (!this.enrollDeviceId) return;
    this.api.enrollments(this.enrollDeviceId).subscribe((res) => this.enrollments.set(res.data ?? []));
  }

  enroll(): void {
    if (!this.enrollDeviceId || !this.enrollForm.userId || !this.enrollForm.deviceUserId) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Usuario e ID del huellero.' });
      return;
    }
    this.saving.set(true);
    this.api.enroll(this.enrollDeviceId, { userId: this.enrollForm.userId, deviceUserId: this.enrollForm.deviceUserId }).subscribe({
      next: () => {
        this.saving.set(false);
        this.enrollForm = { userId: null, deviceUserId: '' };
        this.messages.add({ severity: 'success', summary: 'Enrolado', detail: 'Usuario mapeado.' });
        this.loadEnrollments();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo enrolar.' });
      },
    });
  }

  removeEnroll(e: DeviceEnrollment): void {
    if (!this.enrollDeviceId) return;
    this.api.removeEnrollment(this.enrollDeviceId, e.id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Enrolamiento eliminado.' }); this.loadEnrollments(); },
      error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
    });
  }

  confirmDelete(row: BiometricDevice): void {
    this.confirm.confirm({
      header: 'Eliminar dispositivo',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.devices.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Dispositivo eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
