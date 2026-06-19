import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { downloadCsv, printPdf } from '../../../core/utils/export';

interface Shift { id: string; shiftType: string; status: string; laundrySent: boolean; openedAt: string; }
interface ShiftInfo { shift: Shift | null; inProgress: number; canClose: boolean; }
interface Row { type: string; name: string; rem: number; sum: number; }
interface Floor { floor: string; rows: Row[]; }
interface Report { floors: Floor[]; totals: { rem: number; sum: number }; cleaningsDone: number; maintenances: number; laundryItems: number; }

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sábana', EDREDON: 'Edredón', AMENITY: 'Amenity' };

@Component({
  selector: 'app-turno-limpieza',
  standalone: true,
  imports: [DatePipe, ButtonModule, TooltipModule],
  template: `
    <section class="tl">
      <header class="top">
        <h1>Turno de Limpieza</h1>
        <div class="exp">
          <p-button label="Exportar PDF" icon="pi pi-file-pdf" severity="secondary" [disabled]="!report()" (onClick)="exportPdf()" />
          <p-button label="Exportar CSV" icon="pi pi-file-excel" severity="secondary" [outlined]="true" [disabled]="!report()" (onClick)="exportCsv()" />
        </div>
      </header>

      <!-- Estado del turno -->
      <div class="shift">
        @if (info(); as i) {
          @if (i.shift) {
            <div class="s-info">
              <span class="badge open">Turno {{ i.shift.shiftType === 'MANANA' ? 'Mañana' : 'Tarde' }} ABIERTO</span>
              <span class="muted">desde {{ i.shift.openedAt | date: 'dd/MM HH:mm' }}</span>
              @if (i.inProgress > 0) { <span class="warn"><i class="pi pi-exclamation-triangle"></i> {{ i.inProgress }} limpieza(s) en curso</span> }
              @if (!i.shift.laundrySent) { <span class="warn"><i class="pi pi-inbox"></i> Falta enviar ropa a lavandería</span> }
            </div>
            <div class="s-actions">
              @if (!i.shift.laundrySent) { <p-button label="Marcar lavandería enviada" icon="pi pi-check" severity="secondary" size="small" (onClick)="markLaundry()" /> }
              <p-button label="Finalizar turno" icon="pi pi-lock" [disabled]="!i.canClose || !i.shift.laundrySent" [loading]="busy()" (onClick)="closeShift()"
                        [pTooltip]="!i.canClose ? 'Hay limpiezas en curso' : (!i.shift.laundrySent ? 'Envía la ropa a lavandería' : '')" />
            </div>
          } @else {
            <div class="s-info"><span class="badge closed">Sin turno abierto</span></div>
            <p-button label="Iniciar turno" icon="pi pi-unlock" [loading]="busy()" (onClick)="openShift()" />
          }
        }
      </div>

      <!-- Reporte -->
      @if (report(); as r) {
        <div class="cards">
          <div class="card"><span class="l">Limpiezas realizadas</span><span class="v">{{ r.cleaningsDone }}</span></div>
          <div class="card"><span class="l">Mantenimientos</span><span class="v">{{ r.maintenances }}</span></div>
          <div class="card"><span class="l">Ropa a lavandería</span><span class="v">{{ r.laundryItems }}</span></div>
          <div class="card"><span class="l">Total REM</span><span class="v rem">{{ r.totals.rem }}</span></div>
          <div class="card"><span class="l">Total SUM</span><span class="v sum">{{ r.totals.sum }}</span></div>
        </div>

        <h3>Ropa contada por piso</h3>
        <div class="floors">
          @for (f of r.floors; track f.floor) {
            <div class="floor">
              <div class="fh">PISO {{ f.floor }}</div>
              <table>
                <thead><tr><th>Ropa</th><th class="rem">REM</th><th class="sum">SUM</th></tr></thead>
                <tbody>@for (row of f.rows; track row.name + row.type) { <tr><td>{{ typeLabel(row.type) }} {{ row.name }}</td><td class="rem">{{ row.rem }}</td><td class="sum">{{ row.sum }}</td></tr> }</tbody>
              </table>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .tl { background: #0b1410; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6efe9; }
      h1 { margin: 0; color: #fff; } h3 { margin: 1.4rem 0 0.7rem; color: #34d399; }
      .top { display: flex; align-items: center; justify-content: space-between; }
      .exp { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .muted { color: #8aa499; }
      .shift { background: #0e241c; border: 1px solid #1f3a2c; border-radius: 12px; padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
      .s-info { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
      .s-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .badge { padding: 0.3rem 0.8rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; }
      .badge.open { background: #10b981; color: #06281c; } .badge.closed { background: #475569; color: #fff; }
      .warn { color: #fbbf24; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.3rem; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 1rem; }
      .card { background: #0e241c; border: 1px solid #1f3a2c; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.2rem; }
      .card .l { font-size: 0.78rem; color: #8aa499; text-transform: uppercase; }
      .card .v { font-size: 1.7rem; font-weight: 800; color: #fff; } .v.rem { color: #f87171; } .v.sum { color: #34d399; }
      .floors { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap: 1rem; }
      .floor { background: #0e241c; border: 1px solid #1f3a2c; border-radius: 12px; overflow: hidden; }
      .fh { background: #12231b; text-align: center; font-weight: 800; padding: 0.5rem; color: #fff; }
      .floor table { width: 100%; border-collapse: collapse; }
      .floor th, .floor td { padding: 0.4rem 0.6rem; font-size: 0.82rem; border-top: 1px solid #14271f; text-align: left; }
      .rem { color: #f87171; text-align: center; } .sum { color: #34d399; text-align: center; } th.rem, th.sum { text-align: center; color: #8aa499; }
    `,
  ],
})
export class TurnoLimpiezaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly info = signal<ShiftInfo | null>(null);
  readonly report = signal<Report | null>(null);
  readonly busy = signal(false);

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<ShiftInfo>>(`${this.api}/cleaning/shift`).subscribe((r) => this.info.set(r.data));
    this.http.get<ApiResponse<Report>>(`${this.api}/cleaning/turno-report`).subscribe((r) => this.report.set(r.data));
  }
  typeLabel(t: string): string { return TYPE_LABEL[t] ?? t; }

  openShift(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/shift/open`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno iniciado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
  markLaundry(): void {
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/shift/laundry-sent`, {}).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Lavandería', detail: 'Marcada como enviada.' }); this.reload(); },
      error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }),
    });
  }
  closeShift(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/shift/close`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno finalizado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'No se pudo cerrar', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  exportCsv(): void {
    const r = this.report();
    if (!r) return;
    const rows: (string | number)[][] = [];
    for (const f of r.floors) for (const row of f.rows) rows.push([`Piso ${f.floor}`, `${this.typeLabel(row.type)} ${row.name}`, row.rem, row.sum]);
    rows.push([], ['Limpiezas', r.cleaningsDone], ['Mantenimientos', r.maintenances], ['Ropa a lavandería', r.laundryItems], ['Total REM', r.totals.rem], ['Total SUM', r.totals.sum]);
    downloadCsv('reporte-turno-limpieza', ['Piso', 'Ropa', 'REM', 'SUM'], rows);
  }

  exportPdf(): void {
    const r = this.report();
    if (!r) return;
    const kpis = `
      <div class="cards">
        <div class="kpi"><div class="l">Limpiezas</div><div class="v">${r.cleaningsDone}</div></div>
        <div class="kpi"><div class="l">Mantenimientos</div><div class="v">${r.maintenances}</div></div>
        <div class="kpi"><div class="l">Ropa a lavandería</div><div class="v">${r.laundryItems}</div></div>
        <div class="kpi"><div class="l">Total REM</div><div class="v">${r.totals.rem}</div></div>
        <div class="kpi"><div class="l">Total SUM</div><div class="v">${r.totals.sum}</div></div>
      </div>`;
    const floors = r.floors
      .map((f) => {
        const body = f.rows
          .map((row) => `<tr><td>${this.typeLabel(row.type)} ${row.name}</td><td class="num">${row.rem}</td><td class="num">${row.sum}</td></tr>`)
          .join('');
        return `<h2>Piso ${f.floor}</h2><table><thead><tr><th>Ropa</th><th class="num">REM</th><th class="num">SUM</th></tr></thead><tbody>${body || '<tr><td colspan="3">Sin datos</td></tr>'}</tbody></table>`;
      })
      .join('');
    printPdf('Reporte de Turno de Limpieza · RIZZOS', kpis + floors);
  }
}
