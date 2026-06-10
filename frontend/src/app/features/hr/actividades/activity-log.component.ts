import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { HrApiService, type ActivityLog } from '../services/hr-api.service';

const ACTION_SEVERITY: Record<string, 'success' | 'info' | 'warn' | 'danger'> = {
  POST: 'success',
  PUT: 'info',
  PATCH: 'warn',
  DELETE: 'danger',
};

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Historial de Actividades</h1>
          <p class="muted">Auditoría de operaciones de escritura del sistema.</p>
        </div>
      </header>

      <div class="cat-toolbar">
        <input pInputText placeholder="Buscar (módulo, acción)…" [(ngModel)]="search" (keyup.enter)="reload()" />
        <p-button label="Buscar" severity="secondary" (onClick)="reload()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="20" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width:12rem">Fecha</th><th>Usuario</th><th style="width:8rem">Acción</th><th>Módulo</th><th>Detalle</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td class="muted">{{ row.createdAt | date: 'dd/MM/yy HH:mm:ss' }}</td>
            <td>{{ row.userEmail ?? '—' }}</td>
            <td><p-tag [value]="row.action" [severity]="sev(row.action)" /></td>
            <td>{{ row.module }}</td>
            <td class="muted">{{ row.summary }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin actividad.</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class ActivityLogComponent implements OnInit {
  private readonly hr = inject(HrApiService);

  readonly items = signal<ActivityLog[]>([]);
  readonly loading = signal(false);
  search = '';

  ngOnInit(): void {
    this.reload();
  }

  sev(action: string) {
    return ACTION_SEVERITY[action] ?? 'info';
  }

  reload(): void {
    this.loading.set(true);
    this.hr.listActivity({ pageSize: 100, search: this.search || undefined }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
