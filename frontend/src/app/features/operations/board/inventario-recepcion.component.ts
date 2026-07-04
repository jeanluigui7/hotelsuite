import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { PrintingService } from '../../../core/printing/printing.service';
import { printPdf } from '../../../core/utils/export';

interface InvItem { productId: string; name: string; sku?: string | null; categoryId?: string | null; categoryName?: string | null; stockInicial: number; stock: number; min: number; ingresos: number; salidas: number; belowMin: boolean; }
interface TurnInfo { shift: string; businessDate: string; startTime: string; endTime: string; isCurrent: boolean; }
interface Req { id: string; status: string; createdAt: string; items: { productId: string; name: string; quantity: number }[]; }
interface PrintJob { id: string; type: string; title: string; status: string; createdAt: string; payload?: string | null; }

@Component({
  selector: 'app-inventario-recepcion',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule, TagModule],
  template: `
    <section class="inv">
      <header class="top">
        <h1>Inventario de Recepción</h1>
        <div class="acts">
          <button class="btn blue" (click)="recVisible = true"><i class="pi pi-inbox"></i> Recepcionar Productos @if (sentRequests().length) { <span class="b">{{ sentRequests().length }}</span> }</button>
          <button class="btn green" [disabled]="selected().size === 0" (click)="openRequest()"><i class="pi pi-plus"></i> Solicitar Seleccionados</button>
          <button class="btn red" [disabled]="selected().size === 0" (click)="openWriteOff()"><i class="pi pi-minus"></i> Dar de Baja Seleccionados</button>
          <button class="btn ghost" (click)="report(false)"><i class="pi pi-print"></i> Previsualizar Reporte</button>
          <button class="btn ghost" (click)="report(true)"><i class="pi pi-print"></i> Reporte Verificado</button>
        </div>
      </header>

      <div class="bar">
        <span class="search"><i class="pi pi-search"></i><input pInputText placeholder="Buscar artículos por nombre..." [(ngModel)]="search" /></span>
        <p-select [options]="categoryOptions()" optionLabel="label" optionValue="value" [(ngModel)]="categoryFilter" placeholder="Todas las Categorías" [showClear]="true" styleClass="dk" />
      </div>

      <div class="turno">
        <button class="t-nav" (click)="shiftTurno(-1)"><i class="pi pi-chevron-left"></i> Turno Anterior</button>
        <div class="t-info">
          <strong>{{ turnoDate() | date: 'EEEE, d \\'De\\' MMMM \\'De\\' y' }}</strong>
          <span class="muted">{{ turnoLabel() }} @if (turn()?.isCurrent) { <span class="t-act">ACTUAL</span> }</span>
        </div>
        <button class="t-nav" (click)="shiftTurno(1)" [disabled]="turn()?.isCurrent">Siguiente Turno <i class="pi pi-chevron-right"></i></button>
        <span class="spacer"></span>
        <span class="counts"><i class="pi pi-box"></i> {{ filtered().length }} productos | <span class="low-c"><i class="pi pi-exclamation-triangle"></i> {{ lowStockCount() }} bajo stock</span></span>
      </div>

      <table class="tbl">
        <thead><tr>
          <th class="ck"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" /></th>
          <th>NOMBRE</th><th class="n">STOCK INICIAL</th><th class="n">INGRESOS</th><th class="n">SALIDAS</th><th class="n">STOCK ACT./MÍN.</th><th class="g"><i class="pi pi-cog"></i></th>
        </tr></thead>
        <tbody>
          @for (it of filtered(); track it.productId) {
            <tr [class.low]="it.belowMin">
              <td class="ck"><input type="checkbox" [checked]="selected().has(it.productId)" (change)="toggle(it.productId)" /></td>
              <td class="name"><span class="ico"><i class="pi pi-box"></i></span><div><div>{{ it.name }}</div><small class="muted">{{ it.sku || '—' }}</small></div></td>
              <td class="n init">{{ it.stockInicial }}</td>
              <td class="n pos">{{ it.ingresos }}</td>
              <td class="n neg">{{ it.salidas }}</td>
              <td class="n">@if (it.belowMin) { <span class="warn"><i class="pi pi-exclamation-triangle"></i> {{ it.stock }} u.</span> } @else { <span>{{ it.stock }} u.</span> }</td>
              <td class="g"><button class="gear" (click)="openRowMenu(it)"><i class="pi pi-cog"></i></button></td>
            </tr>
          } @empty { <tr><td colspan="7" class="muted center">Sin productos.</td></tr> }
        </tbody>
      </table>

      <h3 class="sec">Cola de impresión</h3>
      <div class="queue">
        @for (j of queue(); track j.id) {
          <div class="job">
            <span class="jt">{{ j.title }}</span>
            <span class="muted">{{ j.createdAt | date: 'dd/MM HH:mm' }}</span>
            <p-tag [value]="j.status === 'PENDING' ? 'Pendiente' : 'Impreso'" [severity]="j.status === 'PENDING' ? 'warn' : 'secondary'" />
            <p-button label="Imprimir" icon="pi pi-print" size="small" [text]="true" (onClick)="print(j)" />
          </div>
        } @empty { <p class="muted">Sin impresiones en cola.</p> }
      </div>
    </section>

    <!-- Solicitar -->
    <p-dialog [(visible)]="reqVisible" [modal]="true" header="Solicitar productos" [style]="{ width: '30rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (it of selectedItems(); track it.productId) {
          <div class="qrow"><span>{{ it.name }}</span><p-inputNumber [(ngModel)]="qty[it.productId]" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="reqVisible = false" />
        <p-button label="Enviar Solicitudes" icon="pi pi-send" [loading]="busy()" (onClick)="sendRequest()" />
      </ng-template>
    </p-dialog>

    <!-- Dar de baja -->
    <p-dialog [(visible)]="woVisible" [modal]="true" header="Dar de baja" [style]="{ width: '30rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (it of selectedItems(); track it.productId) {
          <div class="qrow"><span>{{ it.name }} (stock {{ it.stock }})</span><p-inputNumber [(ngModel)]="qty[it.productId]" [min]="1" [max]="it.stock" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
        <label>Motivo</label>
        <input pInputText [(ngModel)]="woReason" placeholder="Ej. producto vencido" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="woVisible = false" />
        <p-button label="Dar de Baja" icon="pi pi-check" severity="danger" [disabled]="!woReason" [loading]="busy()" (onClick)="doWriteOff()" />
      </ng-template>
    </p-dialog>

    <!-- Recepcionar -->
    <p-dialog [(visible)]="recVisible" [modal]="true" header="Recepcionar productos" [style]="{ width: '34rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (r of sentRequests(); track r.id) {
          <div class="req">
            <div class="req-head"><span>Solicitud {{ r.id.slice(0,8) }}</span><span class="muted">{{ r.createdAt | date: 'dd/MM HH:mm' }}</span></div>
            <div class="req-items">@for (i of r.items; track i.productId) { <span class="chip">{{ i.name }} x{{ i.quantity }}</span> }</div>
            <p-button label="Confirmar recepción" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="receive(r.id)" />
          </div>
        } @empty { <p class="muted">No hay productos enviados por recepcionar.</p> }
      </div>
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="recVisible = false" /></ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .inv { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; } h3.sec { margin: 1.5rem 0 0.6rem; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      .acts { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .btn { border: 0; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; font-weight: 700; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.4rem; color: #fff; }
      .btn.blue { background: #2563eb; } .btn.green { background: #10b981; color: #04130d; } .btn.red { background: #dc2626; }
      .btn.ghost { background: #131d2b; border: 1px solid #243245; color: #cdd8e6; }
      .btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .btn .b { background: rgba(0,0,0,0.3); border-radius: 999px; padding: 0 0.4rem; font-size: 0.72rem; }
      .bar { display: flex; gap: 0.6rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
      .search { position: relative; flex: 1; min-width: 240px; } .search i { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .search input { width: 100%; background: #131d2b; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.6rem 0.7rem 0.6rem 2rem; }
      :host ::ng-deep .dk .p-select { background: #131d2b; border-color: #243245; min-width: 220px; }
      .turno { display: flex; align-items: center; gap: 1rem; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 0.8rem 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .t-nav { background: #131d2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.82rem; }
      .t-nav:disabled { opacity: 0.4; cursor: not-allowed; }
      .t-info { text-align: center; } .t-info strong { display: block; text-transform: capitalize; }
      .t-act { background: #10b981; color: #04130d; font-size: 0.66rem; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: 999px; margin-left: 0.3rem; }
      .spacer { flex: 1; } .counts { color: #cdd8e6; font-size: 0.85rem; } .low-c { color: #fbbf24; }
      .name { display: flex; align-items: center; gap: 0.6rem; } .name .ico { background: #1a2333; padding: 0.35rem; border-radius: 7px; color: #8b97a8; }
      .init { color: #60a5fa; font-weight: 700; }
      .warn { color: #fbbf24; font-weight: 700; display: inline-flex; align-items: center; gap: 0.3rem; }
      .g { text-align: center; width: 3rem; } .gear { background: transparent; border: 0; color: #8b97a8; cursor: pointer; } .gear:hover { color: #fff; }
      .muted { color: #8b97a8; } .center { text-align: center; } .n { text-align: right; } .pos { color: #34d399; } .neg { color: #f87171; }
      .tbl { width: 100%; border-collapse: collapse; background: #131d2b; border: 1px solid #243245; border-radius: 10px; overflow: hidden; }
      .tbl th { text-align: left; padding: 0.6rem 0.8rem; background: #0e1622; color: #9fb0c3; font-size: 0.8rem; }
      .tbl td { padding: 0.6rem 0.8rem; border-top: 1px solid #1c2a3a; font-size: 0.9rem; }
      .tbl th.n, .tbl td.n { text-align: right; } .ck { width: 2.2rem; text-align: center; }
      .tbl tr.low td { background: rgba(245,158,11,0.08); }
      .queue { display: flex; flex-direction: column; gap: 0.4rem; }
      .job { display: flex; align-items: center; gap: 0.8rem; background: #131d2b; border: 1px solid #243245; border-radius: 8px; padding: 0.5rem 0.8rem; }
      .jt { flex: 1; }
      .form { display: flex; flex-direction: column; gap: 0.5rem; }
      .form label { font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      :host ::ng-deep .form input { width: 100%; }
      .qrow { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
      .req { border: 1px solid #243245; border-radius: 8px; padding: 0.7rem; margin-bottom: 0.6rem; }
      .req-head { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
      .req-items { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
      .chip { background: #1b2433; border: 1px solid #2a3850; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.78rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class InventarioRecepcionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly printing = inject(PrintingService);

  readonly items = signal<InvItem[]>([]);
  readonly requests = signal<Req[]>([]);
  readonly queue = signal<PrintJob[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  qty: Record<string, number> = {};
  woReason = '';
  reqVisible = false; woVisible = false; recVisible = false;

  search = '';
  categoryFilter: string | null = null;
  // Turno seleccionado (día + turno). El backend calcula el actual en la 1ª carga.
  readonly turn = signal<TurnInfo | null>(null);
  private fDay: string | null = null;
  private curShift: string | null = null;
  private readonly SHIFTS = ['MANANA', 'TARDE', 'NOCHE'];
  private readonly SHIFT_NAME: Record<string, string> = { MANANA: 'Turno Mañana', TARDE: 'Turno Tarde', NOCHE: 'Turno Noche' };

  readonly sentRequests = computed(() => this.requests().filter((r) => r.status === 'SENT'));
  readonly selectedItems = computed(() => this.items().filter((i) => this.selected().has(i.productId)));

  categoryOptions(): { label: string; value: string }[] {
    const map = new Map<string, string>();
    for (const it of this.items()) if (it.categoryId && it.categoryName) map.set(it.categoryId, it.categoryName);
    return [...map].map(([value, label]) => ({ label, value }));
  }

  filtered(): InvItem[] {
    const q = this.search.toLowerCase();
    return this.items().filter((it) => {
      if (q && !(it.name.toLowerCase().includes(q) || (it.sku ?? '').toLowerCase().includes(q))) return false;
      if (this.categoryFilter && it.categoryId !== this.categoryFilter) return false;
      return true;
    });
  }

  lowStockCount(): number { return this.filtered().filter((it) => it.belowMin).length; }
  stockInicial(it: InvItem): number { return it.stockInicial; }

  allSelected(): boolean { const f = this.filtered(); return f.length > 0 && f.every((it) => this.selected().has(it.productId)); }
  toggleAll(): void {
    if (this.allSelected()) this.selected.set(new Set());
    else { const s = new Set<string>(); for (const it of this.filtered()) { s.add(it.productId); this.qty[it.productId] = this.qty[it.productId] || 1; } this.selected.set(s); }
  }

  // Navegación turno por turno (usa la ventana real del backend por config de Horarios).
  turnoDate(): Date { return new Date((this.turn()?.businessDate ?? this.fDay ?? '') + 'T12:00:00'); }
  turnoLabel(): string {
    const t = this.turn();
    if (!t) return '';
    return `${this.SHIFT_NAME[t.shift] ?? t.shift} - ${t.startTime} - ${t.endTime}`;
  }
  shiftTurno(dir: number): void {
    const t = this.turn();
    if (!t) return;
    if (dir > 0 && t.isCurrent) return;
    let idx = this.SHIFTS.indexOf(t.shift) + dir;
    let day = new Date(t.businessDate + 'T12:00:00');
    if (idx > 2) { idx = 0; day.setDate(day.getDate() + 1); }
    if (idx < 0) { idx = 2; day.setDate(day.getDate() - 1); }
    this.fDay = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    this.curShift = this.SHIFTS[idx];
    this.reload();
  }

  report(verified: boolean): void {
    const rows = this.filtered().map((it) =>
      `<tr><td>${it.sku ?? ''}</td><td>${it.name}</td><td class="num">${this.stockInicial(it)}</td><td class="num">${it.ingresos}</td><td class="num">${it.salidas}</td><td class="num">${it.stock}/${it.min}</td></tr>`,
    ).join('');
    const body = `<div class="meta">${this.turnoLabel()} · ${verified ? 'VERIFICADO' : 'Previsualización'}</div>
      <table><thead><tr><th>Código</th><th>Artículo</th><th class="num">Inicial</th><th class="num">Ingresos</th><th class="num">Salidas</th><th class="num">Act./Mín</th></tr></thead><tbody>${rows}</tbody></table>`;
    printPdf('Inventario de Recepción · RIZZOS', body);
  }

  openRowMenu(it: InvItem): void {
    this.selected.set(new Set([it.productId]));
    this.qty[it.productId] = this.qty[it.productId] || 1;
    this.toast.add({ severity: 'info', summary: it.name, detail: 'Seleccionado. Usa Solicitar o Dar de Baja arriba.' });
  }

  ngOnInit(): void { this.reload(); }

  reload(): void {
    const params: Record<string, string> = {};
    if (this.fDay && this.curShift) { params['date'] = this.fDay; params['shift'] = this.curShift; }
    this.http.get<ApiResponse<{ items: InvItem[]; turn: TurnInfo }>>(`${this.api}/reception-inventory`, { params }).subscribe((r) => {
      this.items.set(r.data?.items ?? []);
      if (r.data?.turn) { this.turn.set(r.data.turn); this.fDay = r.data.turn.businessDate; this.curShift = r.data.turn.shift; }
    });
    this.http.get<ApiResponse<Req[]>>(`${this.api}/reception-inventory/requests`).subscribe((r) => this.requests.set(r.data ?? []));
    this.http.get<ApiResponse<PrintJob[]>>(`${this.api}/reception-inventory/print-queue`).subscribe((r) => this.queue.set(r.data ?? []));
  }

  toggle(id: string): void {
    const s = new Set(this.selected());
    if (s.has(id)) s.delete(id); else { s.add(id); this.qty[id] = this.qty[id] || 1; }
    this.selected.set(s);
  }

  openRequest(): void { for (const it of this.selectedItems()) this.qty[it.productId] = this.qty[it.productId] || 1; this.reqVisible = true; }
  openWriteOff(): void { for (const it of this.selectedItems()) this.qty[it.productId] = this.qty[it.productId] || 1; this.woReason = ''; this.woVisible = true; }

  sendRequest(): void {
    this.busy.set(true);
    const items = this.selectedItems().map((it) => ({ productId: it.productId, quantity: this.qty[it.productId] || 1 }));
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/requests`, { items }).subscribe({
      next: () => { this.busy.set(false); this.reqVisible = false; this.selected.set(new Set()); this.toast.add({ severity: 'success', summary: 'Solicitud enviada', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  doWriteOff(): void {
    this.busy.set(true);
    const items = this.selectedItems();
    let done = 0; let failed = 0;
    const next = (i: number) => {
      if (i >= items.length) {
        this.busy.set(false); this.woVisible = false; this.selected.set(new Set());
        this.toast.add({ severity: failed ? 'warn' : 'success', summary: 'Bajas', detail: `${done} dadas de baja${failed ? `, ${failed} con error` : ''}` });
        this.reload(); return;
      }
      const it = items[i];
      this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/write-off`, { productId: it.productId, quantity: this.qty[it.productId] || 1, reason: this.woReason }).subscribe({
        next: () => { done++; next(i + 1); }, error: () => { failed++; next(i + 1); },
      });
    };
    next(0);
  }

  /** Construye el comprobante e intenta imprimir por QZ; si no está, abre la vista previa del navegador. */
  async print(j: PrintJob): Promise<void> {
    const html = this.buildReceipt(j);
    try {
      await this.printing.printHtml(html); // QZ Tray (impresión directa)
      this.toast.add({ severity: 'success', summary: 'Impresión', detail: 'Enviado a QZ Tray.' });
    } catch {
      // QZ no disponible → vista previa del navegador (el usuario elige impresora).
      this.printing.printViaBrowser(html);
    }
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/print-queue/${j.id}/printed`, {}).subscribe({
      next: () => this.reload(),
      error: () => undefined,
    });
  }

  private buildReceipt(j: PrintJob): string {
    let rows = '';
    try {
      const items = JSON.parse(j.payload ?? '[]') as { name?: string; productId?: string; quantity: number }[];
      rows = items
        .map((i) => `<tr><td>${i.name ?? i.productId ?? 'Ítem'}</td><td style="text-align:right">${i.quantity}</td></tr>`)
        .join('');
    } catch {
      rows = '';
    }
    const now = new Date().toLocaleString('es-PE');
    return `
      <div style="font-family: 'Courier New', monospace; width: 280px; color: #000;">
        <h3 style="text-align:center; margin:0 0 4px;">RIZZOS</h3>
        <div style="text-align:center; font-size:12px; margin-bottom:8px;">${j.title}</div>
        <div style="font-size:11px;">Fecha: ${now}</div>
        <hr />
        <table style="width:100%; font-size:12px; border-collapse:collapse;">
          <thead><tr><th style="text-align:left">Producto</th><th style="text-align:right">Cant.</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="2">Sin detalle</td></tr>'}</tbody>
        </table>
        <hr />
        <div style="text-align:center; font-size:11px;">Comprobante interno de recepción</div>
      </div>`;
  }

  receive(id: string): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/requests/${id}/receive`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Recepcionado', detail: 'Stock actualizado.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
