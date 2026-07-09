import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { printPdf } from '../../../core/utils/export';

interface Row { linenItemId: string; type: string; name: string; color?: string | null; rem: number; sum: number; }
interface Floor { floor: string; rows: Row[]; }
interface Supply { id: string; roomId: string; room: string; floor?: string | null; roomType?: string; description: string; category?: string; quantity: number; status: string; createdAt: string; }
interface SupplyGroup { roomId: string; room: string; floor?: string | null; roomType?: string; items: Supply[]; }

// Colores conocidos por tipo (los ítems de ropa llevan como `type` el NOMBRE de su
// categoría, que varía por sucursal). Se normaliza a mayúsculas para el match.
const TYPE_COLORS: Record<string, string> = {
  TOALLA: '#f97316', TOALLAS: '#f97316',
  SABANA: '#d946ef', SABANAS: '#d946ef', 'SÁBANAS': '#d946ef', SABANAS_: '#d946ef',
  EDREDON: '#eab308', EDREDONES: '#eab308',
  FUNDA: '#22d3ee', FUNDAS: '#22d3ee', COBERTOR: '#a78bfa', COBERTORES: '#a78bfa',
};
const TYPE_PALETTE = ['#f97316', '#d946ef', '#eab308', '#22d3ee', '#a78bfa', '#34d399', '#fb7185', '#60a5fa'];

