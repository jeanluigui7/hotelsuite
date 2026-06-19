import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardApiService, type LimpiezaSummary } from '../dashboard-api.service';

interface Shift { id: string; shiftType: string; status: string; laundrySent: boolean; openedAt: string; }
interface ShiftInfo { shift: Shift | null; inProgress: number; canClose: boolean; }

@Component({
  selector: 'app-limpieza-summary',
  standalone: true,
  imports: [DatePipe, ButtonModule, TooltipModule],
  template: `
    <section class="rz">
      <!-- Hero -->
      <div class="hero">
        <span class="hero-ico"><i class="pi pi-sparkles"></i></span>
        <div>
          <h1>Gestión de Limpieza</h1>
          <p>Administra las tareas de limpieza de las habitaciones</p>
        </div>
      </div>

      <!-- Gestión de Turno -->
      <div class="panel">
        <h2><i class="pi pi-clock"></i> Gestión de Turno</h2>
        @if (info(); as i) {
          @if (i.shift) {
            <div class="turno-row">
              <span class="badge"><span class="dot"></span> Turno Activo</span>
              <div class="who"><strong>{{ name() }}</strong><small>Limpieza</small></div>
            </div>
            <div class="turno-cards">
              <div class="tc"><span class="tl"><i class="pi pi-play"></i> Hora Inicio</span><span class="tv blue">{{ i.shift.openedAt | date: 'HH:mm' }}</span></div>
              <div class="tc"><span class="tl"><i class="pi pi-stopwatch"></i> Tiempo Transcurrido</span><span class="tv green">{{ elapsed(i.shift.openedAt) }}</span></div>
            </div>
            @if (i.inProgress > 0) { <p class="warn"><i class="pi pi-exclamation-triangle"></i> {{ i.inProgress }} limpieza(s) en curso — finalízalas antes de cerrar el turno.</p> }
            @if (!i.shift.laundrySent) { <p class="warn"><i class="pi pi-inbox"></i> Falta enviar la ropa a lavandería.</p> }
            <button class="finalizar" [disabled]="!i.canClose || !i.shift.laundrySent || busy()" (click)="closeShift()">
              <i class="pi pi-stop-circle"></i> Finalizar Turno
            </button>
          } @else {
            <div class="turno-row"><span class="badge closed">Sin turno abierto</span></div>
            <button class="iniciar" [disabled]="busy()" (click)="openShift()"><i class="pi pi-play"></i> Iniciar Turno</button>
          }
        }
      </div>

      <!-- KPIs de limpieza -->
      @if (data(); as d) {
        <div class="stat-grid">
          <div class="stat" style="background:linear-gradient(135deg,#115e59,#14b8a6)">
            <span class="num">{{ done(d) }}</span><span class="lbl">Limpiezas realizadas</span>
          </div>
          <div class="stat" style="background:linear-gradient(135deg,#1e40af,#3b82f6)">
            <span class="num">{{ d.roomsCleaning }}</span><span class="lbl">Limpiezas en curso</span>
          </div>
          <div class="stat" style="background:linear-gradient(135deg,#9a3412,#f97316)">
            <span class="num">{{ d.pendingTasks }}</span><span class="lbl">Tareas pendientes</span>
          </div>
          <div class="stat" style="background:linear-gradient(135deg,#5b21b6,#7c3aed)">
            <span class="num">{{ d.pendingInspections }}</span><span class="lbl">Inspecciones pendientes</span>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .rz { color: var(--p-text-color, #e6edf5); }
      .hero { display: flex; align-items: center; gap: 1rem;
        background: linear-gradient(120deg, rgba(16,185,129,0.12), rgba(15,26,43,0.6));
        border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.25rem; }
      .hero-ico { width: 56px; height: 56px; border-radius: 14px; background: rgba(16,185,129,0.18); color: var(--rz-accent,#10b981);
        display: inline-flex; align-items: center; justify-content: center; font-size: 1.5rem; }
      h1 { margin: 0; font-size: 1.7rem; font-weight: 800; color: #fff; }
      .hero p { margin: 0.25rem 0 0; color: var(--p-text-muted-color,#8aa0bd); }

      .panel { background: var(--p-content-background,#0f1a2b); border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.25rem; }
      h2 { margin: 0 0 1.1rem; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; }
      .turno-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
      .badge { display: inline-flex; align-items: center; gap: 0.4rem; background: #10b981; color: #04130d; font-weight: 700; font-size: 0.8rem; padding: 0.35rem 0.8rem; border-radius: 999px; }
      .badge.closed { background: #475569; color: #fff; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #04130d; }
      .who strong { display: block; font-size: 0.95rem; } .who small { color: var(--p-text-muted-color,#8aa0bd); }
      .turno-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
      .tc { background: var(--p-content-hover-background,#142339); border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
      .tl { font-size: 0.78rem; color: var(--p-text-muted-color,#8aa0bd); display: flex; align-items: center; gap: 0.35rem; }
      .tv { font-size: 1.6rem; font-weight: 800; } .tv.blue { color: #60a5fa; } .tv.green { color: #34d399; }
      .warn { color: #fbbf24; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; margin: 0.3rem 0; }
      .finalizar, .iniciar { width: 100%; border: 0; border-radius: 12px; padding: 0.9rem; font-weight: 700; font-size: 0.95rem; cursor: pointer; color: #fff; margin-top: 0.5rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; }
      .finalizar { background: #e5484d; } .iniciar { background: #10b981; color: #04130d; }
      .finalizar:disabled { background: #6b2528; opacity: 0.6; cursor: not-allowed; }

      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 1rem; }
      .stat { border-radius: 14px; padding: 1.1rem 1.25rem; color: #fff; display: flex; flex-direction: column; gap: 0.2rem; }
      .stat .num { font-size: 2rem; font-weight: 800; line-height: 1; }
      .stat .lbl { font-size: 0.82rem; opacity: 0.92; }
    `,
  ],
})
export class LimpiezaSummaryComponent implements OnInit, OnDestroy {
  private readonly api = inject(DashboardApiService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly apiUrl = environment.apiUrl;

  readonly data = signal<LimpiezaSummary | null>(null);
  readonly info = signal<ShiftInfo | null>(null);
  readonly busy = signal(false);
  private readonly tick = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.reload();
    this.timer = setInterval(() => this.tick.update((v) => v + 1), 60_000);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  reload(): void {
    this.api.limpieza().subscribe((res) => this.data.set(res.data));
    this.http.get<ApiResponse<ShiftInfo>>(`${this.apiUrl}/cleaning/shift`).subscribe((r) => this.info.set(r.data));
  }

  name(): string {
    return this.auth.user()?.email?.split('@')[0] ?? 'Usuario de Limpieza';
  }

  done(d: LimpiezaSummary): number {
    return d.byStatus.find((x) => x.status === 'DONE')?.count ?? 0;
  }

  elapsed(openedAt: string): string {
    void this.tick();
    const ms = Date.now() - new Date(openedAt).getTime();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  }

  openShift(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.apiUrl}/cleaning/shift/open`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno iniciado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  closeShift(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.apiUrl}/cleaning/shift/close`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno finalizado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'No se pudo cerrar', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
