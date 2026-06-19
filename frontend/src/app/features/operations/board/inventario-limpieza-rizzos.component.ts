import { Component, OnInit, inject, signal } from '@angular/core';
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

interface Row { linenItemId: string; type: string; name: string; color?: string | null; rem: number; sum: number; }
interface Floor { floor: string; rows: Row[]; }
interface Supply { id: string; room: string; description: string; quantity: number; status: string; createdAt: string; }
interface SelKey { floor: string; linenItemId: string; }

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sábana', EDREDON: 'Edredón', AMENITY: 'Amenity' };

@Component({
  selector: 'app-inventario-limpieza-rizzos',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule],
  template: `
    <section class="il">
      <header class="top">
        <h1>Inventario de Limpieza</h1>
        <p-button label="Solicitar ropa seleccionada" icon="pi pi-send" [disabled]="selected().size === 0" (onClick)="openRequest()" />
      </header>

      <h3>Inventario de Ropa por Pisos</h3>
      <div class="floors">
        @for (f of floors(); track f.floor) {
          <div class="floor">
            <div class="fh">PISO {{ f.floor }}</div>
            <table>
              <thead><tr><th class="ck"></th><th>Ropa</th><th class="rem">REM</th><th class="sum">SUM</th><th></th></tr></thead>
              <tbody>
                @for (r of f.rows; track r.linenItemId) {
                  <tr>
                    <td class="ck"><input type="checkbox" [checked]="isSel(f.floor, r.linenItemId)" (change)="toggle(f.floor, r.linenItemId)" /></td>
                    <td><span class="dot" [style.background]="r.color || '#888'"></span> {{ typeLabel(r.type) }} {{ r.name }}</td>
                    <td class="rem">{{ r.rem }}</td><td class="sum">{{ r.sum }}</td>
                    <td><button class="manch" [disabled]="r.rem <= 0" (click)="openLaundry(f.floor, r)">Manchada</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @empty { <p class="muted">Sin inventario de ropa configurado.</p> }
      </div>

      <h3>Suministros pendientes de entrega</h3>
      <div class="supplies">
        @for (s of supplies(); track s.id) {
          <div class="sup">
            <div><strong>Hab. {{ s.room }}</strong> · {{ s.description }} x{{ s.quantity }}</div>
            <span class="muted">{{ s.createdAt | date: 'dd/MM HH:mm' }}</span>
            <p-button label="Suministrar / Confirmar Entrega" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="deliver(s)" />
          </div>
        } @empty { <p class="muted">No hay suministros pendientes.</p> }
      </div>
    </section>

    <!-- Solicitar ropa -->
    <p-dialog [(visible)]="reqVisible" [modal]="true" header="Solicitar ropa al almacén" [style]="{ width: '30rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (s of selectedList(); track s.linenItemId + s.floor) {
          <div class="qrow"><span>Piso {{ s.floor }} · {{ typeLabel(s.type) }} {{ s.name }}</span><p-inputNumber [(ngModel)]="qty[s.floor + '|' + s.linenItemId]" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
        <p class="hint"><i class="pi pi-whatsapp"></i> Se enviará un aviso al administrador para que provea la ropa.</p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="reqVisible = false" />
        <p-button label="Enviar solicitud" icon="pi pi-send" [loading]="busy()" (onClick)="sendRequest()" />
      </ng-template>
    </p-dialog>

    <!-- Lavandería -->
    <p-dialog [(visible)]="lndVisible" [modal]="true" header="Enviar a lavandería" [style]="{ width: '26rem' }" styleClass="dk-dialog">
      <div class="form">
        <div class="qrow"><span>{{ lnd.label }}</span><p-inputNumber [(ngModel)]="lnd.quantity" [min]="1" [max]="lnd.max" [showButtons]="true" buttonLayout="horizontal" /></div>
        <label>Motivo</label>
        <input pInputText [(ngModel)]="lnd.reason" placeholder="Manchada / Deteriorada" />
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
      .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .muted { color: #8aa499; }
      .floors { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px,1fr)); gap: 1rem; }
      .floor { background: #0e241c; border: 1px solid #1f3a2c; border-radius: 12px; overflow: hidden; }
      .fh { background: #12231b; text-align: center; font-weight: 800; padding: 0.6rem; color: #fff; letter-spacing: 0.05em; }
      .floor table { width: 100%; border-collapse: collapse; }
      .floor th { text-align: left; padding: 0.45rem 0.6rem; font-size: 0.72rem; color: #8aa499; }
      .floor td { padding: 0.45rem 0.6rem; border-top: 1px solid #14271f; font-size: 0.85rem; }
      .rem { color: #f87171; text-align: center; font-weight: 700; } .sum { color: #34d399; text-align: center; font-weight: 700; }
      th.rem, th.sum { text-align: center; } .ck { width: 2rem; text-align: center; }
      .dot { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 50%; margin-right: 0.35rem; vertical-align: middle; border: 1px solid rgba(255,255,255,0.3); }
      .manch { background: transparent; border: 1px solid #b91c1c; color: #fca5a5; border-radius: 7px; padding: 0.25rem 0.55rem; cursor: pointer; font-size: 0.72rem; }
      .manch:disabled { opacity: 0.4; }
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

  readonly floors = signal<Floor[]>([]);
  readonly supplies = signal<Supply[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  qty: Record<string, number> = {};
  reqVisible = false; lndVisible = false;
  lnd: { floor: string; linenItemId: string; label: string; quantity: number; max: number; reason: string } = { floor: '', linenItemId: '', label: '', quantity: 1, max: 1, reason: '' };

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<{ floors: Floor[] }>>(`${this.api}/cleaning/linen-inventory`).subscribe((r) => this.floors.set(r.data?.floors ?? []));
    this.http.get<ApiResponse<Supply[]>>(`${this.api}/services/supplies?status=PENDING`).subscribe((r) => this.supplies.set(r.data ?? []));
  }
  typeLabel(t: string): string { return TYPE_LABEL[t] ?? t; }
  private k(floor: string, id: string): string { return floor + '|' + id; }
  isSel(floor: string, id: string): boolean { return this.selected().has(this.k(floor, id)); }
  toggle(floor: string, id: string): void {
    const s = new Set(this.selected()); const key = this.k(floor, id);
    if (s.has(key)) s.delete(key); else { s.add(key); this.qty[key] = this.qty[key] || 1; }
    this.selected.set(s);
  }
  selectedList(): { floor: string; linenItemId: string; type: string; name: string }[] {
    const out: { floor: string; linenItemId: string; type: string; name: string }[] = [];
    for (const f of this.floors()) for (const r of f.rows) if (this.selected().has(this.k(f.floor, r.linenItemId))) out.push({ floor: f.floor, linenItemId: r.linenItemId, type: r.type, name: r.name });
    return out;
  }

  openRequest(): void { for (const s of this.selectedList()) this.qty[this.k(s.floor, s.linenItemId)] = this.qty[this.k(s.floor, s.linenItemId)] || 1; this.reqVisible = true; }
  sendRequest(): void {
    this.busy.set(true);
    const items = this.selectedList().map((s) => ({ linenItemId: s.linenItemId, floor: s.floor, quantity: this.qty[this.k(s.floor, s.linenItemId)] || 1 }));
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/linen/request`, { items }).subscribe({
      next: () => { this.busy.set(false); this.reqVisible = false; this.selected.set(new Set()); this.toast.add({ severity: 'success', summary: 'Solicitud enviada', detail: 'Se avisó al administrador.' }); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  openLaundry(floor: string, r: Row): void {
    this.lnd = { floor, linenItemId: r.linenItemId, label: `${this.typeLabel(r.type)} ${r.name} (REM ${r.rem})`, quantity: 1, max: r.rem, reason: '' };
    this.lndVisible = true;
  }
  sendLaundry(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/linen/laundry`, { linenItemId: this.lnd.linenItemId, floor: this.lnd.floor, quantity: this.lnd.quantity, reason: this.lnd.reason }).subscribe({
      next: () => { this.busy.set(false); this.lndVisible = false; this.toast.add({ severity: 'success', summary: 'Enviado a lavandería', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  deliver(s: Supply): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/services/supplies/${s.id}/deliver`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Entregado', detail: `Hab. ${s.room}` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