@Component({
  selector: 'app-inventario-limpieza-rizzos',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule],
  template: `
    <section class="il">
      <header class="top">
        <div>
          <h1>Inventario Limpieza</h1>
          <p class="sub">Usuario: {{ userName() }}</p>
        </div>
        <div class="top-actions">
          <div class="seg">
            <button [class.on]="mode() === 'real'" (click)="mode.set('real')">Tiempo Real</button>
            <button [class.on]="mode() === 'turno'" (click)="mode.set('turno')">Por Turnos</button>
          </div>
          <button class="icon" (click)="print()" title="Imprimir"><i class="pi pi-print"></i></button>
        </div>
      </header>

      <h3>Inventario de Ropa por Pisos</h3>
      <div class="floors">
        @for (f of floors(); track f.floor) {
          <div class="floor">
            <div class="fh">{{ f.floor }}</div>
            <div class="matrix" [style.grid-template-columns]="gridCols()">
              <!-- Cabecera de tipos -->
              <div class="corner"></div>
              @for (c of cols(); track c.type) {
                <div class="thead" [style.background]="c.color">{{ c.label }}</div>
              }
              <!-- Fila REM -->
              <div class="rowlabel rem">REM</div>
              @for (c of cols(); track c.type) {
                <div class="cell">
                  @for (r of byType(f, c.type); track r.linenItemId) {
                    @if (r.rem > 0) {
                      <label class="chip">
                        <input type="checkbox" [checked]="isSel(f.floor, r.linenItemId)" (change)="toggle(f.floor, r.linenItemId)" />
                        <span class="dot" [style.background]="r.color || '#888'"></span>{{ r.rem }} {{ r.name }}
                      </label>
                    }
                  }
                </div>
              }
              <!-- Fila SUM -->
              <div class="rowlabel sum">SUM</div>
              @for (c of cols(); track c.type) {
                <div class="cell">
                  @for (r of byType(f, c.type); track r.linenItemId) {
                    @if (r.sum > 0) { <span class="chip ro"><span class="dot" [style.background]="r.color || '#888'"></span>{{ r.sum }} {{ r.name }}</span> }
                  }
                </div>
              }
            </div>
            <div class="fbtns">
              <button class="solicitar" [disabled]="floorSelected(f.floor).length === 0" (click)="openRequest(f.floor)">
                <i class="pi pi-send"></i> Solicitar ropa ({{ floorSelected(f.floor).length }})
              </button>
              <button class="manch" [disabled]="floorSelected(f.floor).length === 0" (click)="openLaundry(f.floor)">
                <i class="pi pi-exclamation-triangle"></i> Manchada / Deteriorada
              </button>
            </div>
          </div>
        } @empty { <p class="muted">Sin inventario de ropa configurado.</p> }
      </div>

      <h3>Amenities y Productos por Áreas</h3>
      <div class="amen-grid">
        <div class="amen-card">
          <div class="amen-h">{{ amenWh() || 'ALMACEN AMENITIES' }}<small>{{ amenities().length }} items</small></div>
          <div class="amen-sum">SUMINISTRADO</div>
          <div class="amen-list">
            @for (a of amenities(); track a.productId) {
              <div class="amen-row"><span class="an">{{ a.name }}</span><span class="aq">{{ a.quantity }}</span></div>
            } @empty { <p class="muted amen-empty">Sin amenities cargados en el almacén.</p> }
          </div>
        </div>
      </div>

      <h3>Suministros pendientes de entrega</h3>
      <div class="sup-grid">
        @for (g of groups(); track g.roomId) {
          <article class="sup-card">
            <span class="sp-badge"><i class="pi pi-box"></i> Suministro Pendiente</span>
            <div class="sp-num">Hab. {{ g.room }}</div>
            <div class="sp-ty">{{ g.roomType }}</div>
            <div class="sp-flo">Piso {{ g.floor || '-' }}</div>
            <button class="suministrar" (click)="openDeliver(g)"><i class="pi pi-box"></i> Suministrar Habitación</button>
          </article>
        } @empty { <p class="muted">No hay suministros pendientes.</p> }
      </div>
    </section>

    <!-- Confirmar entrega de suministro -->
    <p-dialog [(visible)]="delVisible" [modal]="true" [style]="{ width: '40rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <ng-template pTemplate="header"><div class="del-head"><i class="pi pi-box"></i> Confirmar Entrega - Habitación {{ delGroup?.room }}</div></ng-template>
      <div class="instr"><strong>Instrucciones:</strong> Los siguientes items fueron solicitados desde recepción. Por favor, confirma que los has entregado a la habitación.</div>
      <h4 class="del-h">Items a entregar:</h4>
      @for (it of delGroup?.items || []; track it.id) {
        <div class="del-item">
          <i class="pi pi-check-circle"></i>
          <div><strong>{{ it.description }}</strong><div class="muted">Cantidad: <b>{{ it.quantity }}</b> unidad</div><div class="muted">Categoría: {{ it.category }}</div></div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Rechazar Entrega" icon="pi pi-times-circle" severity="danger" [loading]="busy()" (onClick)="confirmReject()" />
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="delVisible = false" />
        <p-button label="Confirmar Entrega" icon="pi pi-check-circle" severity="success" [loading]="busy()" (onClick)="confirmDeliver()" />
      </ng-template>
    </p-dialog>

    <!-- Solicitar ropa -->
    <p-dialog [(visible)]="reqVisible" [modal]="true" [header]="'Solicitar ropa · ' + reqFloor" [style]="{ width: '30rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (s of floorSelected(reqFloor); track s.linenItemId) {
          <div class="qrow"><span>{{ s.name }}</span><p-inputNumber [(ngModel)]="qty[reqFloor + '|' + s.linenItemId]" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
        <p class="hint"><i class="pi pi-whatsapp"></i> Se enviará un aviso al administrador para que provea la ropa.</p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="reqVisible = false" />
        <p-button label="Enviar solicitud" icon="pi pi-send" [loading]="busy()" (onClick)="sendRequest()" />
      </ng-template>
    </p-dialog>

    <!-- Lavandería / Manchada -->
    <p-dialog [(visible)]="lndVisible" [modal]="true" [header]="'Manchada / Deteriorada · Piso ' + reqFloor" [style]="{ width: '28rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (s of floorSelected(reqFloor); track s.linenItemId) {
          <div class="qrow"><span>{{ s.name }} (REM {{ s.rem }})</span><p-inputNumber [(ngModel)]="lndQty[s.linenItemId]" [min]="1" [max]="s.rem" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
        <label>Motivo</label>
        <input pInputText [(ngModel)]="lndReason" placeholder="Manchada / Deteriorada" />
        <p class="hint"><i class="pi pi-info-circle"></i> Disminuye el remanente y la envía a lavandería.</p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="lndVisible = false" />
        <p-button label="Enviar a lavandería" icon="pi pi-check" [loading]="busy()" (onClick)="sendLaundry()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .il { background: #0b1410; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6efe9; }
      h1 { margin: 0; color: #fff; } h3 { margin: 1.4rem 0 0.7rem; color: #34d399; }
      .sub { margin: 0.1rem 0 0; color: #8aa499; font-size: 0.82rem; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .top-actions { display: flex; align-items: center; gap: 0.6rem; }
      .seg { display: inline-flex; background: #0e241c; border: 1px solid #1f3a2c; border-radius: 9px; padding: 3px; }
      .seg button { background: transparent; border: 0; color: #9fb0c3; padding: 0.4rem 0.8rem; border-radius: 7px; cursor: pointer; font-size: 0.8rem; }
      .seg button.on { background: #7c3aed; color: #fff; }
      .icon { background: #0e241c; border: 1px solid #1f3a2c; color: #b9f0d6; border-radius: 8px; padding: 0.45rem 0.6rem; cursor: pointer; }
      .muted { color: #8aa499; }

      .floors { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px,1fr)); gap: 1rem; }
      .floor { background: #0e1f29; border: 1px solid #1c3340; border-radius: 14px; overflow: hidden; }
      .fh { background: #122633; text-align: center; font-weight: 800; padding: 0.6rem; color: #fff; letter-spacing: 0.06em; }
      .matrix { display: grid; grid-template-columns: 3rem 1fr 1fr 1fr; gap: 1px; background: #1c3340; padding: 1px; }
      .corner { background: #0e1f29; }
      .thead { color: #1a0b00; font-weight: 800; font-size: 0.68rem; text-align: center; padding: 0.4rem 0.2rem; letter-spacing: 0.03em; }
      .rowlabel { display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.78rem; color: #fff; }
      .rowlabel.rem { background: #b91c1c; } .rowlabel.sum { background: #1d4ed8; }
      .cell { background: #0b1923; padding: 0.4rem; display: flex; flex-direction: column; gap: 0.3rem; min-height: 2.4rem; }
      .chip { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.78rem; color: #dbe7f0; cursor: pointer; }
      .chip.ro { cursor: default; opacity: 0.92; }
      .dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); }
      .fbtns { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.7rem; }
      .solicitar, .manch { border: 0; border-radius: 9px; padding: 0.6rem; font-weight: 700; cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; color: #fff; }
      .solicitar { background: #2563eb; } .manch { background: #b91c1c; }
      .solicitar:disabled, .manch:disabled { opacity: 0.45; cursor: not-allowed; }

      .amen-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; margin-bottom: 0.5rem; }
      .amen-card { background: #0c1f1a; border: 1px solid #14603f; border-radius: 14px; overflow: hidden; }
      .amen-h { background: #0f2a22; color: #6ee7b7; font-weight: 800; text-align: center; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.15rem; } .amen-h small { color: #8aa89b; font-weight: 500; font-size: 0.72rem; }
      .amen-sum { background: #10b981; color: #04130d; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.04em; padding: 0.25rem 0.7rem; }
      .amen-list { padding: 0.3rem 0; }
      .amen-row { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.9rem; border-bottom: 1px solid #10241d; font-size: 0.85rem; } .amen-row:last-child { border-bottom: 0; }
      .amen-row .aq { color: #34d399; font-weight: 800; } .amen-empty { padding: 0.9rem; }
      .sup-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
      .sup-card { background: #11202c; border: 1px solid #1c3340; border-radius: 16px; padding: 1.1rem; text-align: center; display: flex; flex-direction: column; gap: 0.3rem; }
      .sp-badge { align-self: center; background: #ea7a0b; color: #fff; font-weight: 800; font-size: 0.72rem; border-radius: 999px; padding: 0.25rem 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; margin-bottom: 0.4rem; }
      .sp-num { font-size: 1.8rem; font-weight: 800; color: #fff; }
      .sp-ty { font-weight: 700; color: #dbe7f0; letter-spacing: 0.03em; }
      .sp-flo { color: #8aa499; font-size: 0.85rem; }
      .suministrar { margin-top: 0.9rem; background: #10b981; color: #06281c; border: 0; border-radius: 12px; padding: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; }
      .suministrar:hover { background: #34d399; }
      .del-head { display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; font-weight: 800; color: #fff; } .del-head .pi { color: #ea7a0b; }
      .instr { background: rgba(37,99,235,0.1); border: 1px solid rgba(37,99,235,0.4); border-radius: 10px; padding: 0.8rem 1rem; color: #cdd8e6; font-size: 0.88rem; margin-bottom: 0.8rem; } .instr strong { color: #93c5fd; }
      .del-h { margin: 0 0 0.5rem; color: #cdd8e6; font-size: 0.9rem; }
      .del-item { display: flex; gap: 0.7rem; background: #0e241c; border: 1px solid #1f3a2c; border-radius: 12px; padding: 0.9rem 1rem; margin-bottom: 0.5rem; }
      .del-item .pi { color: #34d399; font-size: 1.2rem; } .del-item strong { font-size: 1rem; }
      .form { display: flex; flex-direction: column; gap: 0.5rem; }
      .form label { font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      :host ::ng-deep .form input { width: 100%; }
      .qrow { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
      .hint { color: #9fe7c4; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1a14; color: #e6efe9; }
    `,
  ],
})
export class InventarioLimpiezaRizzosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly floors = signal<Floor[]>([]);
  /** Columnas de tipo derivadas de la data real (nombres de categoría de ropa por sucursal). */
  readonly cols = computed<{ type: string; label: string; color: string }[]>(() => {
    const types: string[] = [];
    for (const f of this.floors()) for (const r of f.rows) if (r.type && !types.includes(r.type)) types.push(r.type);
    types.sort((a, b) => a.localeCompare(b, 'es'));
    return types.map((t, i) => ({ type: t, label: t.toUpperCase(), color: TYPE_COLORS[t.toUpperCase()] ?? TYPE_PALETTE[i % TYPE_PALETTE.length] }));
  });
  gridCols(): string { return `3rem ${'1fr '.repeat(Math.max(1, this.cols().length)).trim()}`; }
  readonly amenities = signal<{ productId: string; name: string; code: string | null; quantity: number }[]>([]);
  readonly amenWh = signal<string | null>(null);
  readonly supplies = signal<Supply[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  readonly mode = signal<'real' | 'turno'>('real');
  qty: Record<string, number> = {};
  lndQty: Record<string, number> = {};
  lndReason = '';
  reqVisible = false;
  lndVisible = false;
  reqFloor = '';
  delVisible = false;
  delGroup: SupplyGroup | null = null;

  /** Agrupa los suministros pendientes por habitación (una tarjeta por habitación). */
  readonly groups = computed<SupplyGroup[]>(() => {
    const map = new Map<string, SupplyGroup>();
    for (const s of this.supplies()) {
      let g = map.get(s.roomId);
      if (!g) { g = { roomId: s.roomId, room: s.room, floor: s.floor, roomType: s.roomType, items: [] }; map.set(s.roomId, g); }
      g.items.push(s);
    }
    return [...map.values()];
  });

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<{ floors: Floor[] }>>(`${this.api}/cleaning/linen-inventory`).subscribe((r) => this.floors.set(r.data?.floors ?? []));
    this.http.get<ApiResponse<{ warehouse: string | null; items: { productId: string; name: string; code: string | null; quantity: number }[] }>>(`${this.api}/cleaning/amenities-inventory`)
      .subscribe((r) => { this.amenWh.set(r.data?.warehouse ?? null); this.amenities.set(r.data?.items ?? []); });
    this.http.get<ApiResponse<Supply[]>>(`${this.api}/services/supplies?status=PENDING`).subscribe((r) => this.supplies.set(r.data ?? []));
  }

  userName(): string {
    return this.auth.user()?.email?.split('@')[0] ?? 'Limpieza';
  }

  byType(f: Floor, type: string): Row[] {
    return f.rows.filter((r) => r.type === type);
  }

  private k(floor: string, id: string): string { return floor + '|' + id; }
  isSel(floor: string, id: string): boolean { return this.selected().has(this.k(floor, id)); }
  toggle(floor: string, id: string): void {
    const s = new Set(this.selected());
    const key = this.k(floor, id);
    if (s.has(key)) s.delete(key);
    else { s.add(key); this.qty[key] = this.qty[key] || 1; }
    this.selected.set(s);
  }

  floorSelected(floor: string): Row[] {
    const f = this.floors().find((x) => x.floor === floor);
    if (!f) return [];
    return f.rows.filter((r) => this.selected().has(this.k(floor, r.linenItemId)));
  }

  openRequest(floor: string): void {
    this.reqFloor = floor;
    for (const s of this.floorSelected(floor)) this.qty[this.k(floor, s.linenItemId)] = this.qty[this.k(floor, s.linenItemId)] || 1;
    this.reqVisible = true;
  }

  sendRequest(): void {
    this.busy.set(true);
    const items = this.floorSelected(this.reqFloor).map((s) => ({ linenItemId: s.linenItemId, floor: this.reqFloor, quantity: this.qty[this.k(this.reqFloor, s.linenItemId)] || 1 }));
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/linen/request`, { items }).subscribe({
      next: () => { this.busy.set(false); this.reqVisible = false; this.clearFloor(this.reqFloor); this.toast.add({ severity: 'success', summary: 'Solicitud enviada', detail: 'Se avisó al administrador.' }); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  openLaundry(floor: string): void {
    this.reqFloor = floor;
    for (const s of this.floorSelected(floor)) this.lndQty[s.linenItemId] = Math.min(this.lndQty[s.linenItemId] || 1, s.rem);
    this.lndReason = '';
    this.lndVisible = true;
  }

  sendLaundry(): void {
    const items = this.floorSelected(this.reqFloor);
    if (!items.length) return;
    this.busy.set(true);
    // Envía cada prenda seleccionada de forma secuencial.
    const send = (i: number): void => {
      if (i >= items.length) {
        this.busy.set(false);
        this.lndVisible = false;
        this.clearFloor(this.reqFloor);
        this.toast.add({ severity: 'success', summary: 'Enviado a lavandería', detail: '' });
        this.reload();
        return;
      }
      const s = items[i];
      this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/linen/laundry`, { linenItemId: s.linenItemId, floor: this.reqFloor, quantity: this.lndQty[s.linenItemId] || 1, reason: this.lndReason }).subscribe({
        next: () => send(i + 1),
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
      });
    };
    send(0);
  }

  private clearFloor(floor: string): void {
    const s = new Set(this.selected());
    for (const key of [...s]) if (key.startsWith(floor + '|')) s.delete(key);
    this.selected.set(s);
  }

  openDeliver(g: SupplyGroup): void {
    this.delGroup = g;
    this.delVisible = true;
  }

  /** Confirma la entrega de TODOS los items de la habitación (descuenta inventario). */
  confirmDeliver(): void {
    const g = this.delGroup;
    if (!g) return;
    this.busy.set(true);
    forkJoin(g.items.map((it) => this.http.post<ApiResponse<unknown>>(`${this.api}/services/supplies/${it.id}/deliver`, {}))).subscribe({
      next: () => { this.busy.set(false); this.delVisible = false; this.toast.add({ severity: 'success', summary: 'Entregado', detail: `Hab. ${g.room}: suministro entregado y descontado del inventario.` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  confirmReject(): void {
    const g = this.delGroup;
    if (!g) return;
    this.busy.set(true);
    forkJoin(g.items.map((it) => this.http.post<ApiResponse<unknown>>(`${this.api}/services/supplies/${it.id}/reject`, {}))).subscribe({
      next: () => { this.busy.set(false); this.delVisible = false; this.toast.add({ severity: 'warn', summary: 'Rechazado', detail: `Hab. ${g.room}: entrega rechazada.` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  print(): void {
    const cols = this.cols();
    const body = this.floors()
      .map((f) => {
        const cell = (type: string, key: 'rem' | 'sum'): string =>
          this.byType(f, type).filter((r) => r[key] > 0).map((r) => `${r[key]} ${r.name}`).join('<br>') || '—';
        return `<h2>Piso ${f.floor}</h2><table><thead><tr><th></th>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><td><b>REM</b></td>${cols.map((c) => `<td>${cell(c.type, 'rem')}</td>`).join('')}</tr>
            <tr><td><b>SUM</b></td>${cols.map((c) => `<td>${cell(c.type, 'sum')}</td>`).join('')}</tr>
          </tbody></table>`;
      })
      .join('');
    printPdf('Inventario de Limpieza · RIZZOS', body);
  }
}
