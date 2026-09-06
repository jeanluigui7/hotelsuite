import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardApiService, type RecepcionSummary } from '../dashboard-api.service';

interface TurnoState {
  hasShift: boolean;
  shift: { id: string; shift: string; startedAt: string; status: string } | null;
  cash: { state: 'NONE' | 'OPEN' | 'CLOSED'; openSessionId: string | null; openSessionNumber: number | null };
  canOpenCash: boolean;
  canEndShift: boolean;
}

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

      <!-- Gestión de Turno (jornada personal de recepción) -->
      <div class="turno-card">
        <div class="tc-left">
          <span class="tc-ico"><i class="pi pi-calendar-clock"></i></span>
          <div><h2>Gestión de Turno</h2><p class="muted">Controla tu jornada laboral en recepción</p></div>
        </div>
        @if (turno(); as t) {
          <div class="tc-mid">
            @if (t.hasShift) {
              <div class="tc-chips">
                <span class="chip on"><span class="d"></span> Turno activo</span>
                <span class="chip">{{ turnoLabel(t.shift?.shift) }}</span>
                <span class="chip cash" [class.warn]="t.cash.state === 'OPEN'">Caja: {{ cashLabel(t.cash.state) }}</span>
              </div>
              <div class="tc-info">
                <div><span>Inicio</span><strong>{{ t.shift?.startedAt | date: 'HH:mm' }}</strong></div>
                <div><span>Tiempo transcurrido</span><strong>{{ elapsed(t.shift?.startedAt) }}</strong></div>
              </div>
              @if (t.cash.state === 'OPEN') { <p class="tc-hint"><i class="pi pi-info-circle"></i> Debes cerrar tu caja antes de finalizar el turno.</p> }
            } @else {
              <div class="tc-chips"><span class="chip off"><span class="d"></span> Sin turno</span></div>
              <p class="muted">Inicia tu jornada laboral para habilitar las operaciones de recepción.</p>
            }
          </div>
          <div class="tc-action">
            @if (!t.hasShift) {
              <button class="tbtn start" [disabled]="busy()" (click)="startTurno()"><i class="pi pi-play"></i> Iniciar turno</button>
            } @else {
              <button class="tbtn end" [disabled]="busy() || t.cash.state === 'OPEN'" (click)="endTurno()" [title]="t.cash.state === 'OPEN' ? 'Cierra tu caja primero' : ''"><i class="pi pi-stop"></i> Finalizar turno</button>
            }
          </div>
        } @else { <div class="tc-mid"><p class="muted">Cargando turno…</p></div> }
      </div>

      @if (data(); as d) {
        <div class="stat-grid">
          <div class="stat clk" style="background:linear-gradient(135deg,#065f46,#10b981)" (click)="go('FREE')" title="Ver habitaciones disponibles">
            <span class="num">{{ d.rooms.byStatus['FREE'] }}</span><span class="lbl">Habitaciones disponibles <i class="pi pi-arrow-right"></i></span>
          </div>
          <div class="stat clk" style="background:linear-gradient(135deg,#5b21b6,#7c3aed)" (click)="go('OCCUPIED')" title="Ver habitaciones ocupadas">
            <span class="num">{{ d.rooms.byStatus['OCCUPIED'] }}</span><span class="lbl">Habitaciones ocupadas <i class="pi pi-arrow-right"></i></span>
          </div>
          <div class="stat clk" style="background:linear-gradient(135deg,#1e40af,#3b82f6)" (click)="go('OCCUPIED')" title="Ver estancias activas">
            <span class="num">{{ d.activeStays }}</span><span class="lbl">Estancias activas <i class="pi pi-arrow-right"></i></span>
          </div>
          <div class="stat clk" style="background:linear-gradient(135deg,#9a3412,#f97316)" (click)="go('OCCUPIED')" title="Ver check-outs pendientes">
            <span class="num">{{ d.pendingCheckouts }}</span><span class="lbl">Check-outs pendientes <i class="pi pi-arrow-right"></i></span>
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
      .stat .lbl { font-size: 0.82rem; opacity: 0.92; display: inline-flex; align-items: center; gap: 0.3rem; }
      .stat .lbl .pi { font-size: 0.7rem; opacity: 0; transition: opacity 0.15s, transform 0.15s; }
      .stat.clk { cursor: pointer; transition: transform 0.12s, filter 0.12s, box-shadow 0.12s; }
      .stat.clk:hover { transform: translateY(-2px); filter: brightness(1.08); box-shadow: 0 8px 22px rgba(0,0,0,0.28); }
      .stat.clk:hover .lbl .pi { opacity: 0.95; transform: translateX(2px); }

      .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap: 1rem; }
      .panel { background: var(--p-content-background,#0f1a2b); border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 14px; padding: 1.25rem; }
      h3 { margin: 0 0 0.8rem; font-size: 1rem; }
      .occ { display: flex; flex-direction: column; gap: 0.2rem; }
      .occ-num { font-size: 2.2rem; font-weight: 800; color: var(--rz-accent,#10b981); }
      .kv { display: flex; justify-content: space-between; padding: 0.4rem 0; font-size: 0.9rem; }
      .muted { color: var(--p-text-muted-color,#8aa0bd); font-size: 0.85rem; }

      .turno-card { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; background: var(--p-content-background,#0f1a2b);
        border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 14px; padding: 1.1rem 1.25rem; margin-bottom: 1.25rem; }
      .tc-left { display: flex; align-items: center; gap: 0.8rem; min-width: 240px; }
      .tc-ico { width: 46px; height: 46px; border-radius: 12px; background: rgba(16,185,129,0.16); color: var(--rz-accent,#10b981); display: inline-flex; align-items: center; justify-content: center; font-size: 1.25rem; }
      .tc-left h2 { margin: 0; font-size: 1.1rem; } .tc-left p { margin: 0.15rem 0 0; }
      .tc-mid { flex: 1; min-width: 260px; }
      .tc-chips { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
      .chip { font-size: 0.78rem; font-weight: 700; padding: 0.3rem 0.7rem; border-radius: 999px; background: rgba(148,163,184,0.15); color: #cbd5e1; display: inline-flex; align-items: center; gap: 0.35rem; }
      .chip .d { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
      .chip.on { background: rgba(16,185,129,0.18); color: #34d399; } .chip.off { background: rgba(148,163,184,0.15); color: #94a3b8; }
      .chip.cash.warn { background: rgba(251,191,36,0.18); color: #fbbf24; }
      .tc-info { display: flex; gap: 1.5rem; } .tc-info span { display: block; font-size: 0.72rem; color: #8aa0bd; } .tc-info strong { font-size: 0.95rem; }
      .tc-hint { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #fbbf24; margin: 0.5rem 0 0; }
      .tc-action { display: flex; align-items: center; }
      .tbtn { border: 0; border-radius: 10px; padding: 0.8rem 1.4rem; font-weight: 700; font-size: 0.95rem; cursor: pointer; color: #fff; display: inline-flex; align-items: center; gap: 0.5rem; }
      .tbtn.start { background: linear-gradient(135deg,#059669,#10b981); } .tbtn.end { background: linear-gradient(135deg,#b91c1c,#ef4444); }
      .tbtn:disabled { opacity: 0.5; cursor: not-allowed; }
    `,
  ],
})
export class RecepcionSummaryComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  readonly data = signal<RecepcionSummary | null>(null);
  readonly turno = signal<TurnoState | null>(null);
  readonly busy = signal(false);
  readonly now = new Date();

  ngOnInit(): void {
    this.api.recepcion().subscribe((res) => this.data.set(res.data));
    this.loadTurno();
  }

  private loadTurno(): void {
    this.http.get<ApiResponse<TurnoState>>(`${environment.apiUrl}/work-shifts/current`).subscribe({
      next: (r) => this.turno.set(r.data ?? null),
      error: () => this.turno.set(null),
    });
  }

  startTurno(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${environment.apiUrl}/work-shifts/start`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno iniciado', detail: 'Ya puedes abrir tu caja.' }); this.loadTurno(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo iniciar el turno.' }); },
    });
  }

  endTurno(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${environment.apiUrl}/work-shifts/end`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno finalizado', detail: 'Ya puedes cerrar sesión.' }); this.loadTurno(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'warn', summary: 'No se puede finalizar', detail: e.error?.error?.message ?? 'No se pudo finalizar el turno.' }); this.loadTurno(); },
    });
  }

  turnoLabel(s: string | undefined): string { return ({ MANANA: '☀ Mañana', TARDE: '🌤 Tarde', NOCHE: '🌙 Noche' } as Record<string, string>)[s ?? ''] ?? (s ?? ''); }
  cashLabel(s: string): string { return ({ NONE: 'no iniciada', OPEN: 'abierta', CLOSED: 'cerrada' } as Record<string, string>)[s] ?? s; }
  elapsed(startedAt: string | undefined): string {
    if (!startedAt) return '—';
    const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  }

  /** Navega al mapa de habitaciones con el filtro de estado aplicado. */
  go(estado: string): void {
    this.router.navigate(['/operations/habitaciones'], { queryParams: { estado } });
  }

  name(): string {
    return this.auth.user()?.email?.split('@')[0] ?? 'Usuario';
  }
}
