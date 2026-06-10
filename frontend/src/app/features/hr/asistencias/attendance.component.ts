import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { HrApiService, type Attendance } from '../services/hr-api.service';
import { UsersApiService, type UserRow } from '../services/users-api.service';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Asistencias</h1>
          <p class="muted">Marcas de entrada y salida del personal (manual o biométrica).</p>
        </div>
        @if (canCreate) { <p-button label="Registrar marca" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="15" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Usuario</th><th style="width:7rem">Tipo</th><th style="width:8rem">Origen</th><th style="width:12rem">Fecha/Hora</th><th>Nota</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.userName }}</td>
            <td><p-tag [value]="row.type === 'IN' ? 'Entrada' : 'Salida'" [severity]="row.type === 'IN' ? 'success' : 'secondary'" /></td>
            <td><p-tag [value]="row.source === 'BIOMETRIC' ? 'Huella' : 'Manual'" severity="info" /></td>
            <td>{{ row.at | date: 'dd/MM/yy HH:mm' }}</td>
            <td class="muted">{{ row.note }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin asistencias.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '420px' }" header="Registrar marca">
      <div class="cat-form">
        <label>Usuario</label>
        <p-select [options]="users()" optionLabel="name" optionValue="id" [(ngModel)]="form.userId" placeholder="Seleccionar" styleClass="w-full" />
        <label>Tipo</label>
        <p-select [options]="typeOpts" optionLabel="label" optionValue="value" [(ngModel)]="form.type" styleClass="w-full" />
        <label>Nota</label>
        <input pInputText [(ngModel)]="form.note" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Registrar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class AttendanceComponent implements OnInit {
  private readonly hr = inject(HrApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly items = signal<Attendance[]>([]);
  readonly users = signal<UserRow[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly typeOpts = [
    { label: 'Entrada', value: 'IN' },
    { label: 'Salida', value: 'OUT' },
  ];

  dialogVisible = false;
  form = { userId: null as string | null, type: 'IN' as 'IN' | 'OUT', note: '' };

  readonly canCreate = this.auth.can('hr', 'create');

  ngOnInit(): void {
    this.usersApi.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.users.set(res.data ?? []));
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.hr.listAttendances({ pageSize: 100 }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { userId: null, type: 'IN', note: '' };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.userId) {
      this.messages.add({ severity: 'warn', summary: 'Falta usuario', detail: 'Selecciona el usuario.' });
      return;
    }
    this.saving.set(true);
    this.hr.createAttendance({ userId: this.form.userId, type: this.form.type, note: this.form.note || undefined }).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Registrada', detail: 'Marca registrada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar.' });
      },
    });
  }
}
