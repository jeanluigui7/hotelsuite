import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardApiService, type LimpiezaSummary } from '../dashboard-api.service';

interface Shift { id: string; shiftType: string; status: string; laundrySent: boolean; openedAt: string; }
interface ShiftInfo { shift: Shift | null; inProgress: number; canClose: boolean; }
interface LinenRow { linenItemId: string; type: string; name: string; color?: string | null; rem: number; sum: number; }
interface LinenFloor { floor: string; rows: LinenRow[]; }

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sabanas', EDREDON: 'Edredones', AMENITY: 'Amenities' };

@Component({
  selector: 'app-limpieza-summary',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, SelectModule, TooltipModule],
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

      <!-- Stock de Ropa por Piso -->
      <h2 class="sr-title">Stock de Ropa por Piso</h2>
      <div class="sr-card">
        <div class="sr-head">Artículos Reutilizables en Limpieza</div>
        <div class="sr-body">
          <div class="sr-filters">
            <span class="sr-search"><i class="pi pi-search"></i><input placeholder="Buscar por nombre o marca..." [(ngModel)]="linenSearch" /></span>
            <p-select [options]="floorOptions()" [(ngModel)]="floorFilter" placeholder="Todos los pisos" [showClear]="true" styleClass="dk" />
            <p-select [options]="cicloOptions" optionLabel="label" optionValue="value" [(ngModel)]="ciclo" placeholder="Todos los ciclos" styleClass="dk" />
            <button class="sr-refresh" (click)="reload()"><i class="pi pi-sync"></i> Actualizar</button>
          </div>
          <div class="sr-tablewrap">
            <table class="sr-tbl">
              <thead><tr><th class="cat">Categoría de Artículo</th>
                @for (f of stockFloors(); track f) { <th class="pf">Piso {{ f }}<small>Total Stock</small></th> }
              </tr></thead>
              <tbody>
                @for (row of stockRows(); track row.category) {
                  <tr><td class="cat">{{ row.category }}</td>
                    @for (f of stockFloors(); track f) { <td class="num" [class.zero]="(row.byFloor[f] || 0) === 0">{{ row.byFloor[f] || 0 }}</td> }
                  </tr>
                } @empty { <tr><td [attr.colspan]="stockFloors().length + 1" class="muted center">Sin artículos.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      </div>
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

      .sr-title { font-size: 1.4rem; font-weight: 800; color: #fff; margin: 1.5rem 0 1rem; }
      .sr-card { background: var(--p-content-background,#0f1a2b); border: 1px solid var(--p-content-border-color,#1c2c44); border-radius: 16px; overflow: hidden; }
      .sr-head { background: #10b981; color: #04130d; font-weight: 800; padding: 0.8rem 1.25rem; }
      .sr-body { padding: 1.25rem; }
      .sr-filters { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
      .sr-search { position: relative; flex: 1; min-width: 240px; } .sr-search i { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .sr-search input { width: 100%; background: var(--p-content-hover-background,#142339); border: 1px solid var(--p-content-border-color,#1c2c44); color: #e6edf5; border-radius: 8px; padding: 0.6rem 0.7rem 0.6rem 2rem; }
      :host ::ng-deep .dk .p-select { background: var(--p-content-hover-background,#142339); border-color: var(--p-content-border-color,#1c2c44); min-width: 200px; }
      .sr-refresh { background: #0b1220; border: 1px solid var(--p-content-border-color,#1c2c44); color: #e6edf5; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
      .sr-tablewrap { overflow-x: auto; border-radius: 10px; }
      .sr-tbl { width: 100%; border-collapse: collapse; }
      .sr-tbl th { background: #10b981; color: #04130d; font-weight: 800; padding: 0.8rem 1rem; text-align: center; }
      .sr-tbl th.cat { text-align: left; } .sr-tbl th small { display: block; font-weight: 500; font-size: 0.72rem; opacity: 0.85; }
      .sr-tbl td { padding: 0.8rem 1rem; border-top: 1px solid var(--p-content-border-color,#1c2c44); text-align: center; font-weight: 700; }
      .sr-tbl td.cat { text-align: left; font-weight: 600; }
      .sr-tbl td.zero { color: #6b7a90; font-weight: 400; }
      .muted { color: var(--p-text-muted-color,#8aa0bd); } .center { text-align: center; }
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

  // Stock de ropa por piso
  readonly linenFloors = signal<LinenFloor[]>([]);
  linenSearch = '';
  floorFilter: string | null = null;
  ciclo: 'all' | 'rem' | 'sum' = 'all';
  readonly cicloOptions = [
    { label: 'Todos los ciclos', value: 'all' },
    { label: 'Remanente (REM)', value: 'rem' },
    { label: 'Suministrado (SUM)', value: 'sum' },
  ];

  ngOnInit(): void {
    this.reload();
    this.timer = setInterval(() => this.tick.update((v) => v + 1), 60_000);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Pisos disponibles para el filtro.
  floorOptions(): string[] { return [...new Set(this.linenFloors().map((f) => f.floor))].sort(); }
  stockFloors(): string[] {
    const all = this.floorOptions();
    return this.floorFilter ? all.filter((f) => f === this.floorFilter) : all;
  }
  /** Pivot Categoría (tipo) × Piso con el total de stock según el ciclo. */
  stockRows(): { category: string; byFloor: Record<string, number> }[] {
    const q = this.linenSearch.toLowerCase();
    const val = (r: LinenRow): number => (this.ciclo === 'rem' ? r.rem : this.ciclo === 'sum' ? r.sum : r.rem + r.sum);
    const byType = new Map<string, { category: string; byFloor: Record<string, number> }>();
    for (const f of this.linenFloors()) {
      for (const r of f.rows) {
        if (q && !(r.name.toLowerCase().includes(q) || (TYPE_LABEL[r.type] ?? r.type).toLowerCase().includes(q))) continue;
        const cat = TYPE_LABEL[r.type] ?? r.type;
        if (!byType.has(r.type)) byType.set(r.type, { category: cat, byFloor: {} });
        const row = byType.get(r.type)!;
        row.byFloor[f.floor] = (row.byFloor[f.floor] ?? 0) + val(r);
      }
    }
    return [...byType.values()].sort((a, b) => a.category.localeCompare(b.category));
  }

  reload(): void {
    this.api.limpieza().subscribe((res) => this.data.set(res.data));
    this.http.get<ApiResponse<{ floors: LinenFloor[] }>>(`${this.apiUrl}/cleaning/linen-inventory`).subscribe((r) => this.linenFloors.set(r.data?.floors ?? []));
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
