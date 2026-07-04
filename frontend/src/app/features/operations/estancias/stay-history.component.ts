import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface StayRow {
  id: string;
  tipo: 'ESTADIA_CORTA' | 'RENOVACION' | 'PERNOCTA';
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  checkInAt: string;
  checkOutAt: string | null;
  roomNumber: string | null;
  duration: string;
  active: boolean;
  amount: number;
  paid: number;
  owed: number;
  method: string;
  paymentState: 'PAGADO' | 'PENDIENTE';
  dni: string;
  customer: string;
  plate: string | null;
  notes: string | null;
  cleaningOk: boolean;
  shift: string;
  shiftStart: string;
  shiftEnd: string;
  businessDate: string;
}

const TIPO: Record<string, { label: string; color: string }> = {
  ESTADIA_CORTA: { label: 'Estadía Corta', color: '#22c55e' },
  RENOVACION: { label: 'Renovación', color: '#f59e0b' },
  PERNOCTA: { label: 'Pernocta', color: '#a855f7' },
};
const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', WALLET: 'Yape', TRANSFER: 'Plin', CARD: 'Tarjeta', MIXTO: 'Mixto' };
const SHIFT_LABEL: Record<string, string> = { MANANA: 'Turno Mañana', TARDE: 'Turno Tarde', NOCHE: 'Turno Noche' };
const SHIFTS = ['MANANA', 'TARDE', 'NOCHE'];
const SHIFT_RANGE: Record<string, string> = { MANANA: '06:30 - 14:30', TARDE: '14:30 - 22:30', NOCHE: '22:30 - 06:30' };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function currentShiftIdx(): number {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 6.5 && h < 14.5) return 0;
  if (h >= 14.5 && h < 22.5) return 1;
  return 2;
}

