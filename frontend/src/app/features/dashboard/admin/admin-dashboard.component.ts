import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { profileForRole } from '../../../layout/menu';
import {
  DashboardApiService,
  type LimpiezaSummary,
  type RecepcionSummary,
  type TurnoView,
} from '../dashboard-api.service';

interface StatCard {
  value: number | string;
  label: string;
  color: string; // gradiente CSS
  estado?: string; // si está, la tarjeta es clickeable y filtra habitaciones por este estado
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    @if (isAdmin()) {
    <section class="dash">
      <h1>Dashboard</h1>

      <!-- Navegación por turno (histórico) -->
      @if (tv()?.turno; as t) {
        <div class="turnonav">
          <button class="tn-btn" [disabled]="!tv()?.nav?.prevSessionId" (click)="prevTurno()"><i class="pi pi-chevron-left"></i> Turno anterior</button>
          <div class="tn-center">
            <strong>{{ t.day }} · {{ t.shift }} · {{ t.user }}</strong>
            <span class="tn-int">{{ t.interval }} · Caja #{{ t.cajaNumber ?? '—' }}
              @if (tv()?.nav?.isCurrent && t.status === 'OPEN') { <span class="tn-live">EN CURSO</span> }
            </span>
          </div>
          <button class="tn-btn" [disabled]="tv()?.nav?.isCurrent" (click)="nextTurno()">Siguiente turno <i class="pi pi-chevron-right"></i></button>
        </div>
      }

      <div class="panels">
        <!-- Resumen de Recepción / Estancias -->
        <div class="panel">
          <h2>Resumen de Recepción / Estancias</h2>
          <div class="stat-grid">
            @for (s of recepcionCards(); track s.label) {
              <div class="stat" [class.clk]="s.estado" [style.background]="s.color" (click)="go(s)" [title]="s.estado ? 'Ver habitaciones' : ''">
                <span class="num">{{ s.value }}</span><span class="lbl">{{ s.label }} @if (s.estado) { <i class="pi pi-arrow-right"></i> }</span>
              </div>
            }
          </div>
        </div>

        <!-- Resumen de Limpieza -->
        <div class="panel">
          <h2>Resumen de Limpieza @if (tv()?.turno; as t) { <span class="turno-chip"><i class="pi pi-clock"></i> {{ t.shift }} {{ t.interval }}</span> }</h2>
          <div class="stat-grid">
            <!-- Limpiezas realizadas EN EL TURNO (checkout + renovación) → Historial de Limpiezas -->
            <div class="stat clk" style="background:linear-gradient(135deg,#115e59,#14b8a6)" (click)="goHistorialLimpiezas()" title="Ver historial de limpiezas del turno">
              <span class="num">{{ tv()?.control?.limpiezasTurno ?? 0 }}</span><span class="lbl">Limpiezas realizadas <i class="pi pi-arrow-right"></i></span>
            </div>
            @for (s of limpiezaCards(); track s.label) {
              <div class="stat" [class.clk]="s.estado" [style.background]="s.color" (click)="go(s)" [title]="s.estado ? 'Ver habitaciones' : ''">
                <span class="num">{{ s.value }}</span><span class="lbl">{{ s.label }} @if (s.estado) { <i class="pi pi-arrow-right"></i> }</span>
              </div>
            }
          </div>
        </div>

        <!-- Resumen de Caja / Dinero (clickeable → Movimientos de esta caja) -->
        <div class="panel clickable" (click)="openMovements()" [title]="'Ver movimientos de la Caja #' + (tv()?.turno?.cajaNumber ?? '')">
          <h2>Resumen de Caja / Dinero <i class="pi pi-external-link hint"></i></h2>
          @if (tv()?.caja; as c) {
            <div class="money">
              <div class="money-col">
                <span class="mc-title efectivo">Efectivo</span>
                <span class="mc-big">S/.{{ (c.paymentsByMethod['CASH'] ?? 0) | number: '1.2-2' }}</span>
                <span class="muted">Total en efectivo</span>
              </div>
              <div class="money-col">
                <span class="mc-title virtual">Virtuales</span>
                <div class="kv"><span>Total:</span><strong>S/.{{ virtuales(c.paymentsByMethod) | number: '1.2-2' }}</strong></div>
                <div class="kv"><span>Yape:</span><strong>S/.{{ (c.paymentsByMethod['YAPE'] ?? 0) | number: '1.2-2' }}</strong></div>
                <div class="kv"><span>Plin:</span><strong>S/.{{ (c.paymentsByMethod['PLIN'] ?? 0) | number: '1.2-2' }}</strong></div>
                <div class="kv"><span>Tarjetas:</span><strong>S/.{{ (c.paymentsByMethod['CARD'] ?? 0) | number: '1.2-2' }}</strong></div>
                <div class="kv"><span>Transferencias:</span><strong>S/.{{ (c.paymentsByMethod['TRANSFER'] ?? 0) | number: '1.2-2' }}</strong></div>
              </div>
            </div>
            <div class="total-row big">Total recaudado: <strong>S/.{{ c.totalIncome | number: '1.2-2' }}</strong></div>
            <!-- Desglose por concepto (control: Hospedaje + Productos + Servicios + Otros cobros = Total) -->
            <div class="concepto">
              <div class="cc"><span>Hospedaje</span><strong>S/.{{ c.byConcepto.hospedaje | number: '1.2-2' }}</strong></div>
              <div class="cc"><span>Productos</span><strong>S/.{{ c.byConcepto.productos | number: '1.2-2' }}</strong></div>
              <div class="cc"><span>Servicios y penalidades</span><strong>S/.{{ c.byConcepto.serviciosPenalidades | number: '1.2-2' }}</strong></div>
              @if (c.byConcepto.otrosCobros >= 0.01 || c.byConcepto.otrosCobros <= -0.01) {
                <div class="cc otros">
                  <span>Regularizaciones / Otros cobros <i class="pi pi-info-circle" title="Deudas de turnos anteriores cobradas en este turno e ingresos que no son ventas de este turno."></i></span>
                  <strong>S/.{{ c.byConcepto.otrosCobros | number: '1.2-2' }}</strong>
                </div>
              }
            </div>
          } @else {
            <p class="muted">Sin caja para este turno.</p>
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
          <p class="turno-note">Indicadores del turno consultado. El cuadre automático se definirá más adelante.</p>
        </div>
      </div>

      <p class="ts">Actualizado: {{ now | date: 'EEEE, d \\'de\\' MMMM HH:mm' }}</p>
    </section>
    }
  `,
  styles: [
    `
      .dash { color: var(--p-text-color, #e6edf5); }
      h1 { margin: 0 0 1rem; font-size: 1.7rem; font-weight: 800; }

      .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 1.1rem; align-items: start; }
      @media (max-width: 900px) { .panels { grid-template-columns: 1fr; } }
      .panel {
        background: var(--p-content-background, #0f1a2b); border: 1px solid var(--p-content-border-color, #1c2c44);
        border-radius: 16px; padding: 1.25rem;
      }
      h2 { margin: 0 0 1rem; font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
      .turno-chip { font-size: 0.72rem; font-weight: 700; color: #34d399; background: rgba(16,185,129,0.14); border: 1px solid rgba(16,185,129,0.35); border-radius: 999px; padding: 0.15rem 0.6rem; display: inline-flex; align-items: center; gap: 0.35rem; }
      .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
      .stat {
        border-radius: 12px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.15rem; color: #fff;
        min-height: 84px; justify-content: center;
      }
      .stat.soft { background: var(--p-content-hover-background, #142339); }
      .stat .num { font-size: 1.8rem; font-weight: 800; line-height: 1; }
      .stat .lbl { font-size: 0.78rem; opacity: 0.92; display: inline-flex; align-items: center; gap: 0.3rem; }
      .stat .lbl .pi { font-size: 0.68rem; opacity: 0; transition: opacity 0.15s, transform 0.15s; }
      .stat.clk { cursor: pointer; transition: transform 0.12s, filter 0.12s, box-shadow 0.12s; }
      .stat.clk:hover { transform: translateY(-2px); filter: brightness(1.08); box-shadow: 0 8px 22px rgba(0,0,0,0.28); }
      .stat.clk:hover .lbl .pi { opacity: 0.95; transform: translateX(2px); }

      .money { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .mc-title { font-weight: 700; font-size: 0.95rem; display: block; margin-bottom: 0.4rem; }
      .mc-title.efectivo { color: #34d399; } .mc-title.virtual { color: #34d399; }
      .mc-big { font-size: 1.7rem; font-weight: 800; color: #fff; display: block; }
      .kv { display: flex; justify-content: space-between; font-size: 0.82rem; padding: 0.2rem 0; }
      .muted { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.8rem; }
      .total-row { margin-top: 0.9rem; padding-top: 0.7rem; border-top: 1px solid var(--p-content-border-color, #1c2c44); font-size: 0.95rem; }
      .total-row.big { font-size: 1.05rem; font-weight: 700; }
      .total-row strong { color: #34d399; }
      .cash-note { margin: 0.5rem 0 0; font-size: 0.72rem; color: var(--p-text-muted-color, #8aa0bd); }
      .turno-note { margin: 0.8rem 0 0; font-size: 0.72rem; color: var(--p-text-muted-color, #8aa0bd); }
      .turnonav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: var(--p-content-background, #0f1a2b); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 14px; padding: 0.7rem 1rem; margin-bottom: 1.1rem; }
      .tn-btn { background: var(--p-content-hover-background, #142339); border: 1px solid var(--p-content-border-color, #274468); color: var(--p-text-color, #e6edf5); border-radius: 9px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
      .tn-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .tn-center { text-align: center; } .tn-center strong { display: block; font-size: 1rem; letter-spacing: 0.02em; } .tn-int { font-size: 0.78rem; color: var(--p-text-muted-color, #8aa0bd); }
      .tn-live { background: rgba(16,185,129,0.2); color: #34d399; border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.66rem; font-weight: 800; margin-left: 0.4rem; }
      .panel.clickable { cursor: pointer; transition: border-color 0.12s, box-shadow 0.12s; } .panel.clickable:hover { border-color: var(--rz-accent, #10b981); box-shadow: 0 8px 22px rgba(0,0,0,0.25); }
      h2 .hint { font-size: 0.75rem; color: var(--p-text-muted-color, #8aa0bd); margin-left: auto; }
      .concepto { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 0.7rem; }
      .cc { background: var(--p-content-hover-background, #142339); border-radius: 9px; padding: 0.5rem 0.6rem; display: flex; flex-direction: column; gap: 0.15rem; } .cc span { font-size: 0.7rem; color: var(--p-text-muted-color, #8aa0bd); } .cc strong { font-size: 0.95rem; }
      .cc.otros { grid-column: 1 / -1; border: 1px dashed var(--p-primary-color, #3b82f6); background: transparent; } .cc.otros span { color: var(--p-primary-color, #3b82f6); } .cc.otros i { font-size: 0.7rem; }
      @media (max-width: 640px) { .concepto { grid-template-columns: 1fr; } }
      .ts { margin-top: 1rem; color: var(--p-text-muted-color, #8aa0bd); font-size: 0.78rem; text-transform: capitalize; }
    `,
  ],
})
export class AdminDashboardComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  isAdmin(): boolean {
    const u = this.auth.user();
    return profileForRole(u?.roleName, u?.isSuperAdmin ?? false) === 'admin';
  }

  readonly now = new Date();
  readonly recepcion = signal<RecepcionSummary | null>(null);
  readonly limpieza = signal<LimpiezaSummary | null>(null);
  readonly tv = signal<TurnoView | null>(null);

  ngOnInit(): void {
    // Cada perfil ve SU propio dashboard. El resumen general (caja/dinero, todos
    // los paneles) es exclusivo del administrador; limpieza y recepción se
    // redirigen al suyo y ni siquiera consultan los endpoints administrativos.
    const u = this.auth.user();
    const profile = profileForRole(u?.roleName, u?.isSuperAdmin ?? false);
    if (profile === 'limpieza') {
      void this.router.navigateByUrl('/dashboard/limpieza');
      return;
    }
    if (profile === 'recepcion') {
      void this.router.navigateByUrl('/dashboard/recepcion');
      return;
    }

    forkJoin({
      recepcion: this.api.recepcion(),
      limpieza: this.api.limpieza(),
    }).subscribe((res) => {
      this.recepcion.set(res.recepcion.data);
      this.limpieza.set(res.limpieza.data);
    });
    this.loadTurno();
  }

  /** Carga la vista del turno (por sessionId o el actual si no se indica). */
  private loadTurno(sessionId?: string): void {
    this.api.turnoView(sessionId).subscribe((r) => this.tv.set(r.data));
  }
  prevTurno(): void { const id = this.tv()?.nav?.prevSessionId; if (id) this.loadTurno(id); }
  nextTurno(): void { const id = this.tv()?.nav?.nextSessionId; if (id) this.loadTurno(id); }

  /** Abre los MOVIMIENTOS de la caja del turno consultado (pestaña nueva). */
  openMovements(): void {
    const id = this.tv()?.turno?.sessionId;
    if (id) window.open(`/finance/cajas/${id}/movimientos`, '_blank');
  }

  /** Historial de Limpiezas filtrado por el intervalo del turno consultado. */
  goHistorialLimpiezas(): void {
    const t = this.tv()?.turno;
    this.router.navigate(['/operations/limpiezas'], t ? { queryParams: { from: t.start, to: t.end } } : undefined);
  }

  /** Navega al mapa de habitaciones con el filtro de estado de la tarjeta. */
  go(card: StatCard): void {
    if (!card.estado) return;
    this.router.navigate(['/operations/habitaciones'], { queryParams: { estado: card.estado } });
  }

  recepcionCards(): StatCard[] {
    const d = this.recepcion();
    const s = d?.rooms.byStatus ?? {};
    return [
      { value: s['FREE'] ?? 0, label: 'Habitaciones disponibles', color: 'linear-gradient(135deg,#065f46,#10b981)', estado: 'FREE' },
      { value: s['OCCUPIED'] ?? 0, label: 'Habitaciones ocupadas', color: 'linear-gradient(135deg,#5b21b6,#7c3aed)', estado: 'OCCUPIED' },
      { value: s['MAINTENANCE'] ?? 0, label: 'Habitaciones en mantenimiento', color: 'linear-gradient(135deg,#9a3412,#f97316)', estado: 'MAINTENANCE' },
      { value: d?.reservationsPending ?? 0, label: 'Habitaciones reservadas', color: 'linear-gradient(135deg,#7f1d1d,#b91c1c)', estado: 'RESERVADA' },
    ];
  }

  limpiezaCards(): StatCard[] {
    const d = this.limpieza();
    return [
      { value: d?.enEspera ?? 0, label: 'Limpiezas en espera', color: 'linear-gradient(135deg,#9a3412,#f97316)', estado: 'CLEANING' },
      { value: d?.enCurso ?? 0, label: 'Limpiezas en curso', color: 'linear-gradient(135deg,#1e40af,#3b82f6)', estado: 'CLEANING' },
      { value: d?.mantenimiento ?? 0, label: 'Mantenimiento preventivo / periódico', color: 'linear-gradient(135deg,#5b21b6,#7c3aed)', estado: 'MAINTENANCE' },
    ];
  }

  /** Indicadores individuales del turno consultado (sin fórmula de cuadre). */
  turnoCards(): StatCard[] {
    const c = this.tv()?.control;
    const disp = c?.disponiblesInicio;
    return [
      { value: disp == null ? '—' : disp, label: 'Habitaciones disponibles al iniciar el turno', color: '' },
      { value: c?.alquileresTurno ?? 0, label: 'Habitaciones alquiladas durante el turno', color: '' },
      { value: c?.limpiezasTurno ?? 0, label: 'Limpiezas realizadas durante el turno', color: '' },
      { value: c?.disponiblesActual ?? 0, label: 'Habitaciones disponibles actuales', color: '' },
    ];
  }

  virtuales(m: Record<string, number>): number {
    return Math.round(((m['YAPE'] ?? 0) + (m['PLIN'] ?? 0) + (m['WALLET'] ?? 0) + (m['CARD'] ?? 0) + (m['TRANSFER'] ?? 0)) * 100) / 100;
  }
}
