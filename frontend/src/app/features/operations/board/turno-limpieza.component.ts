import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import QRCode from 'qrcode';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { printPdf } from '../../../core/utils/export';

interface Article { name: string; cat: string; estandar: number; manchada: number; extras: number; robperd: number; total: number; }
interface Category { key: string; label: string; base: number; extras: number; manchada: number; robada: number; total: number; }
interface ShiftReport {
  id: string; shiftType: string; turnoLabel: string; dateISO: string; dateLabel: string;
  userName: string; openedAt: string; closedAt: string | null; status: string; laundrySent: boolean;
  activities: { cleanings: number; maintenances: number };
  ropa: { categories: Category[]; robadas: number; manchadas: number; byArticle: Article[] };
  laundryTotal: number;
}
interface ShiftInfo { shift: { id: string; status: string } | null; inProgress: number; canClose: boolean; }

@Component({
  selector: 'app-turno-limpieza',
  standalone: true,
  imports: [DatePipe, UpperCasePipe, ButtonModule, DialogModule, TooltipModule],
  template: `
    <section class="tl">
      <h1>REPORTE TURNO</h1>

      <!-- Navegación de turnos -->
      <div class="nav">
        <button class="navbtn" [disabled]="idx() >= reports().length - 1" (click)="idx.set(idx() + 1)"><i class="pi pi-chevron-left"></i> TURNO ANTERIOR</button>
        <div class="navc">
          @if (current(); as r) { <div class="t">{{ r.turnoLabel | uppercase }}</div><div class="d">{{ r.dateLabel }}</div> }
          @else { <div class="t">SIN TURNOS</div> }
        </div>
        <button class="navbtn" [disabled]="idx() <= 0" (click)="idx.set(idx() - 1)">TURNO SIGUIENTE <i class="pi pi-chevron-right"></i></button>
      </div>

      @if (current(); as r) {
        <!-- Información del turno -->
        <div class="card">
          <h3>INFORMACIÓN DEL TURNO</h3>
          <div class="info-grid">
            <div><span class="lbl">USUARIO</span><strong>{{ r.userName | uppercase }}</strong></div>
            <div><span class="lbl">INICIO</span><strong>{{ r.openedAt | date: 'd-MMM hh:mm a' }}</strong></div>
            <div><span class="lbl">FIN</span><strong>{{ r.closedAt ? (r.closedAt | date: 'd-MMM hh:mm a') : (r.openedAt | date: 'd-MMM') + ' HORA' }}</strong></div>
            <div><span class="lbl">ESTADO</span><span class="estado" [class.activo]="r.status === 'OPEN'" [class.cerrado]="r.status !== 'OPEN'">{{ r.status === 'OPEN' ? 'ACTIVO' : 'CERRADO' }}</span></div>
          </div>
        </div>

        <!-- Actividades -->
        <div class="card">
          <h3>ACTIVIDADES <i class="pi pi-eye eye"></i></h3>
          <table class="act">
            <thead><tr><th>ACTIVIDAD</th><th class="c">CANTIDAD</th><th class="c">HABITACIÓN</th></tr></thead>
            <tbody>
              <tr><td>LIMPIEZAS REALIZADAS</td><td class="c n">{{ r.activities.cleanings }}</td><td class="c muted">———</td></tr>
              <tr><td><i class="pi pi-wrench"></i> MANTENIMIENTOS REALIZADOS</td><td class="c n">{{ r.activities.maintenances }}</td><td class="c muted">———</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Ropa recolectada -->
        <div class="card">
          <div class="ropa-head">
            <h3>ROPA RECOLECTADA</h3>
            <div class="ropa-actions">
              <button class="iconbtn" (click)="reload()" pTooltip="Actualizar"><i class="pi pi-sync"></i></button>
              <button class="lav" [disabled]="!isCurrentOpen() || r.laundrySent" (click)="openLaundry()"><i class="pi pi-box"></i> A Lavandería <span class="qty">{{ r.laundryTotal }}</span></button>
            </div>
          </div>
          <table class="ropa">
            <thead><tr><th></th><th>TOALLAS</th><th>SABANAS</th><th>EDREDONES</th><th class="rob">ROBADAS</th><th class="man">MANCHADAS</th></tr></thead>
            <tbody>
              <tr><td class="rl">BASE</td><td>{{ cat(r, 'TOALLA').base }}</td><td>{{ cat(r, 'SABANA').base }}</td><td>{{ cat(r, 'EDREDON').base }}</td><td class="rob" rowspan="1">{{ r.ropa.robadas || '-' }}</td><td class="man">{{ r.ropa.manchadas || '-' }}</td></tr>
              <tr class="extras"><td class="rl">EXTRAS</td><td class="g">{{ cat(r, 'TOALLA').extras }}</td><td class="g">{{ cat(r, 'SABANA').extras }}</td><td class="g">{{ cat(r, 'EDREDON').extras }}</td><td>-</td><td>-</td></tr>
              <tr class="total"><td class="rl">TOTAL</td><td class="b">{{ cat(r, 'TOALLA').total }}</td><td class="b">{{ cat(r, 'SABANA').total }}</td><td class="b">{{ cat(r, 'EDREDON').total }}</td><td class="rob">{{ r.ropa.robadas }}</td><td class="man">{{ r.ropa.manchadas }}</td></tr>
            </tbody>
          </table>
          <button class="verdet" (click)="showDet.set(!showDet())"><i class="pi" [class.pi-eye]="!showDet()" [class.pi-eye-slash]="showDet()"></i> {{ showDet() ? 'Ocultar Detalles' : '*VER DETALLES' }}</button>
        </div>

        <!-- Detalle por artículo -->
        @if (showDet()) {
          <div class="card">
            <h3>Detalle por Artículo</h3>
            <table class="det">
              <thead><tr><th>Artículo</th><th class="c">Estándar</th><th class="c">Manchada</th><th class="c">Extras</th><th class="c">Rob/Perd</th><th class="c">Total</th></tr></thead>
              <tbody>
                @for (a of r.ropa.byArticle; track a.name) {
                  <tr><td>{{ a.name }}</td><td class="c">{{ a.estandar }}</td><td class="c man">{{ a.manchada }}</td><td class="c g">{{ a.extras }}</td><td class="c rob">{{ a.robperd }}</td><td class="c b">{{ a.total }}</td></tr>
                } @empty { <tr><td colspan="6" class="muted c">Sin ropa recolectada en este turno.</td></tr> }
              </tbody>
            </table>
            <div class="det-foot"><p-button label="Exportar PDF" icon="pi pi-file-pdf" severity="secondary" (onClick)="exportPdf()" /></div>
          </div>
        }

        <!-- Acciones del turno (solo turno propio abierto) -->
        @if (isCurrentOpen()) {
          <div class="shift-actions">
            <p-button label="Finalizar turno" icon="pi pi-lock" [disabled]="!canClose() || !r.laundrySent" [loading]="busy()" (onClick)="closeShift()"
                      [pTooltip]="!canClose() ? 'Hay limpiezas en curso' : (!r.laundrySent ? 'Envía la ropa a lavandería' : '')" />
          </div>
        }
      } @else {
        <div class="card empty"><p>No hay turnos registrados.</p></div>
      }

      <!-- Sin turno abierto: iniciar -->
      @if (info() && !info()!.shift) {
        <div class="card start"><div><strong>No tienes un turno abierto.</strong><p class="muted">Inicia tu turno para registrar limpiezas y ropa.</p></div><p-button label="Iniciar turno" icon="pi pi-unlock" [loading]="busy()" (onClick)="openShift()" /></div>
      }
    </section>

    <!-- Confirmar entrega a lavandería -->
    <p-dialog [(visible)]="laundryVisible" [modal]="true" header="📦 Confirmar Entrega a Lavandería" [style]="{ width: '38rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      @if (current(); as r) {
        <strong class="lote-t">Resumen del Lote</strong>
        <table class="lote">
          <thead><tr><th></th><th>TOALLAS</th><th>SABANAS</th><th>EDREDONES</th></tr></thead>
          <tbody>
            <tr><td class="rl">BASE</td><td>{{ cat(r, 'TOALLA').base }}</td><td>{{ cat(r, 'SABANA').base }}</td><td>{{ cat(r, 'EDREDON').base }}</td></tr>
            <tr class="extras"><td class="rl">EXTRAS</td><td class="g">{{ cat(r, 'TOALLA').extras }}</td><td class="g">{{ cat(r, 'SABANA').extras }}</td><td class="g">{{ cat(r, 'EDREDON').extras }}</td></tr>
            <tr class="manr"><td class="rl">MANCHADA</td><td class="man">{{ cat(r, 'TOALLA').manchada }}</td><td class="man">{{ cat(r, 'SABANA').manchada }}</td><td class="man">{{ cat(r, 'EDREDON').manchada }}</td></tr>
            <tr class="robr"><td class="rl">ROBADAS</td><td class="rob">{{ cat(r, 'TOALLA').robada }}</td><td class="rob">{{ cat(r, 'SABANA').robada }}</td><td class="rob">{{ cat(r, 'EDREDON').robada }}</td></tr>
            <tr class="total"><td class="rl">TOTAL</td><td class="b">{{ loteTotal(r, 'TOALLA') }}</td><td class="b">{{ loteTotal(r, 'SABANA') }}</td><td class="b">{{ loteTotal(r, 'EDREDON') }}</td></tr>
          </tbody>
        </table>
        <p class="lote-sum">Total enviado: <b>{{ r.laundryTotal }}</b> unidades | Manchada: <b class="man">{{ r.ropa.manchadas }}</b> | Robada: <b class="rob">{{ r.ropa.robadas }}</b></p>
        <div class="warnbox"><i class="pi pi-exclamation-triangle"></i> Se enviará este lote a lavandería. Esta acción no se puede deshacer.</div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="laundryVisible = false" />
        <p-button label="Confirmar Envío" icon="pi pi-check" [loading]="busy()" (onClick)="confirmLaundry()" />
      </ng-template>
    </p-dialog>

    <!-- QR del lote -->
    <p-dialog [(visible)]="qrVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '95vw' }" styleClass="dk-dialog" header=" ">
      <div class="qrbox">
        <p class="qr-title">Código QR para seguimiento</p>
        @if (qrData()) { <img [src]="qrData()" class="qr" alt="QR del lote" /> }
        <p class="qr-sub">Escanear en lavandería para ver el detalle del lote</p>
      </div>
      @if (current(); as r) {
        <div class="totbox">
          <strong>Totales del Lote</strong>
          <div class="chips">
            <span class="chip">Toallas: {{ cat(r, 'TOALLA').total }}</span>
            <span class="chip">Sábanas: {{ loteTotal(r, 'SABANA') }}</span>
            <span class="chip">Edredones: {{ cat(r, 'EDREDON').total }}</span>
            <span class="chip">Fundas: {{ cat(r, 'FUNDA').total }}</span>
          </div>
        </div>
      }
      <p class="muted center">El lote ha sido registrado y está listo para ser recibido en lavandería.</p>
      <ng-template pTemplate="footer">
        <p-button label="Imprimir" icon="pi pi-print" severity="secondary" [outlined]="true" (onClick)="printTicket()" />
        <p-button label="Cerrar" severity="success" (onClick)="qrVisible = false" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .tl { background: #0a0f1a; min-height: 100%; margin: -1.5rem; padding: 1.5rem 1.75rem; color: #e6eef7; }
      h1 { text-align: center; color: #3b82f6; font-weight: 800; letter-spacing: 0.06em; margin: 0 0 1.2rem; }
      .nav { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.2rem; }
      .navbtn { background: #1d4ed8; color: #fff; border: 0; border-radius: 10px; padding: 0.7rem 1.1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; }
      .navbtn:disabled { opacity: 0.4; cursor: not-allowed; }
      .navc { flex: 1; text-align: center; } .navc .t { font-weight: 800; font-size: 1.1rem; } .navc .d { color: #8aa0ba; font-size: 0.85rem; }
      .card { background: #0e1622; border: 1px solid #1c2738; border-radius: 14px; padding: 1.3rem 1.5rem; margin-bottom: 1.1rem; }
      .card.empty, .card.start { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      h3 { margin: 0 0 1rem; color: #b7c4d4; font-size: 0.95rem; letter-spacing: 0.03em; display: flex; align-items: center; gap: 0.5rem; }
      .eye { margin-left: auto; color: #8aa0ba; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem 2rem; }
      .lbl { display: block; color: #6b7c91; font-size: 0.72rem; letter-spacing: 0.05em; margin-bottom: 0.3rem; }
      .info-grid strong { font-size: 1.05rem; }
      .estado { display: inline-block; padding: 0.25rem 0.9rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; }
      .estado.activo { background: rgba(16,185,129,0.18); color: #34d399; border: 1px solid rgba(16,185,129,0.5); }
      .estado.cerrado { background: #334155; color: #cbd5e1; }
      table { width: 100%; border-collapse: collapse; }
      .act th, .act td { text-align: left; padding: 0.9rem 0.5rem; border-bottom: 1px solid #16202e; }
      .act th { color: #8aa0ba; font-size: 0.8rem; border-bottom: 2px solid #2563eb; }
      .act th.c, .act td.c { text-align: center; } .act .n { font-weight: 800; font-size: 1.05rem; }
      .muted { color: #6b7c91; } .center { text-align: center; }
      .ropa-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
      .ropa-head h3 { margin: 0; }
      .ropa-actions { display: flex; gap: 0.6rem; }
      .iconbtn { background: #131c2b; border: 1px solid #2b3a4f; color: #cfd9e6; border-radius: 10px; padding: 0.5rem 0.7rem; cursor: pointer; }
      .lav { background: #2563eb; color: #fff; border: 0; border-radius: 10px; padding: 0.55rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem; }
      .lav:disabled { opacity: 0.45; cursor: not-allowed; }
      .lav .qty { background: #ef4444; border-radius: 999px; padding: 0.05rem 0.55rem; font-size: 0.85rem; }
      .ropa th, .ropa td { text-align: center; padding: 0.85rem 0.5rem; }
      .ropa thead th { color: #8aa0ba; font-size: 0.82rem; font-weight: 700; border-bottom: 2px solid #2563eb; }
      .ropa thead th.rob { color: #f87171; } .ropa thead th.man { color: #fbbf24; }
      .ropa .rl { text-align: left; font-weight: 800; color: #fff; }
      .ropa tbody td { font-weight: 700; font-size: 1.05rem; border-bottom: 1px solid #16202e; }
      .ropa tr.extras { background: rgba(16,185,129,0.06); } .ropa tr.extras .rl { color: #34d399; } .ropa .g { color: #34d399; }
      .ropa tr.total { background: rgba(37,99,235,0.08); } .ropa .b { color: #3b82f6; font-size: 1.25rem; }
      .ropa .rob { color: #f87171; } .ropa .man { color: #fbbf24; }
      .verdet { width: 100%; margin-top: 0.8rem; background: #0b1320; border: 1px solid #1c2738; color: #cfd9e6; border-radius: 10px; padding: 0.7rem; cursor: pointer; font-weight: 600; }
      .det th, .det td { padding: 0.8rem 0.5rem; border-bottom: 1px solid #16202e; }
      .det th { color: #8aa0ba; font-size: 0.82rem; text-align: left; } .det th.c, .det td.c { text-align: center; }
      .det .man { color: #fbbf24; } .det .g { color: #34d399; } .det .rob { color: #f87171; } .det .b { color: #fff; font-weight: 800; }
      .det-foot { margin-top: 1rem; display: flex; justify-content: flex-end; }
      .shift-actions { display: flex; justify-content: flex-end; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6eef7; }
      .lote-t { display: block; margin-bottom: 0.7rem; }
      .lote th, .lote td { text-align: center; padding: 0.7rem 0.5rem; }
      .lote thead th { color: #8aa0ba; font-size: 0.8rem; border-bottom: 1px solid #1c2738; }
      .lote .rl { text-align: left; font-weight: 700; } .lote td { font-weight: 700; }
      .lote tr.extras { background: rgba(16,185,129,0.08); } .lote tr.extras .rl, .lote .g { color: #34d399; }
      .lote tr.manr .rl { color: #fbbf24; } .lote .man { color: #fbbf24; }
      .lote tr.robr { background: rgba(127,29,29,0.18); } .lote tr.robr .rl, .lote .rob { color: #f87171; }
      .lote tr.total .rl { color: #fff; } .lote .b { color: #fff; font-size: 1.1rem; }
      .lote-sum { text-align: center; color: #8aa0ba; margin: 0.8rem 0; } .lote-sum .man { color: #fbbf24; } .lote-sum .rob { color: #f87171; }
      .warnbox { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.4); color: #fcd34d; border-radius: 10px; padding: 0.8rem 1rem; font-size: 0.88rem; display: flex; align-items: center; gap: 0.5rem; }
      .qrbox { background: #0b1320; border: 1px solid #1c2738; border-radius: 14px; padding: 1.5rem; text-align: center; margin-bottom: 1rem; }
      .qr-title { color: #cfd9e6; margin: 0 0 1rem; } .qr-sub { color: #8aa0ba; font-size: 0.85rem; margin: 1rem 0 0; }
      .qr { width: 240px; height: 240px; background: #fff; border-radius: 10px; padding: 0.5rem; }
      .totbox { background: #0b1320; border: 1px solid #1c2738; border-radius: 14px; padding: 1.2rem; margin-bottom: 1rem; }
      .totbox strong { display: block; margin-bottom: 0.7rem; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.6rem; }
      .chip { background: rgba(180,120,20,0.12); border: 1px solid rgba(180,120,20,0.5); color: #fcd34d; border-radius: 10px; padding: 0.5rem 1rem; font-weight: 600; }
      @media (max-width: 720px) { .info-grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class TurnoLimpiezaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly reports = signal<ShiftReport[]>([]);
  readonly info = signal<ShiftInfo | null>(null);
  readonly idx = signal(0);
  readonly busy = signal(false);
  readonly showDet = signal(false);
  readonly qrData = signal<string | null>(null);

  laundryVisible = false;
  qrVisible = false;

  readonly current = computed<ShiftReport | undefined>(() => this.reports()[this.idx()]);
  readonly canClose = computed(() => (this.info()?.canClose ?? false));
  /** El turno mostrado es el turno abierto del usuario actual. */
  isCurrentOpen(): boolean {
    const r = this.current();
    const open = this.info()?.shift;
    return !!r && !!open && r.id === open.id && r.status === 'OPEN';
  }

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<ShiftReport[]>>(`${this.api}/cleaning/shift-report`).subscribe((r) => { this.reports.set(r.data ?? []); this.idx.set(0); });
    this.http.get<ApiResponse<ShiftInfo>>(`${this.api}/cleaning/shift`).subscribe((r) => this.info.set(r.data));
  }

  cat(r: ShiftReport, key: string): Category {
    return r.ropa.categories.find((c) => c.key === key) ?? { key, label: key, base: 0, extras: 0, manchada: 0, robada: 0, total: 0 };
  }
  loteTotal(r: ShiftReport, key: string): number { const c = this.cat(r, key); return c.base + c.extras + c.manchada; }

  openShift(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/shift/open`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno iniciado', detail: 'Tu turno está activo.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  openLaundry(): void { this.laundryVisible = true; }

  confirmLaundry(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/shift/laundry-sent`, {}).subscribe({
      next: async () => {
        this.busy.set(false);
        this.laundryVisible = false;
        await this.buildQr();
        this.qrVisible = true;
        this.toast.add({ severity: 'success', summary: 'Lote enviado', detail: 'Ropa enviada a lavandería.' });
        this.reload();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  private async buildQr(): Promise<void> {
    const r = this.current();
    if (!r) return;
    const payload = JSON.stringify({
      lote: r.id, turno: r.turnoLabel, fecha: r.dateLabel,
      toallas: this.cat(r, 'TOALLA').total, sabanas: this.loteTotal(r, 'SABANA'), edredones: this.cat(r, 'EDREDON').total, fundas: this.cat(r, 'FUNDA').total,
      total: r.laundryTotal,
    });
    try { this.qrData.set(await QRCode.toDataURL(payload, { width: 240, margin: 1 })); } catch { this.qrData.set(null); }
  }

  closeShift(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/shift/close`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno finalizado', detail: 'Ya puedes iniciar un nuevo turno desde Inicio.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'No se pudo cerrar', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  exportPdf(): void {
    const r = this.current();
    if (!r) return;
    const rows = r.ropa.byArticle
      .map((a) => `<tr><td>${a.name}</td><td class="num">${a.estandar}</td><td class="num">${a.manchada}</td><td class="num">${a.extras}</td><td class="num">${a.robperd}</td><td class="num">${a.total}</td></tr>`)
      .join('');
    const html = `
      <p><b>${r.turnoLabel}</b> · ${r.dateLabel} · ${r.userName}</p>
      <p>Limpiezas: ${r.activities.cleanings} · Mantenimientos: ${r.activities.maintenances}</p>
      <h2>Detalle por Artículo</h2>
      <table><thead><tr><th>Artículo</th><th class="num">Estándar</th><th class="num">Manchada</th><th class="num">Extras</th><th class="num">Rob/Perd</th><th class="num">Total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">Sin datos</td></tr>'}</tbody></table>`;
    printPdf(`Reporte de Turno · ${r.turnoLabel} · RIZZOS`, html);
  }

  printTicket(): void {
    const r = this.current();
    if (!r) return;
    const html = `
      <h2>Ticket de Lote a Lavandería</h2>
      <p><b>Lote:</b> ${r.id}</p>
      <p><b>Turno:</b> ${r.turnoLabel} · ${r.dateLabel}</p>
      <p><b>Colaborador:</b> ${r.userName}</p>
      <table><thead><tr><th>Categoría</th><th class="num">Total</th></tr></thead><tbody>
        <tr><td>Toallas</td><td class="num">${this.cat(r, 'TOALLA').total}</td></tr>
        <tr><td>Sábanas</td><td class="num">${this.loteTotal(r, 'SABANA')}</td></tr>
        <tr><td>Edredones</td><td class="num">${this.cat(r, 'EDREDON').total}</td></tr>
        <tr><td>Fundas</td><td class="num">${this.cat(r, 'FUNDA').total}</td></tr>
        <tr><td><b>Total enviado</b></td><td class="num"><b>${r.laundryTotal}</b></td></tr>
      </tbody></table>
      <p>Manchada: ${r.ropa.manchadas} · Robada: ${r.ropa.robadas}</p>`;
    printPdf('Ticket Lavandería · RIZZOS', html);
  }
}