@Component({
  selector: 'app-stay-history',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <section class="wrap">
      <h1>Historial de Estancias</h1>

      <div class="bar">
        <div class="search"><i class="pi pi-search"></i><input [(ngModel)]="search" placeholder="Buscar por cliente o DNI" (keyup.enter)="applySearch()" /></div>
        <div class="f"><label>Tipo</label>
          <select [(ngModel)]="fTipo">
            <option value="">Todos</option><option value="ESTADIA_CORTA">Estadía Corta</option><option value="RENOVACION">Renovación</option><option value="PERNOCTA">Pernocta</option>
          </select>
        </div>
        <div class="f"><label>Día</label><input type="date" [(ngModel)]="fDay" (change)="load()" /></div>
        <span class="sp"></span>
        <button class="act excel" (click)="exportCsv()"><i class="pi pi-download"></i> Exportar Excel</button>
      </div>

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
        <div class="cnt">{{ rows.length }} estancia(s) en este turno</div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th>Tipo Estadía</th><th>Fecha Ingreso</th><th>Hora</th><th class="c">Hab.</th><th>Fecha Salida</th><th>Hora</th><th>Duración</th><th class="r">Monto (S/)</th><th>Método Pago</th><th class="c">Estado Pago</th><th>DNI</th><th>Cliente</th><th>Placa</th><th>Observaciones</th>
            </tr></thead>
            <tbody>
              @for (r of rows; track r.id) {
                <tr>
                  <td>
                    <div class="tipo-cell">
                      <span class="tipo" [style.background]="tipoBg(r.tipo)" [style.color]="tipoColor(r.tipo)"><span class="dot" [style.background]="tipoColor(r.tipo)"></span> {{ tipoLabel(r.tipo) }}</span>
                      @if (r.active) { <span class="sb act">Activa en turno</span> } @else if (r.status === 'CANCELLED') { <span class="sb can">Cancelada</span> } @else { <span class="sb fin">Finalizada</span> }
                      @if (r.cleaningOk) { <span class="sb clean">Limpieza OK</span> }
                    </div>
                  </td>
                  <td>{{ r.checkInAt | date: 'dd/MM/yyyy' }}</td>
                  <td>{{ r.checkInAt | date: 'HH:mm' }}</td>
                  <td class="c"><span class="room">{{ r.roomNumber || '—' }}</span></td>
                  <td>{{ r.checkOutAt ? (r.checkOutAt | date: 'dd/MM/yyyy') : '—' }}</td>
                  <td>{{ r.checkOutAt ? (r.checkOutAt | date: 'HH:mm') : '—' }}</td>
                  <td>{{ r.duration }}</td>
                  <td class="r money">S/ {{ r.amount.toFixed(2) }}</td>
                  <td>{{ paymentLabel(r) }}</td>
                  <td class="c"><span class="est" [class.pag]="r.paymentState === 'PAGADO'" [class.pen]="r.paymentState === 'PENDIENTE'">{{ r.paymentState === 'PAGADO' ? 'Cancelado' : 'Pendiente' }}</span></td>
                  <td>{{ r.dni || '—' }}</td>
                  <td class="cust">{{ r.customer || '—' }}</td>
                  <td>{{ r.plate || '—' }}</td>
                  <td class="obs">{{ r.notes || '—' }}</td>
                </tr>
              } @empty { <tr><td colspan="14" class="empty">Sin estancias en este turno.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.4rem; }
      h1 { margin: 0 0 1rem; font-size: 1.5rem; }
      .muted { color: #8aa0bd; } .empty { text-align: center; padding: 2rem; color: #8aa0bd; }
      .bar { display: flex; align-items: flex-end; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0e1626; border: 1px solid #26364f; border-radius: 10px; padding: 0.55rem 0.9rem; color: #8aa0bd; min-width: 240px; flex: 1; }
      .search input { flex: 1; background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .f { display: flex; flex-direction: column; gap: 0.3rem; } .f label { font-size: 0.72rem; color: #8aa0bd; }
      .f select, .f input { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.5rem; }
      .sp { flex: 1; }
      .act.excel { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.55rem 1rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; background: #22c55e; color: #04130d; }
      .turnnav { display: flex; align-items: center; gap: 1rem; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 0.7rem 1rem; margin-bottom: 1rem; flex-wrap: wrap; justify-content: space-between; }
      .t-nav { background: #16233a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.5rem 0.9rem; cursor: pointer; font-size: 0.82rem; font-weight: 600; } .t-nav:disabled { opacity: 0.4; cursor: not-allowed; }
      .t-cur { text-align: center; text-transform: capitalize; } .t-cur .muted { display: block; font-size: 0.8rem; }
      .t-act { background: rgba(16,185,129,0.2); color: #34d399; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.7rem; font-weight: 700; margin-left: 0.4rem; }
      .cnt { color: #8aa0bd; font-size: 0.85rem; margin-bottom: 0.5rem; }
      .tbl-wrap { overflow-x: auto; border: 1px solid #1c2c44; border-radius: 12px; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.6rem 0.7rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.82rem; white-space: nowrap; vertical-align: top; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.72rem; background: #101a2c; }
      .tbl .r { text-align: right; } .tbl .c { text-align: center; }
      .tipo-cell { display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; }
      .tipo { display: inline-flex; align-items: center; gap: 0.35rem; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.72rem; font-weight: 700; }
      .tipo .dot { width: 7px; height: 7px; border-radius: 50%; }
      .sb { font-size: 0.66rem; font-weight: 700; border-radius: 6px; padding: 0.08rem 0.5rem; }
      .sb.act { background: rgba(139,92,246,0.2); color: #c4b5fd; } .sb.fin { background: rgba(59,130,246,0.18); color: #93c5fd; } .sb.can { background: rgba(248,113,113,0.18); color: #f87171; } .sb.clean { background: rgba(16,185,129,0.18); color: #34d399; }
      .room { background: #13243a; color: #93c5fd; border-radius: 6px; padding: 0.1rem 0.5rem; font-weight: 700; }
      .money { color: #e2e8f0; font-weight: 700; }
      .est { font-size: 0.7rem; font-weight: 700; border-radius: 999px; padding: 0.12rem 0.6rem; }
      .est.pag { background: rgba(16,185,129,0.18); color: #34d399; } .est.pen { background: rgba(245,158,11,0.2); color: #fbbf24; }
      .cust { white-space: normal; max-width: 180px; } .obs { white-space: normal; max-width: 160px; color: #8aa0bd; }
    `,
  ],
})
export class StayHistoryComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly api = environment.apiUrl;

  private readonly dayItems = signal<StayRow[]>([]);
  readonly loading = signal(false);

  search = '';
  fTipo = '';
  fDay = ymd(new Date());
  curShift = signal(currentShiftIdx());

  ngOnInit(): void { this.load(); }

  tipoLabel(t: string): string { return TIPO[t]?.label ?? t; }
  tipoColor(t: string): string { return TIPO[t]?.color ?? '#94a3b8'; }
  tipoBg(t: string): string { return (TIPO[t]?.color ?? '#64748b') + '26'; }

  turnDate(): Date { return new Date(this.fDay + 'T12:00:00'); }
  turnKey(): string { return SHIFTS[this.curShift()]; }
  turnLabel(): string {
    const key = this.turnKey();
    const sample = this.dayItems().find((r) => r.businessDate === this.fDay && r.shift === key);
    const range = sample && sample.shiftStart ? `${sample.shiftStart} - ${sample.shiftEnd}` : SHIFT_RANGE[key];
    return `${SHIFT_LABEL[key]} - ${range}`;
  }
  isCurrentTurn(): boolean { return this.fDay >= ymd(new Date()) && this.curShift() >= currentShiftIdx(); }

  readonly turnRows = computed<StayRow[]>(() => {
    const key = SHIFTS[this.curShift()];
    return this.dayItems()
      .filter((r) => r.businessDate === this.fDay && r.shift === key)
      .filter((r) => !this.fTipo || r.tipo === this.fTipo)
      .sort((a, b) => (a.checkInAt < b.checkInAt ? 1 : -1));
  });

  paymentLabel(r: StayRow): string {
    if (r.paymentState === 'PENDIENTE') return `Pendiente de pago S/${r.owed.toFixed(2)}`;
    const m = METHOD_LABEL[r.method] ?? r.method ?? '';
    return `${m} S/${r.paid.toFixed(2)}`.trim();
  }

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
  applySearch(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    const from = this.fDay + 'T00:00:00';
    const next = new Date(this.fDay + 'T12:00:00'); next.setDate(next.getDate() + 1);
    const to = ymd(next) + 'T08:00:00';
    const params: Record<string, string> = { from, to };
    if (this.search.trim()) params['search'] = this.search.trim();
    this.http.get<ApiResponse<{ items: StayRow[] }>>(`${this.api}/stays/history`, { params }).subscribe({
      next: (res) => { this.dayItems.set(res.data?.items ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el historial.' }); },
    });
  }

  exportCsv(): void {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Tipo', 'Estado', 'Fecha Ingreso', 'Hora Ingreso', 'Habitación', 'Fecha Salida', 'Hora Salida', 'Duración', 'Monto', 'Método/Pago', 'Estado Pago', 'DNI', 'Cliente', 'Placa', 'Observaciones'];
    const lines = [head.map(esc).join(',')];
    for (const r of this.turnRows()) {
      const ci = new Date(r.checkInAt); const co = r.checkOutAt ? new Date(r.checkOutAt) : null;
      const d = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
      const t = (x: Date) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
      lines.push([
        this.tipoLabel(r.tipo), r.active ? 'Activa' : r.status === 'CANCELLED' ? 'Cancelada' : 'Finalizada',
        d(ci), t(ci), r.roomNumber ?? '', co ? d(co) : '', co ? t(co) : '', r.duration, r.amount.toFixed(2),
        this.paymentLabel(r), r.paymentState === 'PAGADO' ? 'Cancelado' : 'Pendiente', r.dni, r.customer, r.plate ?? '', r.notes ?? '',
      ].map(esc).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `estancias-${this.fDay}-${this.turnKey()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
}
