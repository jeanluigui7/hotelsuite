import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface ReviewLine { productId: string; name: string; code?: string; imageUrl?: string | null; location: 'FRIGOBAR' | 'BANDEJA'; expectedQty: number; unitPrice: number; consumo: number; }

/**
 * Modal REUTILIZABLE de inspección de frigobar. Lo abren:
 *  - Recepción, desde el Folio de Estancia (origin='RECEPCION').
 *  - Housekeeping, desde Gestión de Habitaciones (origin='HOUSEKEEPING').
 * Mismo componente, mismo resultado (registra consumo → cargo al folio → reposición pendiente).
 * El COBRO NO está aquí (es una acción del folio de Recepción).
 */
@Component({
  selector: 'app-frigobar-inspection',
  standalone: true,
  imports: [DialogModule, ButtonModule],
  template: `
    <p-dialog [visible]="visible" (visibleChange)="onVis($event)" [modal]="true" [header]="(roomNumber || '') + ' - INSPECCIÓN FRIGOBAR'" [style]="{ width: '52rem', maxWidth: '97vw' }" styleClass="fi-dialog">
      @if (!lines().length) {
        <p class="muted" style="padding:1rem">La habitación no tiene dotación de frigobar. Dótala primero en <b>Dotación Base → Primera Dotación</b>.</p>
      } @else {
        <div class="insp">
          <div class="insp-l">
            @for (g of groups(); track g.key) {
              <div class="ig">
                <div class="ig-h" [class.bandeja]="g.key === 'BANDEJA'"><i class="pi" [class.pi-inbox]="g.key === 'FRIGOBAR'" [class.pi-shopping-cart]="g.key === 'BANDEJA'"></i> <div><b>{{ g.label }}</b><small>{{ g.key === 'FRIGOBAR' ? 'Productos dentro del frigobar' : 'Productos sobre la bandeja / mesa' }}</small></div></div>
                <div class="ig-cols"><span>PRODUCTO</span><span class="c">BASE</span><span class="c">IMAGEN</span><span class="c">CONSUMO</span></div>
                @for (l of g.rows; track l.productId) {
                  <div class="ig-row" [class.on]="l.consumo > 0">
                    <span class="ig-n">{{ l.name }}</span>
                    <span class="c ig-b">{{ l.expectedQty }}</span>
                    <button class="c ig-img" type="button" [disabled]="l.consumo >= l.expectedQty" (click)="inc(l)" title="Tocar para marcar consumo">@if (l.imageUrl) { <img [src]="l.imageUrl" alt="" /> } @else { <i class="pi pi-image"></i> }</button>
                    <span class="c ig-step">
                      <button class="st" [disabled]="l.consumo <= 0" (click)="dec(l)" title="Reducir">−</button>
                      <b [class.on]="l.consumo > 0">{{ l.consumo > 0 ? ('−' + l.consumo) : '0' }}</b>
                    </span>
                  </div>
                }
              </div>
            }
          </div>
          <div class="insp-r">
            <div class="ir-h"><i class="pi pi-file-edit"></i> <div><b>PRODUCTOS CONSUMIDOS</b><small>Se cargarán al folio</small></div></div>
            <div class="ir-list">
              @for (l of consumed(); track l.productId) { <div class="ir-l"><span class="ir-q">{{ l.consumo }} ×</span> {{ l.name }}</div> }
              @if (!consumed().length) { <p class="muted sm">Sin consumo aún.</p> }
            </div>
            <div class="ir-tot"><i class="pi pi-chart-bar"></i> <div><small>TOTAL CONSUMIDO</small><strong>{{ totalUnits() }} unidad(es)</strong></div></div>
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="onVis(false)" />
        <p-button label="Confirmar Inspección" icon="pi pi-check" severity="success" [loading]="busy()" [disabled]="!lines().length" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .fi-dialog .p-dialog-content, :host ::ng-deep .fi-dialog .p-dialog-header, :host ::ng-deep .fi-dialog .p-dialog-footer { background: #0e1a2b; color: #e6edf5; }
      .muted { color: #8aa0bd; } .sm { font-size: 0.78rem; text-transform: none; }
      .insp { display: grid; grid-template-columns: 1fr 15rem; gap: 0.9rem; align-items: start; }
      .insp-l { max-height: 64vh; overflow-y: auto; padding-right: 0.3rem; }
      .insp-r { position: sticky; top: 0; background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 0.8rem; display: flex; flex-direction: column; }
      .ig { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; margin-bottom: 0.8rem; overflow: hidden; }
      .ig-h { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.9rem; background: rgba(59,130,246,0.12); color: #93c5fd; } .ig-h.bandeja { background: rgba(245,158,11,0.12); color: #fbbf24; } .ig-h b { display: block; } .ig-h small { color: #8aa0bd; font-size: 0.72rem; } .ig-h .pi { font-size: 1.2rem; }
      .ig-cols { display: grid; grid-template-columns: 1fr 4rem 4rem 6rem; gap: 0.4rem; padding: 0.35rem 0.9rem; font-size: 0.64rem; color: #8aa0bd; font-weight: 700; letter-spacing: 0.03em; } .ig-cols .c { text-align: center; }
      .ig-row { display: grid; grid-template-columns: 1fr 4rem 4rem 6rem; gap: 0.4rem; align-items: center; padding: 0.4rem 0.9rem; border-top: 1px solid #16202e; } .ig-row.on { background: rgba(244,63,94,0.06); }
      .ig-n { font-weight: 800; font-size: 0.98rem; text-transform: uppercase; letter-spacing: 0.02em; color: #fff; } .ig-b { text-align: center; font-weight: 800; font-size: 1rem; }
      .ig-img { display: inline-flex; align-items: center; justify-content: center; background: #0b1220; border: 1px solid #274468; border-radius: 8px; padding: 0.2rem; cursor: pointer; width: 2.6rem; height: 2.6rem; margin: 0 auto; } .ig-img:hover:not(:disabled) { border-color: #3b82f6; } .ig-img:disabled { opacity: 0.6; cursor: not-allowed; } .ig-img img { max-width: 2rem; max-height: 2rem; object-fit: contain; } .ig-img .pi { color: #46617a; }
      .ig-step { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }
      .ig-step .st { width: 1.9rem; height: 1.9rem; border: 1px solid #7f1d1d; background: rgba(244,63,94,0.12); color: #fca5a5; border-radius: 7px; cursor: pointer; font-weight: 800; line-height: 1; } .ig-step .st:disabled { opacity: 0.35; cursor: not-allowed; } .ig-step b { min-width: 2rem; text-align: center; color: #64748b; font-size: 1.1rem; } .ig-step b.on { color: #f87171; }
      .ir-h { display: flex; align-items: flex-start; gap: 0.5rem; color: #fca5a5; margin-bottom: 0.6rem; } .ir-h b { display: block; font-size: 0.78rem; } .ir-h small { color: #8aa0bd; font-size: 0.68rem; } .ir-h .pi { color: #f87171; }
      .ir-list { flex: 1; min-height: 4rem; } .ir-l { padding: 0.35rem 0; border-bottom: 1px solid #16202e; font-size: 0.85rem; text-transform: uppercase; } .ir-q { color: #f87171; font-weight: 800; }
      .ir-tot { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.6rem; background: rgba(244,63,94,0.12); border: 1px solid #7f1d1d; border-radius: 10px; padding: 0.6rem 0.8rem; color: #fca5a5; } .ir-tot small { display: block; font-size: 0.62rem; } .ir-tot strong { font-size: 1.2rem; color: #fff; } .ir-tot .pi { font-size: 1.3rem; }
      @media (max-width: 680px) { .insp { grid-template-columns: 1fr; } .insp-l { max-height: none; } }
    `,
  ],
})
export class FrigobarInspectionComponent {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  @Input() stayId: string | null = null;
  @Input() roomNumber = '';
  @Input() origin: 'RECEPCION' | 'HOUSEKEEPING' = 'RECEPCION';
  private _visible = false;
  @Input()
  get visible(): boolean { return this._visible; }
  set visible(v: boolean) { if (v === this._visible) return; this._visible = v; if (v) this.open(); }
  @Output() visibleChange = new EventEmitter<boolean>();
  /** Emite cuando se confirma una inspección (el padre debe recargar). */
  @Output() confirmed = new EventEmitter<void>();

