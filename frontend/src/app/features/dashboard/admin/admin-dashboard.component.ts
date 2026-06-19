import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  DashboardApiService,
  type CajaSummary,
  type LimpiezaSummary,
  type RecepcionSummary,
} from '../dashboard-api.service';

interface StatCard {
  value: number | string;
  label: string;
  color: string; // gradiente CSS
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    <section class="dash">
      <!-- Pills de función rápida -->
      <div class="pills">
        <button class="pill purple" (click)="go('/operations/almacen-productos')"><i class="pi pi-box"></i> Productos</button>
        <button class="pill red" (click)="go('/operations/inventario-recepcion')"><i class="pi pi-inbox"></i> Recepción</button>
        <button class="pill orange" (click)="go('/operations/transferencia-ropa')"><i class="pi pi-sync"></i> Ropa</button>
        <button class="pill green" (click)="go('/inventory/inventario-limpieza')"><i class="pi pi-sparkles"></i> Amenidades</button>
        <button class="pill blue" (click)="go('/operations/gestion-limpieza')"><i class="pi pi-check-circle"></i> Limpieza</button>
      </div>

      <h1>Dashboard</h1>

      <div class="panels">
        <!-- Resumen de Recepción / Estancias -->
        <div class="panel">
          <h2>Resumen de Recepción / Estancias</h2>
          <div class="stat-grid">
            @for (s of recepcionCards(); track s.label) {
              <div class="stat" [style.background]="s.color">
                <span class="num">{{ s.value }}</span><span class="lbl">{{ s.label }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Resumen de Limpieza -->
        <div class="panel">
          <h2>Resumen de Limpieza</h2>
          <div class="stat-grid">
            @for (s of limpiezaCards(); track s.label) {
              <div class="stat" [style.background]="s.color">
                <span class="num">{{ s.value }}</span><span class="lbl">{{ s.label }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Resumen de Caja / Dinero -->
        <div class="panel">
          <h2>Resumen de Caja / Dinero</h2>
          @if (caja(); as c) {
            @if (c.open) {
              <div class="money">
                <div class="money-col">
                  <span class="mc-title efectivo">Efectivo</span>
                  <span class="mc-big">S/.{{ (c.paymentsByMethod?.['CASH'] ?? 0) | number: '1.2-2' }}</span>
                  <span class="muted">Total en efectivo</span>
                </div>
                <div class="money-col">
                  <span class="mc-title virtual">Virtuales</span>
                  <div class="kv"><span>Yape/Plin</span><strong>S/.{{ (c.paymentsByMethod?.['WALLET'] ?? 0) | number: '1.2-2' }}</strong></div>
                  <div class="kv"><span>Tarjetas</span><strong>S/.{{ (c.paymentsByMethod?.['CARD'] ?? 0) | number: '1.2-2' }}</strong></div>
                  <div class="kv"><span>Transferencias</span><strong>S/.{{ (c.paymentsByMethod?.['TRANSFER'] ?? 0) | number: '1.2-2' }}</strong></div>
                </div>
              </div>
              <div class="total-row">Total: <strong>S/.{{ c.totalIncome | number: '1.2-2' }}</strong></div>
            } @else {
              <p class="muted">No hay caja abierta en este momento.</p>
            }
          }
        </div>

        <!-- Resumen de Control Interno del Turno -->
        <div class="panel">
          <h2>Resumen de Control Interno del Turno</h2>
          <div class="stat-grid">
            @for (s of turnoCards(); track s.label) {
              <div class="stat soft">
                <span class="num">{{ s.value }}</span><span class="lbl">{{ s.label }}</span>
              </div>
            }
          </div>
        </div>
      </div>

      <p class="ts">Actualizado: {{ now | date: 'EEEE, d \\'de\\' MMMM HH:mm' }}</p>
    </section>
  `,
  styles: [
    `
      .dash { color: var(--p-text-color, #e6edf5); }
      h1 { margin: 0 0 1rem; font-size: 1.7rem; font-weight: 800; }
      .pills { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.25rem; }
      .pill {
        display: inline-flex; align-items: center; gap: 0.45rem; border: 0; cursor: pointer;
        color: #fff; font-weight: 700; font-size: 0.82rem; padding: 0.5rem 1rem; border-radius: 999px;
      }
      .pill:hover { filter: brightness(1.1); }
      .pill.purple { background: #7c3aed; } .pill.red { background: #e5484d; }
      .pill.orange { background: #f97316; } .pill.green { background: #10b981; } .pill.blue { background: #3b82f6; }

      .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.1rem; }
      .panel {
        background: var(--p-content-background, #0f1a2b); border: 1px solid var(--p-content-border-color, #1c2c44);
        border-radius: 16px; padding: 1.25rem;
      }
      h2 { margin: 0 0 1rem; font-size: 1rem; font-weight: 700; }
      .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
      .stat {
        border-radius: 12px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.15rem; color: #fff;
        min-height: 84px; justify-content: center;
      }
      .stat.soft { background: var(--p-content-hover-background, #142339); }
      .stat .num { font-size: 1.8rem; font-weight: 800; line-height: 1; }
      .stat .lbl { font-size: 0.78rem; opacity: 0.92; }

      .money { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .mc-title { font-weight: 700; font-size: 0.95rem; display: block; margin-bottom: 0.4rem; }
      .mc-title.efectivo { color: #34d399; } .mc-title.virtual { color: #34d399; }
      .mc-big { font-size: 1.7rem; font-weight: 800; color: #fff; display: block; }
      .kv { display: flex; justify-content: space-between; font-size: 0.82rem; padding: 0.2rem 0; }
      .muted { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.8rem; }
      .total-row { margin-top: 0.9rem; padding-top: 0.7rem; border-top: 1px solid var(--p-content-border-color, #1c2c44); font-size: 0.95rem; }
      .total-row strong { color: #34d399; }
      .ts { margin-top: 1rem; color: var(--p-text-muted-color, #8aa0bd); font-size: 0.78rem; text-transform: capitalize; }
    `,
  ],
})
export class AdminDashboardComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  private readonly router = inject(Router);

  readonly now = new Date();
  readonly recepcion = signal<RecepcionSummary | null>(null);
  readonly limpieza = signal<LimpiezaSummary | null>(null);
  readonly caja = signal<CajaSummary | null>(null);

  ngOnInit(): void {
    forkJoin({
      recepcion: this.api.recepcion(),
      limpieza: this.api.limpieza(),
      caja: this.api.caja(),
    }).subscribe((res) => {
      this.recepcion.set(res.recepcion.data);
      this.limpieza.set(res.limpieza.data);
      this.caja.set(res.caja.data);
    });
  }

  go(route: string): void {
    void this.router.navigateByUrl(route);
  }

  recepcionCards(): StatCard[] {
    const d = this.recepcion();
    const s = d?.rooms.byStatus ?? {};
    return [
      { value: s['FREE'] ?? 0, label: 'Habitaciones disponibles', color: 'linear-gradient(135deg,#065f46,#10b981)' },
      { value: s['OCCUPIED'] ?? 0, label: 'Habitaciones ocupadas', color: 'linear-gradient(135deg,#5b21b6,#7c3aed)' },
      { value: s['MAINTENANCE'] ?? 0, label: 'Habitaciones en mantenimiento', color: 'linear-gradient(135deg,#9a3412,#f97316)' },
      { value: d?.reservationsPending ?? 0, label: 'Habitaciones reservadas', color: 'linear-gradient(135deg,#7f1d1d,#b91c1c)' },
    ];
  }

  limpiezaCards(): StatCard[] {
    const d = this.limpieza();
    const byStatus = (st: string): number => d?.byStatus.find((x) => x.status === st)?.count ?? 0;
    return [
      { value: byStatus('DONE'), label: 'Limpiezas realizadas', color: 'linear-gradient(135deg,#115e59,#14b8a6)' },
      { value: byStatus('PENDING'), label: 'Limpiezas en espera', color: 'linear-gradient(135deg,#9a3412,#f97316)' },
      { value: d?.roomsCleaning ?? 0, label: 'Limpiezas en curso', color: 'linear-gradient(135deg,#1e40af,#3b82f6)' },
      { value: d?.pendingInspections ?? 0, label: 'Mantenimiento preventivo / periódico', color: 'linear-gradient(135deg,#5b21b6,#7c3aed)' },
    ];
  }

  turnoCards(): StatCard[] {
    const r = this.recepcion();
    const l = this.limpieza();
    const s = r?.rooms.byStatus ?? {};
    const done = l?.byStatus.find((x) => x.status === 'DONE')?.count ?? 0;
    return [
      { value: s['FREE'] ?? 0, label: 'Habitaciones limpias al iniciar el turno', color: '' },
      { value: r?.checkInsToday ?? 0, label: 'Habitaciones alquiladas durante el turno', color: '' },
      { value: done, label: 'Limpiezas hechas en turno', color: '' },
      { value: r?.rooms.total ?? 0, label: 'Total de habitaciones', color: '' },
    ];
  }
}
