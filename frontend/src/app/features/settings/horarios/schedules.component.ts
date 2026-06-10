import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { Schedule } from '../catalogs/catalog.models';
import { DAY_OPTIONS, STATUS_OPTIONS } from '../catalogs/catalog.constants';

interface Form {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  status: 'active' | 'inactive';
}

const EMPTY: Form = { name: '', startTime: '08:00', endTime: '16:00', daysOfWeek: [], status: 'active' };

@Component({
  selector: 'app-schedules',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, MultiSelectModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Horarios</h1>
          <p class="muted">Turnos con horario y días, para asignación de personal.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo horario" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Nombre</th>
            <th style="width: 10rem">Horario</th>
            <th>Días</th>
            <th style="width: 8rem">Estado</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td>{{ row.startTime }} – {{ row.endTime }}</td>
            <td>
              @for (d of row.daysOfWeek; track d) {
                <p-tag [value]="dayLabel(d)" severity="secondary" styleClass="day-tag" />
              }
            </td>
            <td><p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin horarios.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '480px' }" [header]="form.id ? 'Editar horario' : 'Nuevo horario'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <div class="row">
          <div class="col">
            <label>Hora inicio</label>
            <input pInputText type="time" [(ngModel)]="form.startTime" />
          </div>
          <div class="col">
            <label>Hora fin</label>
            <input pInputText type="time" [(ngModel)]="form.endTime" />
          </div>
        </div>
        <label>Días</label>
        <p-multiSelect [options]="dayOptions" optionLabel="label" optionValue="value"
                       [(ngModel)]="form.daysOfWeek" placeholder="Seleccionar días" styleClass="w-full" />
        <label>Estado</label>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`:host ::ng-deep .day-tag { margin-right: 0.25rem; }`],
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class SchedulesComponent implements OnInit {
  private readonly api = inject(CatalogApiService).schedules;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Schedule[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;
  readonly dayOptions = DAY_OPTIONS;

  dialogVisible = false;
  form: Form = { ...EMPTY };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  dayLabel(d: number): string {
    return DAY_OPTIONS.find((o) => o.value === d)?.label ?? String(d);
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { ...EMPTY, daysOfWeek: [] };
    this.dialogVisible = true;
  }

  openEdit(row: Schedule): void {
    this.form = {
      id: row.id,
      name: row.name,
      startTime: row.startTime,
      endTime: row.endTime,
      daysOfWeek: [...row.daysOfWeek],
      status: row.status as 'active' | 'inactive',
    };
    this.dialogVisible = true;
  }

  save(): void {
    const dto = {
      name: this.form.name,
      startTime: this.form.startTime,
      endTime: this.form.endTime,
      daysOfWeek: this.form.daysOfWeek,
      status: this.form.status,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Horario guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Schedule): void {
    this.confirm.confirm({
      header: 'Eliminar horario',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Horario eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
