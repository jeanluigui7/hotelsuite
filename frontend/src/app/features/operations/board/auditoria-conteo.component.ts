import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface AuditRow {
  productId: string; name: string; code: string | null;
  recibidoInicio: number; sistemaEsperado: number; diferencia: number; interpretacion: string;
  contadoFisico: number; vendidosAntes: number; horaConteo: string;
}
interface AuditData {
  header: {
    branchName: string; auditedDate: string; auditedShift: string; auditedStart: string; auditedEnd: string;
    sourceShift: string; sourceStart: string; sourceEnd: string; countedBy: string | null;
    countStartedAt: string | null; countFinishedAt: string | null; productsCounted: number; productsTotal: number; status: string;
  };
  summary: { conformes: number; conDiferencia: number; sobrantes: number; faltantes: number };
  rows: AuditRow[];
  review: { observation: string; status: string; reviewedBy: string | null; reviewedAt: string | null };
}
type Filter = 'ALL' | 'DIF' | 'SOB' | 'FAL' | 'CONF';
const SHIFT: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', NOCHE: 'Noche' };

@Component({
  selector: 'app-auditoria-conteo',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <section class="wrap">
      <header class="top">
        <div><h1>Auditoría de Conteo</h1><a class="back" routerLink="/operations/inventario-recepcion"><i class="pi pi-chevron-left"></i> Volver a Inventario de Recepción</a></div>
        <div class="acts">
          <button class="btn ghost" (click)="print()"><i class="pi pi-print"></i> Imprimir</button>
          <button class="btn ghost" (click)="exportCsv()"><i class="pi pi-download"></i> Exportar</button>
        </div>
      </header>

      @if (loading()) { <p class="muted">Cargando auditoría…</p> }
      @else if (error()) { <div class="err"><i class="pi pi-lock"></i> {{ error() }}</div> }
      @else if (data()) {
        @let d = data()!;
        <!-- Encabezado -->
        <div class="hdr">
          <div class="hc"><i class="pi pi-building"></i><div><small>Sucursal</small><b>{{ d.header.branchName }}</b></div></div>
          <div class="hc"><i class="pi pi-calendar"></i><div><small>Fecha auditada</small><b>{{ dt(d.header.auditedDate) | date: 'dd/MM/yyyy' }}</b></div></div>
          <div class="hc"><i class="pi pi-clock"></i><div><small>Turno auditado</small><b>{{ shift(d.header.auditedShift) }} ({{ d.header.auditedStart }} - {{ d.header.auditedEnd }})</b></div></div>
          <div class="hc"><i class="pi pi-database"></i><div><small>Conteo fuente</small><b>{{ shift(d.header.sourceShift) }} (Inicio turno: {{ d.header.sourceStart }})</b></div></div>
          <div class="hc info"><i class="pi pi-info-circle"></i><span>El conteo realizado por el turno {{ shift(d.header.sourceShift) }} determina las diferencias correspondientes al inventario dejado por el turno {{ shift(d.header.auditedShift) }}.</span></div>
        </div>

        <!-- Info del conteo fuente -->
        <div class="hdr2">
          <div class="hc"><i class="pi pi-user"></i><div><small>Realizado por</small><b>{{ d.header.countedBy || '—' }}</b></div></div>
          <div class="hc"><i class="pi pi-clock"></i><div><small>Inicio del conteo</small><b>{{ d.header.countStartedAt ? (d.header.countStartedAt | date: 'HH:mm') : '—' }}</b></div></div>
          <div class="hc"><i class="pi pi-clock"></i><div><small>Finalizado</small><b>{{ d.header.countFinishedAt ? (d.header.countFinishedAt | date: 'HH:mm') : '—' }}</b></div></div>
          <div class="hc"><i class="pi pi-box"></i><div><small>Productos contados</small><b>{{ d.header.productsCounted }} / {{ d.header.productsTotal }}</b></div></div>
          <div class="hc"><i class="pi pi-check-circle"></i><div><small>Estado</small><span class="badge ok">{{ d.header.status }}</span></div></div>
        </div>

        <!-- Tarjetas -->
        <div class="cards">
          <div class="card conf"><i class="pi pi-box"></i><div><small>Productos conformes</small><b>{{ d.summary.conformes }}</b></div></div>
          <div class="card dif"><i class="pi pi-exclamation-triangle"></i><div><small>Productos con diferencia</small><b>{{ d.summary.conDiferencia }}</b></div></div>
          <div class="card sob"><i class="pi pi-arrow-up"></i><div><small>Sobrantes físicos</small><b>{{ d.summary.sobrantes }}</b></div></div>
          <div class="card fal"><i class="pi pi-arrow-down"></i><div><small>Faltantes físicos</small><b>{{ d.summary.faltantes }}</b></div></div>
        </div>

        <!-- Filtros + buscador -->
        <div class="bar">
          <div class="filters">
            <button class="fb" [class.on]="filter() === 'ALL'" (click)="filter.set('ALL')"><i class="pi pi-box"></i> Todos ({{ d.rows.length }})</button>
            <button class="fb dif" [class.on]="filter() === 'DIF'" (click)="filter.set('DIF')"><i class="pi pi-exclamation-triangle"></i> Con diferencia ({{ d.summary.conDiferencia }})</button>
            <button class="fb sob" [class.on]="filter() === 'SOB'" (click)="filter.set('SOB')"><i class="pi pi-arrow-up"></i> Sobrantes ({{ d.summary.sobrantes }})</button>
            <button class="fb fal" [class.on]="filter() === 'FAL'" (click)="filter.set('FAL')"><i class="pi pi-arrow-down"></i> Faltantes ({{ d.summary.faltantes }})</button>
            <button class="fb conf" [class.on]="filter() === 'CONF'" (click)="filter.set('CONF')"><i class="pi pi-check-circle"></i> Conformes ({{ d.summary.conformes }})</button>
          </div>
          <div class="search"><i class="pi pi-search"></i><input [(ngModel)]="search" placeholder="Buscar productos por nombre…" /></div>
        </div>

        <!-- Tabla -->
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>PRODUCTO</th><th class="n">RECIBIDO AL INICIO</th><th class="n">SISTEMA ESPERADO</th><th class="n">DIF.</th><th>INTERPRETACIÓN</th></tr></thead>
            <tbody>
              @for (r of visibleRows(); track r.productId) {
                <tr [class.sel]="sel()?.productId === r.productId" (click)="sel.set(r)">
                  <td class="name"><span class="ico"><i class="pi pi-box"></i></span><div><div>{{ r.name }}</div><small class="muted">{{ r.code || '—' }}</small></div></td>
                  <td class="n rec">{{ r.recibidoInicio }}</td>
                  <td class="n">{{ r.sistemaEsperado }}</td>
                  <td class="n"><span [class.pos]="r.diferencia > 0" [class.neg]="r.diferencia < 0">{{ r.diferencia > 0 ? '+' : '' }}{{ r.diferencia }}</span></td>
                  <td><span [class.i-pos]="r.diferencia > 0" [class.i-neg]="r.diferencia < 0" [class.i-ok]="r.diferencia === 0">{{ r.interpretacion }}</span></td>
                </tr>
              } @empty { <tr><td colspan="5" class="muted center">Sin productos para este filtro.</td></tr> }
            </tbody>
          </table>
        </div>

        <!-- Detalle + causas -->
        <div class="grid2">
          <div class="panel">
            <h3><i class="pi pi-box"></i> Detalle del producto seleccionado</h3>
            @if (sel(); as s) {
              <div class="det-h"><span class="ico"><i class="pi pi-box"></i></span><div><b>{{ s.name }}</b><small class="muted">{{ s.code || '—' }}</small></div></div>
              <div class="det-grid">
                <div><small>Recibido al inicio:</small><b class="rec">{{ s.recibidoInicio }}</b></div>
                <div><small>Conteo realizado:</small><b>{{ s.horaConteo | date: 'HH:mm' }}</b></div>
                <div><small>Sistema esperado:</small><b>{{ s.sistemaEsperado }}</b></div>
                <div><small>Contado físicamente:</small><b>{{ s.contadoFisico }}</b></div>
                <div><small>Diferencia:</small><b [class.pos]="s.diferencia > 0" [class.neg]="s.diferencia < 0">{{ s.diferencia > 0 ? '+' : '' }}{{ s.diferencia }}</b></div>
                <div><small>Vendidos antes del conteo:</small><b>{{ s.vendidosAntes }}</b></div>
                <div><small>Resultado:</small><b [class.i-pos]="s.diferencia > 0" [class.i-neg]="s.diferencia < 0" [class.i-ok]="s.diferencia === 0">{{ s.interpretacion }}</b></div>
                <div><small>Reconstruido al inicio:</small><b>{{ s.recibidoInicio }}</b></div>
              </div>
            } @else { <p class="muted">Selecciona un producto de la tabla para ver su trazabilidad.</p> }
          </div>

          <div class="panel">
            <h3><i class="pi pi-lightbulb"></i> Posibles causas a revisar</h3>
            <ul class="causes">
              @for (c of causes(); track c) { <li>{{ c }}</li> }
            </ul>
            <div class="rev">
              <div class="rev-f"><label>Observación del administrador</label><textarea [(ngModel)]="obs" rows="2" placeholder="Escribe una observación…"></textarea></div>
              <div class="rev-f"><label>Estado de revisión</label>
                <select [(ngModel)]="status">
                  <option value="PENDIENTE">Pendiente</option><option value="REVISADO">Revisado</option><option value="REGULARIZADO">Regularizado</option><option value="SIN_ACCION">Sin acción</option>
                </select>
              </div>
              <button class="btn save" [disabled]="saving()" (click)="saveReview()"><i class="pi pi-save"></i> Guardar revisión</button>
              @if (d.review.reviewedBy) { <small class="rev-by">Última revisión: {{ d.review.reviewedBy }} · {{ d.review.reviewedAt | date: 'dd/MM HH:mm' }}</small> }
            </div>
          </div>
        </div>

        <div class="foot-note"><i class="pi pi-exclamation-triangle"></i> Esta auditoría NO modifica automáticamente el inventario ni la columna AJUSTES. Cualquier regularización deberá ser realizada posteriormente por un usuario autorizado desde el módulo de Ajustes.</div>
      }
    </section>
  `,
  styles: [
    `
      :host { display: block; background: #0a1120; min-height: 100vh; }
      .wrap { padding: 1.4rem 1.6rem; color: #e6edf5; max-width: 1400px; margin: 0 auto; }
      .muted { color: #8aa0bd; } .center { text-align: center; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.1rem; }
      h1 { margin: 0; font-size: 1.7rem; color: #fff; } h3 { margin: 0 0 0.7rem; font-size: 0.98rem; color: #cbd5e1; display: flex; align-items: center; gap: 0.45rem; } h3 .pi { color: #fbbf24; }
      .back { display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.4rem; font-size: 0.82rem; color: #93c5fd; text-decoration: none; } .back:hover { text-decoration: underline; }
      .acts { display: flex; gap: 0.6rem; }
      .btn { display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 9px; padding: 0.55rem 0.9rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; border: 1px solid #26364f; background: #131f34; color: #cbd5e1; } .btn:hover { background: #1a2942; }
      .btn.save { background: #2563eb; border-color: #2563eb; color: #fff; margin-top: 0.6rem; } .btn.save:hover { background: #1d4ed8; } .btn.save:disabled { opacity: 0.6; cursor: not-allowed; }
      .err { background: rgba(244,63,94,0.12); border: 1px solid #7f1d1d; color: #fca5a5; border-radius: 12px; padding: 1rem; display: flex; align-items: center; gap: 0.5rem; }
      .hdr, .hdr2 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.7rem; background: #0e1626; border: 1px solid #1c2c44; border-radius: 12px; padding: 0.9rem 1rem; margin-bottom: 0.8rem; }
      .hc { display: flex; align-items: flex-start; gap: 0.55rem; } .hc > .pi { color: #60a5fa; font-size: 1.1rem; margin-top: 0.15rem; } .hc small { display: block; color: #8aa0bd; font-size: 0.68rem; } .hc b { color: #fff; font-size: 0.92rem; }
      .hc.info { grid-column: span 1; color: #93c5fd; } .hc.info span { font-size: 0.76rem; line-height: 1.35; }
      .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; margin-bottom: 1rem; }
      .card { display: flex; align-items: center; gap: 0.7rem; border-radius: 12px; padding: 0.9rem 1rem; border: 1px solid #1c2c44; } .card > .pi { font-size: 1.5rem; } .card small { display: block; font-size: 0.74rem; } .card b { font-size: 1.6rem; }
      .card.conf { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.35); } .card.conf .pi, .card.conf b { color: #34d399; } .card.conf small { color: #6ee7b7; }
      .card.dif { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.35); } .card.dif .pi, .card.dif b { color: #fbbf24; } .card.dif small { color: #fcd34d; }
      .card.sob { background: rgba(16,185,129,0.08); border-color: rgba(16,185,129,0.3); } .card.sob .pi, .card.sob b { color: #34d399; } .card.sob small { color: #8aa0bd; }
      .card.fal { background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.35); } .card.fal .pi, .card.fal b { color: #fb7185; } .card.fal small { color: #8aa0bd; }
      .bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
      .filters { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .fb { display: inline-flex; align-items: center; gap: 0.35rem; border-radius: 8px; padding: 0.45rem 0.75rem; font-size: 0.8rem; font-weight: 700; cursor: pointer; border: 1px solid #26364f; background: #0e1626; color: #9fb0c3; } .fb.on { background: #2563eb; border-color: #2563eb; color: #fff; } .fb.dif.on { background: #b45309; border-color: #b45309; } .fb.sob.on, .fb.conf.on { background: #059669; border-color: #059669; } .fb.fal.on { background: #e11d48; border-color: #e11d48; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0e1626; border: 1px solid #26364f; border-radius: 10px; padding: 0.5rem 0.8rem; color: #8aa0bd; min-width: 260px; } .search input { flex: 1; background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .tbl-wrap { overflow-x: auto; border: 1px solid #1c2c44; border-radius: 12px; margin-bottom: 1rem; }
      .tbl { width: 100%; border-collapse: collapse; } .tbl th, .tbl td { padding: 0.7rem 0.9rem; border-bottom: 1px solid #16202e; text-align: left; font-size: 0.85rem; } .tbl th { color: #8aa0bd; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em; background: #0c1524; } .tbl .n { text-align: center; }
      .tbl tbody tr { cursor: pointer; } .tbl tbody tr:hover { background: #0f1b2e; } .tbl tr.sel { background: #13233b; }
      .name { display: flex; align-items: center; gap: 0.6rem; } .name .ico { background: #14203400; border: 1px solid #274468; padding: 0.3rem; border-radius: 7px; color: #8b97a8; } .name small { color: #64748b; }
      .rec { color: #60a5fa; font-weight: 800; }
      .pos { color: #34d399; font-weight: 800; } .neg { color: #fb7185; font-weight: 800; }
      .i-pos { color: #34d399; font-weight: 700; } .i-neg { color: #fb7185; font-weight: 700; } .i-ok { color: #93c5fd; font-weight: 700; }
      .badge { font-size: 0.7rem; font-weight: 800; padding: 0.1rem 0.5rem; border-radius: 999px; } .badge.ok { background: rgba(16,185,129,0.2); color: #6ee7b7; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem; }
      .panel { background: #0e1626; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; }
      .det-h { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.8rem; } .det-h .ico { background: #0b1220; border: 1px solid #274468; padding: 0.35rem; border-radius: 8px; color: #8b97a8; } .det-h b { color: #fff; }
      .det-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.2rem; } .det-grid > div { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border-bottom: 1px solid #16202e; padding: 0.3rem 0; } .det-grid small { color: #8aa0bd; font-size: 0.8rem; } .det-grid b { font-size: 0.92rem; }
      .causes { margin: 0 0 0.8rem; padding-left: 1.1rem; color: #cbd5e1; } .causes li { font-size: 0.82rem; margin-bottom: 0.25rem; }
      .rev { border-top: 1px dashed #1c2c44; padding-top: 0.7rem; } .rev-f { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.6rem; } .rev-f label { font-size: 0.75rem; color: #8aa0bd; }
      .rev textarea, .rev select { background: #0b1220; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.55rem 0.7rem; font: inherit; outline: none; } .rev textarea { resize: vertical; }
      .rev-by { display: block; margin-top: 0.5rem; color: #8aa0bd; font-size: 0.74rem; }
      .foot-note { display: flex; align-items: flex-start; gap: 0.5rem; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.35); border-radius: 10px; padding: 0.7rem 0.9rem; color: #fcd34d; font-size: 0.8rem; }
      @media (max-width: 900px) { .hdr, .hdr2, .cards { grid-template-columns: repeat(2, 1fr); } .grid2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class AuditoriaConteoComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(MessageService);
  private readonly api = environment.apiUrl;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly data = signal<AuditData | null>(null);
  readonly filter = signal<Filter>('ALL');
  readonly sel = signal<AuditRow | null>(null);
  readonly saving = signal(false);
  search = '';
  obs = '';
  status = 'PENDIENTE';
  private businessDate = '';
  private shiftParam = '';

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    this.businessDate = q.get('fecha') || q.get('businessDate') || '';
    this.shiftParam = (q.get('turno') || q.get('shift') || '').toUpperCase();
    this.load();
  }

  shift(s: string): string { return SHIFT[s] ?? s; }
  dt(s: string): Date { return new Date(`${s}T12:00:00`); }

  private load(): void {
    if (!this.businessDate || !this.shiftParam) { this.loading.set(false); this.error.set('Faltan parámetros de la auditoría (fecha/turno).'); return; }
    this.loading.set(true);
    this.http.get<ApiResponse<AuditData>>(`${this.api}/reception-inventory/audit`, { params: { businessDate: this.businessDate, shift: this.shiftParam } }).subscribe({
      next: (r) => {
        this.data.set(r.data ?? null);
        this.obs = r.data?.review.observation ?? '';
        this.status = r.data?.review.status ?? 'PENDIENTE';
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(e.status === 403 ? 'Acceso denegado. La auditoría de conteo es solo para administradores.' : (e.error?.error?.message ?? 'No se pudo cargar la auditoría.'));
      },
    });
  }

  readonly visibleRows = computed<AuditRow[]>(() => {
    const d = this.data(); if (!d) return [];
    const q = this.search.trim().toLowerCase();
    const f = this.filter();
    return d.rows.filter((r) => {
      if (f === 'DIF' && r.diferencia === 0) return false;
      if (f === 'SOB' && r.diferencia <= 0) return false;
      if (f === 'FAL' && r.diferencia >= 0) return false;
      if (f === 'CONF' && r.diferencia !== 0) return false;
      return !q || r.name.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q);
    });
  });

  causes(): string[] {
    const s = this.sel();
    const sob = ['Venta registrada pero producto no entregado', 'Cambio de producto no corregido', 'Venta duplicada en sistema', 'Ingreso anterior no registrado'];
    const fal = ['Producto entregado sin registrar venta', 'Cambio de producto no registrado', 'Consumo no registrado', 'Pérdida', 'Error de conteo', 'Salida no registrada'];
    if (!s || s.diferencia === 0) return [...sob, ...fal];
    return s.diferencia > 0 ? sob : fal;
  }

  saveReview(): void {
    this.saving.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/audit/review`, { businessDate: this.businessDate, shift: this.shiftParam, observation: this.obs, status: this.status }).subscribe({
      next: () => { this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Revisión guardada', detail: 'La observación y el estado se registraron.' }); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  print(): void { window.print(); }
  exportCsv(): void {
    const d = this.data(); if (!d) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Producto', 'Código', 'Recibido al inicio', 'Sistema esperado', 'Diferencia', 'Interpretación', 'Contado físico', 'Vendidos antes'];
    const lines = [head.map(esc).join(',')];
    for (const r of this.visibleRows()) {
      lines.push([r.name, r.code ?? '', r.recibidoInicio, r.sistemaEsperado, r.diferencia, r.interpretacion, r.contadoFisico, r.vendidosAntes].map(esc).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `auditoria-${this.businessDate}-${this.shiftParam}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
}
