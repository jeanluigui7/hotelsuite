import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';

@Component({
  selector: 'app-checkouts',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TableModule, TagModule, ButtonModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Check-Outs</h1>
          <p class="muted">Estancias activas pendientes de salida. En naranja, las que ya pasaron su hora.</p>
        </div>
        <div class="counts">
          <span class="pill">{{ stays().length }} activas</span>
          <span class="pill alert" [class.hidden]="overdueCount() === 0">{{ overdueCount() }} vencidas</span>
        </div>
      </header>

      <p-table [value]="stays()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="stays().length > 12" [rows]="12">
        <ng-template pTemplate="header">
          <tr>
            <th>Habitación</th><th>Huésped</th><th>Check-in</th><th>Salida prevista</th>
            <th style="width:8rem">Estado</th><th style="width:8rem">Precio</th><th style="width:9rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-s>
          <tr [class.overdue]="isOverdue(s)">
            <td><strong>{{ s.room.number }}</strong></td>
            <td>{{ s.guest.firstName }} {{ s.guest.lastName }}<br /><span class="muted sm">{{ s.guest.documentNumber }}</span></td>
            <td>{{ s.checkInAt | date: 'dd/MM HH:mm' }}</td>
            <td>{{ s.plannedCheckoutAt | date: 'dd/MM HH:mm' }}</td>
            <td>
              <p-tag [value]="isOverdue(s) ? 'Vencida' : 'En curso'" [severity]="isOverdue(s) ? 'warn' : 'info'" />
            </td>
            <td>{{ s.priceAgreed | number: '1.2-2' }}</td>
            <td><p-button label="Check-out" size="small" icon="pi pi-sign-out" (onClick)="confirmCheckout(s)" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" class="muted center">No hay estancias activas.</td></tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .sm { font-size: 0.8rem; }
      .center { text-align: center; }
      .counts { display: flex; gap: 0.5rem; }
      .pill { background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 999px; padding: 0.35rem 0.85rem; font-size: 0.85rem; }
      .pill.alert { background: #fff7ed; border-color: #fdba74; color: #c2410c; }
      .pill.hidden { display: none; }
      :host ::ng-deep tr.overdue td { background: #fff7ed; }
    `,
  ],
})
export class CheckoutsComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  readonly stays = signal<Stay[]>([]);
  readonly loading = signal(false);
  readonly overdueCount = computed(() => this.stays().filter((s) => this.isOverdue(s)).length);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.ops.stays({ status: 'OPEN', sortBy: 'plannedCheckoutAt', sortDir: 'asc', pageSize: 200 }).subscribe({
      next: (res) => {
        this.stays.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isOverdue(s: Stay): boolean {
    return !s.checkOutAt && new Date(s.plannedCheckoutAt).getTime() < Date.now();
  }

  confirmCheckout(s: Stay): void {
    this.confirm.confirm({
      header: 'Confirmar check-out',
      message: `¿Cerrar la estancia de la habitación ${s.room.number}? La habitación pasará a limpieza.`,
      acceptLabel: 'Check-out',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.ops.checkOut(s.id, 'CLEANING').subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Check-out realizado', detail: `Habitación ${s.room.number}` });
            this.load();
          },
          error: (err) =>
            this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo cerrar la estancia' }),
        });
      },
    });
  }
}
