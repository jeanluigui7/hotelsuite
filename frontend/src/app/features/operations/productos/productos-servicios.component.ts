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
  collaboratorId: string | null;
  shift: string;
  shiftStart: string;
  shiftEnd: string;
  businessDate: string;
}
interface MovResp {
  items: Mov[];
  collaborators: { id: string; name: string }[];
  rooms: { id: string; number: string }[];
}

const CONCEPT_LABEL: Record<string, string> = { HOSPEDAJE: 'Hospedaje', PRODUCTOS: 'Productos', SERVICIOS: 'Servicios', PENALIDADES: 'Penalidades' };
const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', WALLET: 'Yape', TRANSFER: 'Plin', CARD: 'Tarjeta', PENDIENTE: 'Pendiente', MIXTO: 'Mixto' };
const SHIFT_LABEL: Record<string, string> = { MANANA: 'Turno Mañana', TARDE: 'Turno Tarde', NOCHE: 'Turno Noche' };
const CONCEPT_COLOR: Record<string, string> = { HOSPEDAJE: '#3b82f6', PRODUCTOS: '#22c55e', SERVICIOS: '#f59e0b', PENALIDADES: '#ef4444' };
const SHIFTS = ['MANANA', 'TARDE', 'NOCHE'];
// Rango horario por defecto (solo para etiqueta cuando el turno no tiene movimientos).
const SHIFT_RANGE: Record<string, string> = { MANANA: '06:30 - 14:30', TARDE: '14:30 - 22:30', NOCHE: '22:30 - 06:30' };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Turno actual por la hora (0=Mañana, 1=Tarde, 2=Noche). */
function currentShiftIdx(): number {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 6.5 && h < 14.5) return 0;
  if (h >= 14.5 && h < 22.5) return 1;
  return 2;
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
        <div class="f"><label>Día</label><input type="date" [(ngModel)]="fDay" (change)="onDayChange()" /></div>
      </div>

      <div class="qbar">
        <button class="q h" [class.on]="fConcept === 'HOSPEDAJE'" (click)="fConcept = 'HOSPEDAJE'"><i class="pi pi-home"></i> Hospedaje</button>
        <button class="q p" [class.on]="fConcept === 'PRODUCTOS'" (click)="fConcept = 'PRODUCTOS'"><i class="pi pi-shopping-cart"></i> Productos</button>
        <button class="q s" [class.on]="fConcept === 'SERVICIOS'" (click)="fConcept = 'SERVICIOS'"><i class="pi pi-gift"></i> Servicios</button>
        <button class="q pe" [class.on]="fConcept === 'PENALIDADES'" (click)="fConcept = 'PENALIDADES'"><i class="pi pi-exclamation-triangle"></i> Penalidades</button>
        <button class="q v" [class.on]="fConcept === 'ALL'" (click)="fConcept = 'ALL'"><i class="pi pi-list"></i> Ver Todos</button>
        <span class="sp"></span>
        <button class="act limpiar" (click)="clear()"><i class="pi pi-refresh"></i> Limpiar</button>
        <button class="act excel" (click)="exportCsv()"><i class="pi pi-download"></i> Exportar Excel</button>
      </div>

      <div class="search"><i class="pi pi-search"></i><input [(ngModel)]="fSearch" placeholder="Buscar por nombre o descripción" /></div>

      <!-- Navegación por turno (un turno a la vez) -->
      <div class="turnnav">
        <button class="t-nav" (click)="prevTurn()"><i class="pi pi-chevron-left"></i> Turno Anterior</button>
        <div class="t-cur">
          <strong>{{ turnDate() | date: 'EEEE, dd \\'De\\' MMMM \\'De\\' y' }}</strong>
          <span class="muted">{{ turnLabel() }} @if (isCurrentTurn()) { <span class="t-act">ACTUAL</span> }</span>
        </div>
        <button class="t-nav" (click)="nextTurn()" [disabled]="isCurrentTurn()">Siguiente Turno <i class="pi pi-chevron-right"></i></button>
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        @let rows = turnRows();
        <div class="grp">
          <div class="grp-h">
            <div><strong>{{ turnDate() | date: 'EEEE, dd \\'De\\' MMMM \\'De\\' y' }}</strong><span class="muted"> · {{ turnLabel() }}</span></div>
            <div class="grp-tot">Total del turno<br /><strong>S/ {{ turnTotal() | number: '1.2-2' }}</strong><br /><small>{{ rows.length }} movimientos</small></div>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Fecha</th><th>Descripción</th><th class="c">Habitación</th><th class="c">Tipo</th><th class="c">Cant.</th><th class="r">Monto</th><th>Método</th><th>Concepto</th><th>Colaborador</th></tr></thead>
              <tbody>
                @for (m of rows; track m.id) {
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
                } @empty { <tr><td colspan="9" class="empty">Sin movimientos en este turno.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.4rem; }
      h1 { margin: 0 0 1rem; font-size: 1.5rem; }
      .muted { color: #8aa0bd; } .empty { text-align: center; padding: 2rem; color: #8aa0bd; }
      .filters { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.8rem; background: #0e1622; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; }
      .f { display: flex; flex-direction: column; gap: 0.35rem; } .f label { font-size: 0.72rem; color: #8aa0bd; }
      .f input[type=date] { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.5rem; }
      :host ::ng-deep .w { width: 100%; }
      .qbar { display: flex; align-items: center; gap: 0.5rem; margin: 0.9rem 0; flex-wrap: wrap; }
      .q { display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; background: transparent; border: 1px solid; }
      .q.h { color: #60a5fa; border-color: #2b4b7a; } .q.p { color: #34d399; border-color: #14633f; } .q.s { color: #fbbf24; border-color: #78521a; } .q.pe { color: #f87171; border-color: #7f1d1d; } .q.v { color: #cbd5e1; border-color: #33455f; }
      .q.h.on { background: #3b82f6; color: #fff; } .q.p.on { background: #22c55e; color: #04130d; } .q.s.on { background: #f59e0b; color: #201603; } .q.pe.on { background: #ef4444; color: #fff; } .q.v.on { background: #475569; color: #fff; }
      .sp { flex: 1; }
      .act { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.5rem 1rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: #fff; }
      .act.limpiar { background: #334155; } .act.excel { background: #22c55e; color: #04130d; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0e1626; border: 1px solid #26364f; border-radius: 10px; padding: 0.6rem 0.9rem; margin-bottom: 0.9rem; color: #8aa0bd; }
      .search input { flex: 1; background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .turnnav { display: flex; align-items: center; gap: 1rem; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 0.7rem 1rem; margin-bottom: 1rem; flex-wrap: wrap; justify-content: space-between; }
      .t-nav { background: #16233a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.5rem 0.9rem; cursor: pointer; font-size: 0.82rem; font-weight: 600; } .t-nav:disabled { opacity: 0.4; cursor: not-allowed; }
      .t-cur { text-align: center; text-transform: capitalize; } .t-cur .muted { display: block; font-size: 0.8rem; }
      .t-act { background: rgba(16,185,129,0.2); color: #34d399; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.7rem; font-weight: 700; margin-left: 0.4rem; }
      .grp { border: 1px solid #1c2c44; border-radius: 12px; overflow: hidden; }
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

  /** Movimientos del día cargado (los 3 turnos); se filtra por turno en pantalla. */
  private readonly dayItems = signal<Mov[]>([]);
  readonly loading = signal(false);
  readonly serverCollabs = signal<{ id: string; name: string }[]>([]);
  readonly serverRooms = signal<{ id: string; number: string }[]>([]);

  fConcept = 'ALL';
  fMethod = 'ALL';
  fRoom: string | null = null;
  fCollab: string | null = null;
  fSearch = '';
  fDay = ymd(new Date());
  curShift = signal(currentShiftIdx());

  readonly conceptOpts = [
    { label: 'Todos', value: 'ALL' }, { label: 'Hospedaje', value: 'HOSPEDAJE' }, { label: 'Productos', value: 'PRODUCTOS' }, { label: 'Servicios', value: 'SERVICIOS' }, { label: 'Penalidades', value: 'PENALIDADES' },
  ];
  readonly methodOpts = [
    { label: 'Todos', value: 'ALL' }, { label: 'Efectivo', value: 'CASH' }, { label: 'Yape', value: 'WALLET' }, { label: 'Plin', value: 'TRANSFER' }, { label: 'Tarjeta', value: 'CARD' }, { label: 'Pendiente', value: 'PENDIENTE' },
  ];
  readonly roomOpts = computed(() => [{ label: 'Todas', value: null as string | null }, ...this.serverRooms().map((r) => ({ label: r.number, value: r.id }))]);
  readonly collabOpts = computed(() => [{ label: 'Todos', value: null as string | null }, ...this.serverCollabs().map((c) => ({ label: c.name, value: c.id }))]);

  ngOnInit(): void { this.load(); }

  conceptLabel(c: string): string { return CONCEPT_LABEL[c] ?? c; }
  methodLabel(m: string): string { return METHOD_LABEL[m] ?? m; }
  conceptBg(c: string): string { return (CONCEPT_COLOR[c] ?? '#64748b') + '2e'; }
  conceptFg(c: string): string { return CONCEPT_COLOR[c] ?? '#94a3b8'; }

  turnDate(): Date { return new Date(this.fDay + 'T12:00:00'); }
  turnKey(): string { return SHIFTS[this.curShift()]; }
  turnLabel(): string {
    const key = this.turnKey();
    const sample = this.dayItems().find((m) => m.businessDate === this.fDay && m.shift === key);
    const range = sample && sample.shiftStart ? `${sample.shiftStart} - ${sample.shiftEnd}` : SHIFT_RANGE[key];
    return `${SHIFT_LABEL[key]} - ${range}`;
  }
  isCurrentTurn(): boolean { return this.fDay >= ymd(new Date()) && this.curShift() >= currentShiftIdx(); }

  /** Movimientos del turno seleccionado, aplicando los filtros de pantalla. */
  readonly turnRows = computed<Mov[]>(() => {
    const key = SHIFTS[this.curShift()];
    const q = this.fSearch.trim().toLowerCase();
    return this.dayItems()
      .filter((m) => m.businessDate === this.fDay && m.shift === key)
      .filter((m) => this.fConcept === 'ALL' || m.concept === this.fConcept)
      .filter((m) => this.fMethod === 'ALL' || m.method === this.fMethod)
      .filter((m) => !this.fRoom || m.roomId === this.fRoom)
      .filter((m) => !this.fCollab || m.collaboratorId === this.fCollab)
      .filter((m) => !q || m.description.toLowerCase().includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  });
  turnTotal(): number { return Math.round(this.turnRows().reduce((a, m) => a + m.amount, 0) * 100) / 100; }

  prevTurn(): void {
    let s = this.curShift() - 1;
    if (s < 0) { s = 2; const d = this.turnDate(); d.setDate(d.getDate() - 1); this.fDay = ymd(d); this.curShift.set(s); this.load(); return; }
    this.curShift.set(s);
  }
  nextTurn(): void {
    if (this.isCurrentTurn()) return;
    let s = this.curShift() + 1;
    if (s > 2) { s = 0; const d = this.turnDate(); d.setDate(d.getDate() + 1); this.fDay = ymd(d); this.curShift.set(s); this.load(); return; }
    this.curShift.set(s);
  }
  onDayChange(): void { this.load(); }

  clear(): void {
    this.fConcept = 'ALL'; this.fMethod = 'ALL'; this.fRoom = null; this.fCollab = null; this.fSearch = '';
    this.fDay = ymd(new Date()); this.curShift.set(currentShiftIdx()); this.load();
  }

  /** Carga el día seleccionado (incluye la madrugada del día siguiente para el turno Noche). */
  load(): void {
    this.loading.set(true);
    const from = this.fDay + 'T00:00:00';
    const next = new Date(this.fDay + 'T12:00:00'); next.setDate(next.getDate() + 1);
    const to = ymd(next) + 'T08:00:00';
    this.http.get<ApiResponse<MovResp>>(`${this.api}/reports/movements`, { params: { from, to } }).subscribe({
      next: (res) => {
        this.dayItems.set(res.data?.items ?? []);
        this.serverCollabs.set(res.data?.collaborators ?? []);
        this.serverRooms.set(res.data?.rooms ?? []);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el historial.' }); },
    });
  }

  exportCsv(): void {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Fecha', 'Descripción', 'Habitación', 'Tipo', 'Cantidad', 'Monto', 'Método', 'Concepto', 'Colaborador', 'Turno'].map(esc).join(',')];
    for (const m of this.turnRows()) {
      const d = new Date(m.date);
      const f = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      lines.push([f, m.description, m.roomNumber ?? '', m.type, m.quantity, m.amount.toFixed(2), this.methodLabel(m.method), this.conceptLabel(m.concept), m.collaborator, SHIFT_LABEL[m.shift] ?? m.shift].map(esc).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `movimientos-${this.fDay}-${this.turnKey()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
}
