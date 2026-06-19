import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { printPdf } from '../../../core/utils/export';

interface Row { linenItemId: string; type: string; name: string; color?: string | null; rem: number; sum: number; }
interface Floor { floor: string; rows: Row[]; }
interface Supply { id: string; room: string; description: string; quantity: number; status: string; createdAt: string; }

const TYPE_COLS: { type: string; label: string; color: string }[] = [
  { type: 'TOALLA', label: 'TOALLAS', color: '#f97316' },
  { type: 'SABANA', label: 'SÁBANAS', color: '#d946ef' },
  { type: 'EDREDON', label: 'EDREDONES', color: '#eab308' },
];

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
            <div class="fh">PISO {{ f.floor }}</div>
            <div class="matrix">
              <!-- Cabecera de tipos -->
              <div class="corner"></div>
              @for (c of cols; track c.type) {
                <div class="thead" [style.background]="c.color">{{ c.label }}</div>
              }
              <!-- Fila REM -->
              <div class="rowlabel rem">REM</div>
              @for (c of cols; track c.type) {
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
              @for (c of cols; track c.type) {
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

      <h3>Suministros pendientes de entrega</h3>
      <div class="supplies">
        @for (s of supplies(); track s.id) {
          <div class="sup">
            <div><strong>Hab. {{ s.room }}</strong> · {{ s.description }} x{{ s.quantity }}</div>
            <span class="muted">{{ s.createdAt | date: 'dd/MM HH:mm' }}</span>
            <p-button label="Confirmar Entrega" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="deliver(s)" />
          </div>
        } @empty { <p class="muted">No hay suministros pendientes.</p> }
      </div>
    </section>

    <!-- Solicitar ropa -->
    <p-dialog [(visible)]="reqVisible" [modal]="true" [header]="'Solicitar ropa · Piso ' + reqFloor" [style]="{ width: '30rem' }" styleClass="dk-dialog">
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

      .supplies { display: flex; flex-direction: column; gap: 0.5rem; }
      .sup { display: flex; align-items: center; gap: 1rem; background: #0e241c; border: 1px solid #1f3a2c; border-radius: 10px; padding: 0.6rem 0.9rem; flex-wrap: wrap; }
      .sup > div:first-child { flex: 1; }
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

  readonly cols = TYPE_COLS;
  readonly floors = signal<Floor[]>([]);
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

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<{ floors: Floor[] }>>(`${this.api}/cleaning/linen-inventory`).subscribe((r) => this.floors.set(r.data?.floors ?? []));
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

  deliver(s: Supply): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/services/supplies/${s.id}/deliver`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Entregado', detail: `Hab. ${s.room}` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  print(): void {
    const cols = this.cols;
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
