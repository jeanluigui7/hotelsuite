import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface LinenLine { name: string; units: number; }
interface Adicional { name: string; units: number; cortesia: boolean; }
interface HistoryRow {
  id: string;
  kind: 'TASK' | 'SUPPLY';
  dateTime: string;
  fin: string | null;
  roomNumber: string;
  floor: string | null;
  tipo: 'CHECKOUT' | 'RENOVACION' | 'ADICIONAL';
  estado: string;
  estadoFinal: string;
  durationMinutes: number;
  excedido: boolean;
  recogidos: LinenLine[];
  dejados: LinenLine[];
  repuestos: LinenLine[];
  adicionales: Adicional[];
  extra: number;
  user: string;
}
interface Shift {
  dateISO: string;
  dateLabel: string;
  turnoKey: string;
  turnoLabel: string;
  hours: string;
  count: number;
  rows: HistoryRow[];
}

const TIPO_META: Record<string, { label: string; cls: string; icon?: string }> = {
  CHECKOUT: { label: 'Check Out', cls: 'co', icon: 'pi pi-sign-out' },
  RENOVACION: { label: 'Renovación', cls: 'rn', icon: 'pi pi-refresh' },
  ADICIONAL: { label: 'Adicional', cls: 'ad', icon: 'pi pi-box' },
};

