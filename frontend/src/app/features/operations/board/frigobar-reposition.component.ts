import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';

interface RepoLine { productId: string; name: string; imageUrl?: string | null; pendingQty: number; availRecepcion: number; availLimpieza: number; qty: number; }
interface RepoStart { reviewId: string; room: { number: string }; warehouses: { recepcion: { id: string; name: string } | null; limpieza: { id: string; name: string } | null }; lines: RepoLine[]; }
type Origin = 'RECEPCION' | 'LIMPIEZA';

/**
 * Modal de REPOSICIÓN de frigobar (parcial, por falta de stock). Repone desde Recepción o
 * Limpieza lo que haya disponible; lo faltante queda pendiente y la habitación NO se bloquea.
 * El descuento del almacén origen se registra como AJUSTE «Transferencia interna» (no es venta).
 * Se exige imprimir el ticket antes de habilitar «Finalizar reposición».
 */
@Component({
  selector: 'app-frigobar-reposition',
  standalone: true,
  imports: [DialogModule, ButtonModule, DatePipe],
  template: `
    <p-dialog [visible]="visible" (visibleChange)="onVis($event)" [modal]="true" [style]="{ width: '34rem', maxWidth: '96vw' }" styleClass="fr-dialog" [dismissableMask]="false">
      <ng-template pTemplate="header"><div class="fr-head"><i class="pi pi-box"></i> <div><b>Reposición de frigobar</b><small>Hab. {{ roomNumber || (data()?.room?.number ?? '') }}{{ contextLabel ? ' · ' + contextLabel : '' }}</small></div></div></ng-template>

      @if (view() === 'form') {
        @if (!lines().length) {
          <p class="muted" style="padding:0.6rem 0">No hay productos pendientes de reposición.</p>
        } @else {
          <h4 class="fr-sec">Productos por reponer</h4>
          <div class="fr-list">
            @for (l of lines(); track l.productId) {
              <div class="fr-row">
                <span class="fr-img">@if (l.imageUrl) { <img [src]="l.imageUrl" alt="" /> } @else { <i class="pi pi-image"></i> }</span>
                <span class="fr-n">{{ l.name }}</span>
                <span class="fr-step">
                  <button class="st" [disabled]="l.qty <= 0" (click)="dec(l)">−</button>
                  <b>{{ l.qty }}</b>
                  <button class="st" [disabled]="l.qty >= maxFor(l)" (click)="inc(l)">+</button>
                </span>
              </div>
            }
          </div>

          <h4 class="fr-sec">Almacén origen</h4>
          <div class="fr-origins">
            <button class="fr-orig" [class.on]="origin() === 'RECEPCION'" [disabled]="!data()?.warehouses?.recepcion" (click)="setOrigin('RECEPCION')"><i class="pi" [class.pi-circle-fill]="origin() === 'RECEPCION'" [class.pi-circle]="origin() !== 'RECEPCION'"></i> Productos Recepción</button>
            <button class="fr-orig" [class.on]="origin() === 'LIMPIEZA'" [disabled]="!data()?.warehouses?.limpieza" (click)="setOrigin('LIMPIEZA')"><i class="pi" [class.pi-circle-fill]="origin() === 'LIMPIEZA'" [class.pi-circle]="origin() !== 'LIMPIEZA'"></i> Productos Limpieza</button>
          </div>

          <h4 class="fr-sec">Disponibilidad</h4>
          <div class="fr-list">
            @for (l of lines(); track l.productId) {
              <div class="fr-avl">
                <span class="fr-img sm">@if (l.imageUrl) { <img [src]="l.imageUrl" alt="" /> } @else { <i class="pi pi-image"></i> }</span>
                <span class="fr-n">{{ l.name }}</span>
                @if (availOf(l) >= l.pendingQty && l.pendingQty > 0) { <span class="badge ok"><i class="pi pi-check-circle"></i> Stock disponible</span> }
                @else if (availOf(l) > 0) { <span class="badge part"><i class="pi pi-exclamation-triangle"></i> Parcial ({{ availOf(l) }})</span> }
                @else { <span class="badge no"><i class="pi pi-times-circle"></i> Sin stock</span> }
              </div>
            }
          </div>

          <div class="fr-print">
            <i class="pi pi-print"></i>
            <div class="fr-print-t"><b>Impresión de ticket</b><small>Antes de finalizar, imprime el ticket para preparar y archivar la reposición.</small></div>
            <button class="fr-print-btn" [disabled]="!toRepo().length" (click)="view.set('ticket')"><i class="pi pi-print"></i> Imprimir ticket</button>
          </div>
        }
      } @else {
        <!-- Vista de ticket 80mm -->
        <div class="fr-ticket" id="fr-ticket">
          <div class="tk">
            <div class="tk-tt">REPOSICIÓN FRIGOBAR</div>
            <div class="tk-sep"></div>
            <div class="tk-kv">ORIGEN: <b>{{ originLabel() }}</b></div>
            <div class="tk-kv">DESTINO: <b>HAB. {{ roomNumber || (data()?.room?.number ?? '') }}</b></div>
            <div class="tk-sep"></div>
            <div class="tk-h">PRODUCTOS</div>
            @for (l of toRepo(); track l.productId) { <div class="tk-l"><span>{{ l.qty }}</span><span>{{ l.name }}</span></div> }
            <div class="tk-sep"></div>
            <div class="tk-kv">REPUESTO POR: <b>{{ userName() }}</b></div>
            <div class="tk-kv">{{ now | date: 'dd/MM/yyyy · hh:mm a' }}</div>
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        @if (view() === 'form') {
          <p-button label="Cancelar" [text]="true" (onClick)="onVis(false)" />
          <p-button label="Finalizar reposición" icon="pi pi-check" severity="success" [loading]="busy()" [disabled]="!printed() || !toRepo().length" (onClick)="finalize()" />
          @if (!printed()) { <small class="fr-hint">Se habilita después de imprimir</small> }
        } @else {
          <p-button label="Volver" [text]="true" (onClick)="view.set('form')" />
          <p-button label="Imprimir ticket" icon="pi pi-print" severity="warn" (onClick)="printTicket()" />
        }
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .fr-dialog .p-dialog-content, :host ::ng-deep .fr-dialog .p-dialog-header, :host ::ng-deep .fr-dialog .p-dialog-footer { background: #0e1a2b; color: #e6edf5; }
      .muted { color: #8aa0bd; }
      .fr-head { display: flex; align-items: center; gap: 0.6rem; } .fr-head b { display: block; } .fr-head small { color: #8aa0bd; font-size: 0.72rem; } .fr-head .pi { font-size: 1.3rem; color: #fb923c; }
      .fr-sec { margin: 0.9rem 0 0.4rem; font-size: 0.82rem; color: #cbd5e1; font-weight: 700; }
      .fr-list { display: flex; flex-direction: column; gap: 0.35rem; }
      .fr-row, .fr-avl { display: grid; grid-template-columns: 2rem 1fr auto; gap: 0.6rem; align-items: center; background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.45rem 0.7rem; }
      .fr-n { font-weight: 700; }
      .fr-img { width: 1.9rem; height: 1.9rem; display: inline-flex; align-items: center; justify-content: center; background: #0b1220; border: 1px solid #274468; border-radius: 7px; } .fr-img img { max-width: 1.4rem; max-height: 1.4rem; object-fit: contain; } .fr-img .pi { color: #46617a; }
      .fr-step { display: inline-flex; align-items: center; gap: 0.5rem; } .fr-step .st { width: 1.8rem; height: 1.8rem; border: 1px solid #274468; background: #0b1220; color: #cbd5e1; border-radius: 7px; cursor: pointer; font-weight: 800; } .fr-step .st:disabled { opacity: 0.35; cursor: not-allowed; } .fr-step b { min-width: 1.4rem; text-align: center; }
      .fr-origins { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
      .fr-orig { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.6rem 0.7rem; border-radius: 10px; border: 1px solid #274468; background: #0f1a2b; color: #cbd5e1; cursor: pointer; font-weight: 600; } .fr-orig.on { border-color: #fb923c; color: #fdba74; background: rgba(251,146,60,0.1); } .fr-orig:disabled { opacity: 0.4; cursor: not-allowed; } .fr-orig .pi { font-size: 0.85rem; }
      .badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 999px; } .badge.ok { color: #34d399; background: rgba(16,185,129,0.14); } .badge.part { color: #fbbf24; background: rgba(245,158,11,0.14); } .badge.no { color: #f87171; background: rgba(244,63,94,0.14); }
      .fr-print { display: grid; grid-template-columns: auto 1fr auto; gap: 0.6rem; align-items: center; margin-top: 1rem; padding: 0.7rem; background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 10px; } .fr-print > .pi { font-size: 1.4rem; color: #fb923c; } .fr-print-t b { display: block; } .fr-print-t small { color: #8aa0bd; font-size: 0.72rem; } .fr-print-btn { background: #f97316; color: #fff; border: 0; border-radius: 9px; padding: 0.55rem 0.9rem; font-weight: 700; cursor: pointer; white-space: nowrap; } .fr-print-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .fr-hint { color: #8aa0bd; font-size: 0.72rem; align-self: center; margin-left: 0.4rem; }
      .fr-ticket { display: flex; justify-content: center; padding: 0.6rem 0; }
      .tk { width: 260px; background: #fff; color: #111; border-radius: 6px; padding: 1rem 1.1rem; font-family: 'Courier New', monospace; font-size: 0.82rem; }
      .tk-tt { text-align: center; font-weight: 800; font-size: 1rem; } .tk-sep { border-top: 1px dashed #999; margin: 0.5rem 0; } .tk-kv { margin: 0.15rem 0; } .tk-h { font-weight: 800; margin: 0.2rem 0; } .tk-l { display: grid; grid-template-columns: 1.6rem 1fr; gap: 0.4rem; }
    `,
  ],
})
export class FrigobarRepositionComponent {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  @Input() reviewId: string | null = null;
  @Input() roomNumber = '';
  /** Etiqueta de contexto en el subtítulo (p. ej. "Limpieza en espera", "Disponible"). */
  @Input() contextLabel = '';
  private _visible = false;
  @Input()
  get visible(): boolean { return this._visible; }
  set visible(v: boolean) { if (v === this._visible) return; this._visible = v; if (v) this.open(); }
  @Output() visibleChange = new EventEmitter<boolean>();
  /** Emite tras finalizar la reposición (el padre debe recargar). */
  @Output() confirmed = new EventEmitter<void>();