  readonly lines = signal<ReviewLine[]>([]);
  readonly busy = signal(false);

  onVis(v: boolean): void { this._visible = v; this.visibleChange.emit(v); }

  private open(): void {
    if (!this.stayId) return;
    this.lines.set([]);
    this.http.get<ApiResponse<{ lines: ReviewLine[] }>>(`${this.api}/frigobar/review/${this.stayId}/start`).subscribe({
      next: (r) => this.lines.set((r.data?.lines ?? []).map((l) => ({ ...l, location: l.location === 'BANDEJA' ? 'BANDEJA' : 'FRIGOBAR', consumo: 0 }))),
      error: (e: HttpErrorResponse) => { this.onVis(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo iniciar la inspección.' }); },
    });
  }
  groups(): { key: string; label: string; rows: ReviewLine[] }[] {
    // Orden por CÓDIGO (no alfabético) dentro de cada sección; primero BANDEJA, luego FRIGOBAR.
    const byCode = (a: ReviewLine, b: ReviewLine) => (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true, sensitivity: 'base' });
    const ba = this.lines().filter((l) => l.location === 'BANDEJA').sort(byCode);
    const fr = this.lines().filter((l) => l.location !== 'BANDEJA').sort(byCode);
    return [{ key: 'BANDEJA', label: 'Bandeja', rows: ba }, { key: 'FRIGOBAR', label: 'Frigobar', rows: fr }].filter((g) => g.rows.length);
  }
  inc(l: ReviewLine): void { if (l.consumo < l.expectedQty) { l.consumo++; this.lines.set([...this.lines()]); } }
  dec(l: ReviewLine): void { if (l.consumo > 0) { l.consumo--; this.lines.set([...this.lines()]); } }
  consumed(): ReviewLine[] { return this.lines().filter((l) => l.consumo > 0); }
  totalUnits(): number { return this.lines().reduce((a, l) => a + l.consumo, 0); }
  submit(): void {
    if (!this.stayId || !this.lines().length) return;
    this.busy.set(true);
    const lines = this.lines().map((l) => ({ productId: l.productId, foundQty: Math.max(0, l.expectedQty - l.consumo) }));
    this.http.post<ApiResponse<{ consumedTotal: number }>>(`${this.api}/frigobar/review/${this.stayId}`, { lines, origin: this.origin }).subscribe({
      next: (r) => { this.busy.set(false); this.onVis(false); const c = r.data?.consumedTotal ?? 0; this.toast.add({ severity: 'success', summary: 'Frigobar inspeccionado', detail: c > 0 ? `Consumo registrado: S/ ${c.toFixed(2)}` : 'Sin consumo.' }); this.confirmed.emit(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar la inspección.' }); },
    });
  }
}