@Component({
  selector: 'app-historial-limpieza',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <section class="hl">
      <header class="top">
        <h1>Historial de Limpieza</h1>
        <div class="head-actions">
          <button class="btn ghost" (click)="showFilters.set(!showFilters())"><i class="pi pi-filter"></i> Filtros</button>
          <button class="btn icon" (click)="reload()" [class.spin]="loading()"><i class="pi pi-refresh"></i></button>
        </div>
      </header>

      @if (showFilters()) {
        <div class="filters">
          <span class="lbl">HAB:</span>
          <input class="inp" placeholder="Ej: 101" [(ngModel)]="habFilter" (keyup.enter)="applyHab()" />
          <button class="btn blue" (click)="applyHab()">Buscar</button>
          <span class="sep"></span>
          <span class="lbl">PISO:</span>
          <button class="chip" [class.on]="floorFilter() === null" (click)="floorFilter.set(null)">Todos</button>
          @for (f of floors(); track f) {
            <button class="chip" [class.on]="floorFilter() === f" (click)="floorFilter.set(f)">Piso {{ f }}</button>
          }
          <span class="sep"></span>
          <span class="lbl">TIPO:</span>
          <button class="chip" [class.on]="tipoFilter() === null" (click)="tipoFilter.set(null)">Todos</button>
          <button class="chip" [class.on]="tipoFilter() === 'CHECKOUT'" (click)="tipoFilter.set('CHECKOUT')">Check Out</button>
          <button class="chip" [class.on]="tipoFilter() === 'RENOVACION'" (click)="tipoFilter.set('RENOVACION')">Renovación</button>
          <button class="chip" [class.on]="tipoFilter() === 'ADICIONAL'" (click)="tipoFilter.set('ADICIONAL')">Adicional</button>
        </div>
      }

      <!-- Navegación de turnos -->
      <div class="turno-nav">
        <button class="btn nav" [disabled]="idx() >= shifts().length - 1" (click)="prevTurno()"><i class="pi pi-chevron-left"></i> Turno Anterior</button>
        <div class="turno-center">
          @if (current(); as s) {
            <div class="td">{{ s.dateLabel }}</div>
            <div class="th">{{ s.turnoLabel }} - {{ s.hours }}</div>
          } @else { <div class="td">Sin turnos registrados</div> }
        </div>
        <button class="btn nav" [disabled]="idx() <= 0" (click)="nextTurno()">Siguiente Turno <i class="pi pi-chevron-right"></i></button>
        <span class="reg"><i class="pi pi-chart-bar"></i> {{ filteredRows().length }} registros en este turno</span>
      </div>

      <!-- Banner del turno -->
      @if (current(); as s) {
        <div class="banner">
          <strong>{{ s.dateLabel }}</strong>
          <span>{{ s.turnoLabel }} - {{ s.hours }}</span>
        </div>
      }

      <!-- Tabla -->
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Hab.</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Duración</th>
              <th class="c blue">Recogidos</th>
              <th class="c gray">Dejados</th>
              <th class="c green">Repuestos</th>
              <th>Adicionales</th>
              <th>Usuario</th>
              <th class="c">Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (r of filteredRows(); track r.id) {
              <tr>
                <td><div class="dt">{{ r.dateTime | date: 'dd/MM/yyyy HH:mm' }}</div><div class="fin">Fin: {{ r.fin | date: 'dd/MM/yyyy HH:mm' }}</div></td>
                <td>
                  <div class="hab"><strong>{{ r.roomNumber }}</strong> <span class="piso">P{{ r.floor || '-' }}</span></div>
                  @if (r.extra > 0) { <span class="extra">+{{ r.extra }} EXTRA</span> }
                </td>
                <td><span class="tipo" [class]="tm(r.tipo).cls">@if (tm(r.tipo).icon) { <i [class]="tm(r.tipo).icon"></i> } {{ tm(r.tipo).label }}</span></td>
                <td><span class="estado">{{ r.estado }}</span></td>
                <td>
                  @if (r.excedido) { <div class="dur red">{{ durLabel(r.durationMinutes) }}</div><div class="exc">Excedido</div> }
                  @else { <div class="dur ok">{{ durLabel(r.durationMinutes) }}</div> }
                </td>
                <td>
                  @if (r.recogidos.length) {
                    <button class="linen-tog" (click)="toggleCell(r.id, 'recogidos')">{{ r.recogidos.length }} <small>({{ unitsOf(r.recogidos) }} unidades)</small><i class="pi chev" [class.pi-chevron-down]="!isExp(r.id,'recogidos')" [class.pi-chevron-up]="isExp(r.id,'recogidos')"></i></button>
                    @if (isExp(r.id, 'recogidos')) { <div class="linen-list">@for (l of r.recogidos; track l.name) { <div><b>{{ l.units }}</b> {{ l.name }}</div> }</div> }
                  } @else { <span class="zero">0</span> }
                </td>
                <td>
                  @if (r.dejados.length) {
                    <button class="linen-tog" (click)="toggleCell(r.id, 'dejados')">{{ r.dejados.length }} <small>({{ unitsOf(r.dejados) }} unidades)</small><i class="pi chev" [class.pi-chevron-down]="!isExp(r.id,'dejados')" [class.pi-chevron-up]="isExp(r.id,'dejados')"></i></button>
                    @if (isExp(r.id, 'dejados')) { <div class="linen-list">@for (l of r.dejados; track l.name) { <div><b>{{ l.units }}</b> {{ l.name }}</div> }</div> }
                  } @else { <span class="zero">0</span> }
                </td>
                <td>
                  @if (r.repuestos.length) {
                    <button class="linen-tog" (click)="toggleCell(r.id, 'repuestos')">{{ r.repuestos.length }} <small>({{ unitsOf(r.repuestos) }} unidades)</small><i class="pi chev" [class.pi-chevron-down]="!isExp(r.id,'repuestos')" [class.pi-chevron-up]="isExp(r.id,'repuestos')"></i></button>
                    @if (isExp(r.id, 'repuestos')) { <div class="linen-list">@for (l of r.repuestos; track l.name) { <div><b>{{ l.units }}</b> {{ l.name }}</div> }</div> }
                  } @else { <span class="zero">0</span> }
                </td>
                <td>
                  @if (r.adicionales.length) {
                    <div class="adi-h">{{ r.adicionales.length }} items <small>({{ unitsOf(r.adicionales) }} unidades)</small></div>
                    @for (a of r.adicionales; track a.name) { <div class="adi-i">{{ a.name }} x{{ a.units }}</div> }
                    @if (anyCortesia(r.adicionales)) { <span class="cortesia">CORTESÍA</span> }
                  } @else { <span class="zero">0</span> }
                </td>
                <td class="user">{{ r.user }}</td>
                <td><button class="btn det" (click)="openDetail(r)"><i class="pi pi-eye"></i> Detalles</button></td>
              </tr>
            } @empty {
              <tr><td colspan="11" class="empty">{{ loading() ? 'Cargando…' : 'Sin registros en este turno.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Detalle de la operación de limpieza -->
      @if (detail(); as d) {
        <div class="modal-bg" (click)="detail.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <header class="m-head">
              <div><h2>Detalle de limpieza · Hab. {{ d.roomNumber }}</h2><span class="m-sub">Piso {{ d.floor || '-' }}</span></div>
              <button class="m-x" (click)="detail.set(null)"><i class="pi pi-times"></i></button>
            </header>
            <div class="m-grid">
              <div class="m-fld"><span>Tipo</span><b><span class="tipo" [class]="tm(d.tipo).cls">@if (tm(d.tipo).icon) { <i [class]="tm(d.tipo).icon"></i> } {{ tm(d.tipo).label }}</span></b></div>
              <div class="m-fld"><span>Estado</span><b class="ok">{{ d.estado }}</b></div>
              <div class="m-fld"><span>Inicio</span><b>{{ d.dateTime | date: 'dd/MM/yyyy HH:mm' }}</b></div>
              <div class="m-fld"><span>Fin</span><b>{{ d.fin | date: 'dd/MM/yyyy HH:mm' }}</b></div>
              <div class="m-fld"><span>Duración</span><b [class.red]="d.excedido">{{ durLabel(d.durationMinutes) }} @if (d.excedido) { · Excedido }</b></div>
              <div class="m-fld"><span>Usuario</span><b>{{ d.user }}</b></div>
              <div class="m-fld"><span>Estado final habitación</span><b>{{ d.estadoFinal }}</b></div>
            </div>
            <div class="m-cols">
              <div class="m-col"><h4 class="blue">Recogidas ({{ unitsOf(d.recogidos) }})</h4>@for (l of d.recogidos; track l.name) { <div class="m-li"><b>{{ l.units }}</b> {{ l.name }}</div> } @empty { <div class="m-empty">—</div> }</div>
              <div class="m-col"><h4 class="gray">Dejadas ({{ unitsOf(d.dejados) }})</h4>@for (l of d.dejados; track l.name) { <div class="m-li"><b>{{ l.units }}</b> {{ l.name }}</div> } @empty { <div class="m-empty">—</div> }</div>
              <div class="m-col"><h4 class="green">Repuestas ({{ unitsOf(d.repuestos) }})</h4>@for (l of d.repuestos; track l.name) { <div class="m-li"><b>{{ l.units }}</b> {{ l.name }}</div> } @empty { <div class="m-empty">—</div> }</div>
              <div class="m-col"><h4>Adicionales ({{ unitsOf(d.adicionales) }})</h4>@for (a of d.adicionales; track a.name) { <div class="m-li"><b>{{ a.units }}</b> {{ a.name }} @if (a.cortesia) { <span class="cortesia">CORTESÍA</span> }</div> } @empty { <div class="m-empty">—</div> }</div>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .hl { background: #0a0f1a; min-height: 100%; margin: -1.5rem; padding: 1.5rem 1.75rem; color: #e6eef7; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.1rem; }
      h1 { margin: 0; color: #34d399; font-weight: 800; letter-spacing: -0.01em; }
      .head-actions { display: flex; gap: 0.5rem; }
      .btn { border: 0; border-radius: 10px; padding: 0.6rem 0.9rem; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.9rem; }
      .btn.ghost { background: #1b2433; color: #cfd9e6; border: 1px solid #2b3a4f; }
      .btn.icon { background: #1b2433; color: #cfd9e6; border: 1px solid #2b3a4f; padding: 0.6rem 0.75rem; }
      .btn.icon.spin i { animation: sp 0.8s linear infinite; }
      @keyframes sp { to { transform: rotate(360deg); } }
      .btn.blue { background: #2563eb; color: #fff; }
      .btn.nav { background: #131c2b; color: #e6eef7; border: 1px solid #2b3a4f; }
      .btn.nav:disabled { opacity: 0.4; cursor: not-allowed; }

      .filters { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; background: #0e1622; border: 1px solid #1c2738; border-radius: 12px; padding: 0.7rem 0.9rem; margin-bottom: 1rem; }
      .lbl { color: #8aa0ba; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.03em; }
      .inp { background: #131c2b; border: 1px solid #2b3a4f; color: #e6eef7; border-radius: 999px; padding: 0.5rem 0.9rem; width: 140px; }
      .chip { background: #131c2b; border: 1px solid #2b3a4f; color: #cfd9e6; border-radius: 999px; padding: 0.45rem 1rem; cursor: pointer; font-size: 0.85rem; }
      .chip.on { background: #2563eb; border-color: #2563eb; color: #fff; }
      .sep { width: 1px; height: 22px; background: #2b3a4f; margin: 0 0.3rem; }

      .turno-nav { display: flex; align-items: center; gap: 1rem; background: #0e1622; border: 1px solid #1c2738; border-radius: 12px; padding: 0.7rem 1rem; margin-bottom: 1rem; }
      .turno-center { flex: 1; text-align: center; }
      .turno-center .td { font-weight: 800; text-transform: capitalize; }
      .turno-center .th { color: #8aa0ba; font-size: 0.85rem; }
      .reg { color: #8aa0ba; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; }

      .banner { background: linear-gradient(90deg, #f59e0b 0%, #f97316 55%, #d9620a 100%); border-radius: 12px; padding: 1rem 1.5rem; margin-bottom: 1.2rem; display: flex; flex-direction: column; gap: 0.15rem; box-shadow: 0 6px 18px rgba(249,115,22,0.25); }
      .banner strong { font-size: 1.25rem; text-transform: capitalize; color: #fff; }
      .banner span { color: rgba(255,255,255,0.9); font-size: 0.9rem; }

      .tbl-wrap { overflow-x: auto; border: 1px solid #1c2738; border-radius: 14px; }
      .tbl { width: 100%; border-collapse: collapse; min-width: 1100px; }
      .tbl thead th { text-align: left; padding: 1rem 0.9rem; font-size: 0.82rem; font-weight: 700; color: #b7c4d4; background: #111b29; border-bottom: 1px solid #1c2738; white-space: nowrap; }
      .tbl thead th.c.blue { color: #60a5fa; } .tbl thead th.c.gray { color: #94a3b8; } .tbl thead th.c.green { color: #34d399; }
      .tbl tbody td { padding: 0.95rem 0.9rem; border-bottom: 1px solid #16202e; font-size: 0.9rem; vertical-align: top; }
      .tbl tbody tr:hover { background: #0e1622; }
      .dt { font-weight: 600; } .fin { color: #6b7c91; font-size: 0.78rem; }
      .hab strong { font-size: 1rem; } .piso { color: #8aa0ba; font-size: 0.72rem; font-weight: 700; }
      .extra { display: inline-block; margin-top: 0.25rem; background: rgba(16,185,129,0.16); color: #34d399; border: 1px solid rgba(16,185,129,0.4); border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.72rem; font-weight: 700; }
      .tipo { display: inline-flex; align-items: center; gap: 0.35rem; border-radius: 999px; padding: 0.32rem 0.8rem; font-size: 0.8rem; font-weight: 700; }
      .tipo.co { background: rgba(16,185,129,0.14); color: #34d399; }
      .tipo.rn { background: rgba(59,130,246,0.18); color: #93c5fd; }
      .tipo.ad { background: rgba(245,158,11,0.16); color: #fbbf24; }
      .linen-tog { background: transparent; border: 0; color: #e6eef7; cursor: pointer; font-size: 0.9rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.1rem 0; }
      .linen-tog small { color: #8aa0ba; font-weight: 500; }
      .linen-tog .chev { font-size: 0.7rem; color: #8aa0ba; }
      .linen-tog:hover { color: #fff; } .linen-tog:hover .chev { color: #cfd9e6; }
      .linen-list { margin-top: 0.35rem; display: flex; flex-direction: column; gap: 0.2rem; border-left: 2px solid #2b3a4f; padding-left: 0.55rem; }
      .linen-list div { font-size: 0.8rem; color: #cfd9e6; } .linen-list b { color: #fff; }
      .btn.det { background: #131c2b; color: #cfd9e6; border: 1px solid #2b3a4f; padding: 0.45rem 0.75rem; font-size: 0.82rem; }
      .btn.det:hover { background: #1b2433; }

      .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
      .modal { background: #0e1622; border: 1px solid #22304a; border-radius: 16px; width: 720px; max-width: 96vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
      .m-head { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.3rem; border-bottom: 1px solid #1c2738; }
      .m-head h2 { margin: 0; font-size: 1.15rem; color: #fff; } .m-sub { color: #8aa0ba; font-size: 0.82rem; }
      .m-x { background: transparent; border: 0; color: #8aa0ba; cursor: pointer; font-size: 1.1rem; } .m-x:hover { color: #fff; }
      .m-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.9rem; padding: 1.2rem 1.3rem; }
      .m-fld { display: flex; flex-direction: column; gap: 0.2rem; } .m-fld span { color: #8aa0ba; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.03em; } .m-fld b { color: #e6eef7; }
      .m-fld b.ok { color: #34d399; } .m-fld b.red { color: #f87171; }
      .m-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; padding: 0 1.3rem 1.3rem; }
      .m-col { background: #0b1220; border: 1px solid #1c2738; border-radius: 10px; padding: 0.8rem; }
      .m-col h4 { margin: 0 0 0.5rem; font-size: 0.82rem; color: #b7c4d4; } .m-col h4.blue { color: #60a5fa; } .m-col h4.gray { color: #94a3b8; } .m-col h4.green { color: #34d399; }
      .m-li { font-size: 0.82rem; color: #cfd9e6; padding: 0.15rem 0; } .m-li b { color: #fff; } .m-empty { color: #6b7c91; }
      .estado { color: #34d399; font-weight: 600; }
      .dur.ok { color: #34d399; font-weight: 700; } .dur.red { color: #f87171; font-weight: 700; } .exc { color: #f87171; font-size: 0.75rem; }
      .zero { color: #6b7c91; }
      .adi-h { color: #34d399; font-weight: 700; font-size: 0.85rem; } .adi-h small { color: #8aa0ba; font-weight: 500; }
      .adi-i { font-size: 0.8rem; color: #cfd9e6; }
      .cortesia { display: inline-block; margin-top: 0.3rem; background: rgba(37,99,235,0.2); color: #93c5fd; border: 1px solid rgba(37,99,235,0.5); border-radius: 6px; padding: 0.08rem 0.45rem; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; }
      .user { color: #cfd9e6; }
      .empty { text-align: center; color: #6b7c91; padding: 2.5rem; }
    `,
  ],
})
export class HistorialLimpiezaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly shifts = signal<Shift[]>([]);
  readonly idx = signal(0);
  readonly loading = signal(false);
  readonly showFilters = signal(true);
  habFilter = '';
  readonly habApplied = signal('');
  readonly floorFilter = signal<string | null>(null);
  readonly tipoFilter = signal<string | null>(null);
  /** Celdas de prendas desplegadas (clave: `${rowId}|${col}`). */
  readonly expanded = signal<Set<string>>(new Set());
  /** Fila abierta en el modal de Detalles. */
  readonly detail = signal<HistoryRow | null>(null);

  readonly current = computed<Shift | undefined>(() => this.shifts()[this.idx()]);
  readonly floors = computed(() => {
    const set = new Set<string>();
    for (const s of this.shifts()) for (const r of s.rows) if (r.floor) set.add(r.floor);
    return [...set].sort();
  });
  readonly filteredRows = computed<HistoryRow[]>(() => {
    const s = this.current();
    if (!s) return [];
    const hab = this.habApplied().trim();
    const fl = this.floorFilter();
    const tp = this.tipoFilter();
    return s.rows.filter(
      (r) => (!hab || r.roomNumber.includes(hab)) && (!fl || r.floor === fl) && (!tp || r.tipo === tp),
    );
  });

  private readonly route = inject(ActivatedRoute);
  /** Intervalo objetivo (desde el Dashboard → Limpiezas del turno): posiciona el turno inicial. */
  private targetFrom: Date | null = null;

  ngOnInit(): void {
    const from = this.route.snapshot.queryParamMap.get('from');
    this.targetFrom = from ? new Date(from) : null;
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<Shift[]>>(`${this.api}/cleaning/history`).subscribe({
      next: (res) => { this.shifts.set(res.data ?? []); this.idx.set(this.matchIdx()); this.loading.set(false); this.targetFrom = null; },
      error: () => { this.shifts.set([]); this.loading.set(false); },
    });
  }

  /** Si venimos con un intervalo (from) del Dashboard, ubica el turno cuyo inicio más se acerca. */
  private matchIdx(): number {
    const target = this.targetFrom;
    const shifts = this.shifts();
    if (!target || !shifts.length) return 0;
    const startOf = (s: Shift): number => {
      const [hm] = (s.hours || '').split('-');
      const [h, m] = (hm || '00:00').trim().split(':').map(Number);
      const d = new Date(s.dateISO);
      d.setHours(h || 0, m || 0, 0, 0);
      return d.getTime();
    };
    let best = 0;
    let bestDiff = Infinity;
    shifts.forEach((s, i) => { const diff = Math.abs(startOf(s) - target.getTime()); if (diff < bestDiff) { bestDiff = diff; best = i; } });
    return best;
  }

  tm(t: string) { return TIPO_META[t] ?? { label: t, cls: 'co' }; }

  applyHab(): void { this.habApplied.set(this.habFilter); }

  // idx 0 = turno más reciente; "Anterior" avanza hacia turnos más viejos (idx mayor).
  prevTurno(): void { if (this.idx() < this.shifts().length - 1) this.idx.set(this.idx() + 1); }
  nextTurno(): void { if (this.idx() > 0) this.idx.set(this.idx() - 1); }

  durLabel(min: number): string {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  }

  unitsOf(list: { units: number }[]): number { return list.reduce((n, a) => n + a.units, 0); }
  anyCortesia(list: Adicional[]): boolean { return list.some((a) => a.cortesia); }

  /** Despliegue de prendas por columna (Recogidos/Dejados/Repuestos). */
  private ck(id: string, col: string): string { return `${id}|${col}`; }
  isExp(id: string, col: string): boolean { return this.expanded().has(this.ck(id, col)); }
  toggleCell(id: string, col: string): void {
    const s = new Set(this.expanded());
    const k = this.ck(id, col);
    if (s.has(k)) s.delete(k); else s.add(k);
    this.expanded.set(s);
  }

  openDetail(r: HistoryRow): void { this.detail.set(r); }
}