  readonly data = signal<RepoStart | null>(null);
  readonly lines = signal<RepoLine[]>([]);
  readonly origin = signal<Origin>('RECEPCION');
  readonly view = signal<'form' | 'ticket'>('form');
  readonly printed = signal(false);
  readonly busy = signal(false);
  readonly now = new Date();
  readonly userName = computed(() => this.auth.user()?.name ?? '—');
  readonly originLabel = computed(() => (this.origin() === 'LIMPIEZA' ? 'ALMACÉN LIMPIEZA' : 'ALMACÉN RECEPCIÓN'));
  readonly toRepo = computed(() => this.lines().filter((l) => l.qty > 0));

  onVis(v: boolean): void { this._visible = v; this.visibleChange.emit(v); if (!v) { this.view.set('form'); this.printed.set(false); } }

  private open(): void {
    if (!this.reviewId) return;
    this.data.set(null); this.lines.set([]); this.view.set('form'); this.printed.set(false); this.origin.set('RECEPCION');
    this.http.get<ApiResponse<RepoStart>>(`${this.api}/frigobar/review/${this.reviewId}/reposition`).subscribe({
      next: (r) => {
        const d = r.data;
        this.data.set(d ?? null);
        // Recepción por defecto; si no existe, cae a Limpieza.
        this.origin.set(d?.warehouses?.recepcion ? 'RECEPCION' : 'LIMPIEZA');
        this.lines.set((d?.lines ?? []).map((l) => ({ ...l, qty: Math.min(l.pendingQty, this.origin() === 'LIMPIEZA' ? l.availLimpieza : l.availRecepcion) })));
      },
      error: (e: HttpErrorResponse) => { this.onVis(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo abrir la reposición.' }); },
    });
  }

  availOf(l: RepoLine): number { return this.origin() === 'LIMPIEZA' ? l.availLimpieza : l.availRecepcion; }
  maxFor(l: RepoLine): number { return Math.min(l.pendingQty, this.availOf(l)); }
  setOrigin(o: Origin): void { this.origin.set(o); this.printed.set(false); this.lines.set(this.lines().map((l) => ({ ...l, qty: Math.min(l.qty, this.maxFor(l)) }))); }
  inc(l: RepoLine): void { if (l.qty < this.maxFor(l)) { l.qty++; this.lines.set([...this.lines()]); this.printed.set(false); } }
  dec(l: RepoLine): void { if (l.qty > 0) { l.qty--; this.lines.set([...this.lines()]); this.printed.set(false); } }

  printTicket(): void {
    const rows = this.toRepo().map((l) => `<div style="display:flex"><span style="width:26px">${l.qty}</span><span>${this.esc(l.name)}</span></div>`).join('');
    const html = `<html><head><title>Reposición frigobar</title></head><body style="font-family:'Courier New',monospace;font-size:12px;width:280px;margin:0 auto;padding:8px">`
      + `<div style="text-align:center;font-weight:800;font-size:14px">REPOSICIÓN FRIGOBAR</div><hr>`
      + `<div>ORIGEN: <b>${this.originLabel()}</b></div><div>DESTINO: <b>HAB. ${this.esc(this.roomNumber || this.data()?.room?.number || '')}</b></div><hr>`
      + `<div style="font-weight:800">PRODUCTOS</div>${rows}<hr>`
      + `<div>REPUESTO POR: <b>${this.esc(this.userName())}</b></div><div>${new Date().toLocaleString('es-PE')}</div>`
      + `</body></html>`;
    const w = window.open('', '_blank', 'width=360,height=600');
    if (w) { w.document.write(html); w.document.close(); w.focus(); try { w.print(); } catch { /* el usuario puede imprimir manualmente */ } }
    this.printed.set(true);
    this.view.set('form');
  }
  private esc(s: string): string { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c)); }

  finalize(): void {
    if (!this.reviewId || !this.toRepo().length) return;
    this.busy.set(true);
    const body = { origin: this.origin(), lines: this.toRepo().map((l) => ({ productId: l.productId, quantity: l.qty })) };
    this.http.post<ApiResponse<{ repuesto: { name: string; qty: number }[]; pendiente: { name: string; qty: number }[] }>>(`${this.api}/frigobar/review/${this.reviewId}/reposition`, body).subscribe({
      next: (r) => {
        this.busy.set(false); this.onVis(false);
        const rep = r.data?.repuesto?.length ?? 0; const pend = r.data?.pendiente?.length ?? 0;
        this.toast.add({ severity: 'success', summary: 'Frigobar repuesto', detail: `${rep} ítem(s) repuesto(s)${pend ? ` · ${pend} pendiente(s) por stock` : ''}.` });
        this.confirmed.emit();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo reponer.' }); },
    });
  }
}
