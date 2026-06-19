import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardApiService, type RecepcionSummary } from '../dashboard-api.service';

@Component({
  selector: 'app-recepcion-summary',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="rz">
      <!-- Hero de bienvenida -->
      <div class="hero">
        <div class="hero-left">
          <span class="hero-ico"><i class="pi pi-users"></i></span>
          <div>
            <h1>Dashboard de Recepción</h1>
            <p><span class="dot"></span> Bienvenido/a, <strong>{{ name() }}</strong></p>
          </div>
        </div>
        <div class="date-chip">
          <i class="pi pi-clock"></i>
          <div>
            <strong>{{ now | date: 'EEEE, d \\'de\\' MMMM' }}</strong>
            <small>{{ now | date: 'HH:mm' }}</small>
          </div>
        </div>
      </div>

      @if (data(); as d) {
        <div class="stat-grid">
          <div class="stat" style="background:linear-gradient(135deg,#065f46,#10b981)">
            <span class="num">{{ d.rooms.byStatus['FREE'] }}</span><span class="lbl">Habitaciones disponibles</span>
          </div>
          <div class="stat" style="background:linear-gradient(135deg,#5b21b6,#7c3aed)">
            <span class="num">{{ d.rooms.byStatus['OCCUPIED'] }}</span><span class="lbl">Habitaciones ocupadas</span>
          </div>
          <div class="stat" style="background:linear-gradient(135deg,#1e40af,#3b82f6)">
            <span class="num">{{ d.activeStays }}</span><span class="lbl">Estancias activas</span>
          </div>
          <div class="stat" style="background:linear-gradient(135deg,#9a3412,#f97316)">
            <span class="num">{{ d.pendingCheckouts }}</span><span class="lbl">Check-outs pendientes</span>
          </div>
        </div>

        <div class="panels">
          <div class="panel">
            <h3>Ocupación</h3>
            <div class="occ"><span class="occ-num">{{ d.rooms.occupancy }}%</span>
              <span class="muted">{{ d.rooms.byStatus['OCCUPIED'] }} de {{ d.rooms.total }} habitaciones</span></div>
          </div>
          <div class="panel">
            <h3>Movimiento de hoy</h3>
            <div class="kv"><span>Check-ins</span><strong>{{ d.checkInsToday }}</strong></div>
            <div class="kv"><span>Check-outs</span><strong>{{ d.checkOutsToday }}</strong></div>
            <div class="kv"><span>Reservas próximas</span><strong>{{ d.reservationsPending }}</strong></div>
          </div>
        </div>
      } @else {
        <p class="muted">Cargando…</p>
      }
    </section>
  `,
  styles: [
    `
      .rz { color: var(--p-text-color, #e6edf5); }
      .hero {
        display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
        background: linear-gradient(120deg, rgba(16,185,129,0.12), rgba(15,26,43,0.6));
        border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.25rem;
      }
      .hero-left { display: flex; align-items: center; gap: 1rem; }
      .hero-ico { width: 56px; height: 56px; border-radius: 14px; background: rgba(16,185,129,0.18); color: var(--rz-accent,#10b981);
        display: inline-flex; align-items: center; justify-content: center; font-size: 1.5rem; }
      h1 { margin: 0; font-size: 1.7rem; font-weight: 800;
        background: linear-gradient(90deg, var(--rz-accent,#10b981), #e6edf5); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
      .hero p { margin: 0.25rem 0 0; color: var(--p-text-muted-color, #8aa0bd); }
      .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; margin-right: 4px; }
      .date-chip { display: flex; align-items: center; gap: 0.6rem; background: var(--p-content-hover-background,#142339);
        border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 12px; padding: 0.7rem 1rem; }
      .date-chip strong { display: block; font-size: 0.85rem; text-transform: capitalize; }
      .date-chip small { color: var(--p-text-muted-color,#8aa0bd); }

      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 1rem; margin-bottom: 1.25rem; }
      .stat { border-radius: 14px; padding: 1.1rem 1.25rem; color: #fff; display: flex; flex-direction: column; gap: 0.2rem; }
      .stat .num { font-size: 2rem; font-weight: 800; line-height: 1; }
      .stat .lbl { font-size: 0.82rem; opacity: 0.92; }

      .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap: 1rem; }
      .panel { background: var(--p-content-background,#0f1a2b); border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 14px; padding: 1.25rem; }
      h3 { margin: 0 0 0.8rem; font-size: 1rem; }
      .occ { display: flex; flex-direction: column; gap: 0.2rem; }
      .occ-num { font-size: 2.2rem; font-weight: 800; color: var(--rz-accent,#10b981); }
      .kv { display: flex; justify-content: space-between; padding: 0.4rem 0; font-size: 0.9rem; }
      .muted { color: var(--p-text-muted-color,#8aa0bd); font-size: 0.85rem; }
    `,
  ],
})
export class RecepcionSummaryComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  private readonly auth = inject(AuthService);
  readonly data = signal<RecepcionSummary | null>(null);
  readonly now = new Date();

  ngOnInit(): void {
    this.api.recepcion().subscribe((res) => this.data.set(res.data));
  }

  name(): string {
    return this.auth.user()?.email?.split('@')[0] ?? 'Usuario';
  }
}
