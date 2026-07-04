import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Mov {
  id: string;
  date: string;
  description: string;
  roomNumber: string | null;
  roomId: string | null;
  type: string;
  quantity: number;
  amount: number;
  method: string;
  concept: string;
  collaborator: string;
  shift: string;
}
interface MovResp {
  items: Mov[];
  collaborators: { id: string; name: string }[];
  rooms: { id: string; number: string }[];
}
interface Group {
  key: string;
  date: string;
  shiftLabel: string;
  total: number;
  count: number;
  rows: Mov[];
}

const CONCEPT_LABEL: Record<string, string> = { HOSPEDAJE: 'Hospedaje', PRODUCTOS: 'Productos', SERVICIOS: 'Servicios', PENALIDADES: 'Penalidades' };
const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', WALLET: 'Yape', TRANSFER: 'Plin', CARD: 'Tarjeta', PENDIENTE: 'Pendiente', MIXTO: 'Mixto' };
const SHIFT_LABEL: Record<string, string> = { MANANA: 'Turno Mañana', TARDE: 'Turno Tarde', NOCHE: 'Turno Noche' };
const CONCEPT_COLOR: Record<string, string> = { HOSPEDAJE: '#3b82f6', PRODUCTOS: '#22c55e', SERVICIOS: '#f59e0b', PENALIDADES: '#ef4444' };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-productos-servicios',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, SelectModule],
  template: `
    <section class="wrap">
      <h1>Historial de Productos y Servicios</h1>

      <div class="filters">
        <div class="f"><label>Concepto</label><p-select [options]="conceptOpts" optionLabel="label" optionValue="value" [(ngModel)]="fConcept" styleClass="w" /></div>
        <div class="f"><label>Método de Pago</label><p-select [options]="methodOpts" optionLabel="label" optionValue="value" [(ngModel)]="fMethod" styleClass="w" /></div>
        <div class="f"><label>Habitación</label><p-select [options]="roomOpts()" optionLabel="label" optionValue="value" [(ngModel)]="fRoom" styleClass="w" /></div>
        <div class="f"><label>Colaborador</label><p-select [options]="collabOpts()" optionLabel="label" optionValue="value" [(ngModel)]="fCollab" styleClass="w" /></div>
        <div class="f"><label>Fecha Inicio</label><input type="date" [(ngModel)]="fFrom" /></div>
        <div class="f"><label>Fecha Fin</label><input type="date" [(ngModel)]="fTo" /></div>
      </div>

      <div class="qbar">
        <button class="q h" [class.on]="fConcept === 'HOSPEDAJE'" (click)="quick('HOSPEDAJE')"><i class="pi pi-home"></i> Hospedaje</button>
        <button class="q p" [class.on]="fConcept === 'PRODUCTOS'" (click)="quick('PRODUCTOS')"><i class="pi pi-shopping-cart"></i> Productos</button>
        <button class="q s" [class.on]="fConcept === 'SERVICIOS'" (click)="quick('SERVICIOS')"><i class="pi pi-gift"></i> Servicios</button>
        <button class="q pe" [class.on]="fConcept === 'PENALIDADES'" (click)="quick('PENALIDADES')"><i class="pi pi-exclamation-triangle"></i> Penalidades</button>
        <button class="q v" [class.on]="fConcept === 'ALL'" (click)="quick('ALL')"><i class="pi pi-list"></i> Ver Todos</button>
        <span class="sp"></span>
        <button class="act buscar" (click)="load()"><i class="pi pi-search"></i> Buscar</button>
        <button class="act limpiar" (click)="clear()"><i class="pi pi-refresh"></i> Limpiar</button>
        <button class="act excel" (click)="exportCsv()"><i class="pi pi-download"></i> Exportar Excel</button>
      </div>

      <div class="search"><i class="pi pi-search"></i><input [(ngModel)]="fSearch" (keyup.enter)="load()" placeholder="Buscar por nombre o descripción" /></div>

      <div class="daynav">
        <button class="d-nav" (click)="shiftDay(-1)"><i class="pi pi-chevron-left"></i> Día Anterior</button>
        <div class="d-cur"><strong>{{ dayLabel() }}</strong></div>
        <button class="d-nav" (click)="shiftDay(1)" [disabled]="isToday()">Día Siguiente <i class="pi pi-chevron-right"></i></button>
        <span class="sp"></span>
        <span class="tot">{{ items().length }} registros</span>
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        <h2>Movimientos Registrados <small>({{ items().length }} registros)</small></h2>
        @for (g of groups(); track g.key) {
          <div class="grp">
            <div class="grp-h">
              <div><strong>{{ g.date | date: 'EEEE, dd \\'De\\' MMMM \\'De\\' y' }}</strong><span class="muted"> · {{ g.shiftLabel }}</span></div>
              <div class="grp-tot">Total del turno<br /><strong>S/ {{ g.total | number: '1.2-2' }}</strong><br /><small>{{ g.count }} movimientos</small></div>
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead><tr><th>Fecha</th><th>Descripción</th><th class="c">Habitación</th><th class="c">Tipo</th><th class="c">Cant.</th><th class="r">Monto</th><th>Método</th><th>Concepto</th><th>Colaborador</th></tr></thead>
                <tbody>
                  @for (m of g.rows; track m.id) {
                    <tr>
                      <td>{{ m.date | date: 'dd/MM/yyyy HH:mm' }}</td>
                      <td>{{ m.description }}</td>
                      <td class="c">@if (m.roomNumber) { <span class="room">{{ m.roomNumber }}</span> } @else { <span class="muted">—</span> }</td>
                      <td class="c"><span class="tipo">{{ m.type }}</span></td>
                      <td class="c">{{ m.quantity }}</td>
                      <td class="r money">S/ {{ m.amount | number: '1.2-2' }}</td>
                      <td>{{ methodLabel(m.method) }}</td>
                      <td><span class="concept" [style.background]="conceptBg(m.concept)" [style.color]="conceptFg(m.concept)">{{ conceptLabel(m.concept) }}</span></td>
                      <td>{{ m.collaborator }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @empty { <p class="muted empty">No hay movimientos para los filtros seleccionados.</p> }
      }
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.4rem; }
      h1 { margin: 0 0 1rem; font-size: 1.5rem; } h2 { font-size: 1.05rem; margin: 1rem 0 0.6rem; } h2 small { color: #8aa0bd; font-weight: 400; }
      .muted { color: #8aa0bd; } .empty { text-align: center; padding: 2rem; }
      .filters { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.8rem; background: #0e1622; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; }
      .f { display: flex; flex-direction: column; gap: 0.35rem; } .f label { font-size: 0.72rem; color: #8aa0bd; }
      .f input[type=date] { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.5rem; }
      :host ::ng-deep .w { width: 100%; }
      .qbar { display: flex; align-items: center; gap: 0.5rem; margin: 0.9rem 0; flex-wrap: wrap; }
      .q { display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; background: transparent; border: 1px solid; }
      .q.h { color: #60a5fa; border-color: #2b4b7a; } .q.p { color: #34d399; border-color: #14633f; } .q.s { color: #fbbf24; border-color: #78521a; } .q.pe { color: #f87171; border-color: #7f1d1d; } .q.v { color: #cbd5e1; border-color: #33455f; }
      .q.on { background: currentColor; } .q.on i, .q.on { color: #05121f; }
      .q.h.on { background: #3b82f6; color: #fff; } .q.p.on { background: #22c55e; color: #04130d; } .q.s.on { background: #f59e0b; color: #201603; } .q.pe.on { background: #ef4444; color: #fff; } .q.v.on { background: #475569; color: #fff; }
      .sp { flex: 1; }
      .act { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.5rem 1rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: #fff; }
      .act.buscar { background: #3b82f6; } .act.limpiar { background: #334155; } .act.excel { background: #22c55e; color: #04130d; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0e1626; border: 1px solid #26364f; border-radius: 10px; padding: 0.6rem 0.9rem; margin-bottom: 0.9rem; color: #8aa0bd; }
      .search input { flex: 1; background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .daynav { display: flex; align-items: center; gap: 1rem; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 0.7rem 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .d-nav { background: #16233a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.45rem 0.8rem; cursor: pointer; font-size: 0.82rem; } .d-nav:disabled { opacity: 0.4; cursor: not-allowed; }
      .d-cur { text-transform: capitalize; } .tot { color: #8aa0bd; font-size: 0.85rem; }
      .grp { border: 1px solid #1c2c44; border-radius: 12px; margin-bottom: 1.1rem; overflow: hidden; }
      .grp-h { display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: #14203a; padding: 0.9rem 1.1rem; border-bottom: 1px solid #1c2c44; text-transform: capitalize; }
      .grp-tot { text-align: right; font-size: 0.75rem; color: #8aa0bd; } .grp-tot strong { color: #34d399; font-size: 1.1rem; }
      .tbl-wrap { overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.84rem; white-space: nowrap; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.74rem; }
      .tbl .r { text-align: right; } .tbl .c { text-align: center; }
      .room { background: #13243a; color: #93c5fd; border-radius: 6px; padding: 0.1rem 0.5rem; font-size: 0.78rem; font-weight: 700; }
      .tipo { background: rgba(217,70,239,0.2); color: #e879f9; border-radius: 999px; padding: 0.12rem 0.6rem; font-size: 0.7rem; font-weight: 700; }
      .money { color: #34d399; font-weight: 700; }
      .concept { border-radius: 6px; padding: 0.12rem 0.6rem; font-size: 0.7rem; font-weight: 700; }
      @media (max-width: 900px) { .filters { grid-template-columns: repeat(2, 1fr); } }
    `,
  ],
})
export class ProductosServiciosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly api = environment.apiUrl;

  readonly items = signal<Mov[]>([]);
  readonly loading = signal(false);
  readonly serverCollabs = signal<{ id: string; name: string }[]>([]);
  readonly serverRooms = signal<{ id: string; number: string }[]>([]);

  fConcept = 'ALL';
  fMethod = 'ALL';
  fRoom: string | null = null;
  fCollab: string | null = null;
  fSearch = '';
  fFrom = ymd(new Date());
  fTo = ymd(new Date());

  readonly conceptOpts = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Hospedaje', value: 'HOSPEDAJE' },
    { label: 'Productos', value: 'PRODUCTOS' },
    { label: 'Servicios', value: 'SERVICIOS' },
    { label: 'Penalidades', value: 'PENALIDADES' },
  ];
  readonly methodOpts = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Efectivo', value: 'CASH' },
    { label: 'Yape', value: 'WALLET' },
    { label: 'Plin', value: 'TRANSFER' },
    { label: 'Tarjeta', value: 'CARD' },
    { label: 'Pendiente', value: 'PENDIENTE' },
  ];
  readonly roomOpts = computed(() => [{ label: 'Todas', value: null as string | null }, ...this.serverRooms().map((r) => ({ label: r.number, value: r.id }))]);
  readonly collabOpts = computed(() => [{ label: 'Todos', value: null as string | null }, ...this.serverCollabs().map((c) => ({ label: c.name, value: c.id }))]);

  ngOnInit(): void { this.load(); }

  conceptLabel(c: string): string { return CONCEPT_LABEL[c] ?? c; }
  methodLabel(m: string): string { return METHOD_LABEL[m] ?? m; }
  conceptBg(c: string): string { const col = CONCEPT_COLOR[c] ?? '#64748b'; return col + '2e'; }
  conceptFg(c: string): string { return CONCEPT_COLOR[c] ?? '#94a3b8'; }

  dayLabel(): string {
    const d = new Date(this.fFrom + 'T12:00:00');
    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  isToday(): boolean { return this.fFrom >= ymd(new Date()); }
  shiftDay(dir: number): void {
    const d = new Date(this.fFrom + 'T12:00:00');
    d.setDate(d.getDate() + dir);
    this.fFrom = ymd(d); this.fTo = ymd(d);
    this.load();
  }

  quick(concept: string): void { this.fConcept = concept; this.load(); }

  clear(): void {
    this.fConcept = 'ALL'; this.fMethod = 'ALL'; this.fRoom = null; this.fCollab = null; this.fSearch = '';
    this.fFrom = ymd(new Date()); this.fTo = ymd(new Date());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.fFrom) params['from'] = this.fFrom + 'T00:00:00';
    if (this.fTo) params['to'] = this.fTo + 'T23:59:59';
    if (this.fConcept && this.fConcept !== 'ALL') params['concept'] = this.fConcept;
    if (this.fMethod && this.fMethod !== 'ALL') params['method'] = this.fMethod;
    if (this.fRoom) params['roomId'] = this.fRoom;
    if (this.fCollab) params['collaboratorId'] = this.fCollab;
    if (this.fSearch.trim()) params['search'] = this.fSearch.trim();
    this.http.get<ApiResponse<MovResp>>(`${this.api}/reports/movements`, { params }).subscribe({
      next: (res) => {
        this.items.set(res.data?.items ?? []);
        this.serverCollabs.set(res.data?.collaborators ?? []);
        this.serverRooms.set(res.data?.rooms ?? []);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el historial.' }); },
    });
  }

  readonly groups = computed<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const m of this.items()) {
      const day = m.date.slice(0, 10);
      const key = `${day}|${m.shift}`;
      let g = map.get(key);
      if (!g) { g = { key, date: m.date, shiftLabel: SHIFT_LABEL[m.shift] ?? m.shift, total: 0, count: 0, rows: [] }; map.set(key, g); }
      g.rows.push(m);
      g.total = Math.round((g.total + m.amount) * 100) / 100;
      g.count++;
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  });

  exportCsv(): void {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Fecha', 'Descripción', 'Habitación', 'Tipo', 'Cantidad', 'Monto', 'Método', 'Concepto', 'Colaborador', 'Turno'].map(esc).join(',')];
    for (const m of this.items()) {
      const d = new Date(m.date);
      const f = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      lines.push([f, m.description, m.roomNumber ?? '', m.type, m.quantity, m.amount.toFixed(2), this.methodLabel(m.method), this.conceptLabel(m.concept), m.collaborator, SHIFT_LABEL[m.shift] ?? m.shift].map(esc).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `movimientos-${this.fFrom}_${this.fTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
}
