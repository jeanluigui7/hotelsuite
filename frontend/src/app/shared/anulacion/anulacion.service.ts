import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';

export type AnulacionKind = 'CHECKIN' | 'RENOVACION';
export interface AnulacionCtx {
  kind: AnulacionKind;
  stayId: string;
  saleId?: string | null; // para renovación desde Caja/Movimientos (sin stayRenewalId)
  stayRenewalId?: string | null; // para renovación desde Folio
  roomNumber?: string | null;
  guestName?: string | null;
  paidAmount?: number; // pagado atribuible (para el "Resumen de devolución")
}

/**
 * Flujo ÚNICO y reutilizable de anulación de check-in / renovación. Se dispara desde Card, Folio o
 * Caja/Movimientos con el mismo `start()`, abre los mismos modales y aplica las mismas reglas en el
 * backend. Respeta el permiso de anulación (finance:edit). Los hosts observan `completed()` para recargar.
 */
@Injectable({ providedIn: 'root' })
export class AnulacionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly visible = signal(false);
  readonly step = signal<'estado' | 'penalidad'>('estado');
  readonly ctx = signal<AnulacionCtx | null>(null);
  readonly pendingOutcome = signal<string | null>(null);
  readonly busy = signal(false);
  /** Se incrementa al completar una anulación: los hosts (card/folio/caja) recargan su data. */
  readonly completed = signal(0);

  canAnular(): boolean { return this.auth.can('finance', 'edit'); }

  start(ctx: AnulacionCtx): void {
    if (!this.canAnular()) {
      this.toast.add({ severity: 'warn', summary: 'Sin permiso', detail: 'No tienes habilitada la acción de anular/corregir.' });
      return;
    }
    this.ctx.set(ctx);
    this.pendingOutcome.set(null);
    this.step.set('estado');
    this.visible.set(true);
  }
  close(): void { if (!this.busy()) this.visible.set(false); }

  /** Elige el estado de la habitación. "con uso" pasa al modal de penalidad; el resto confirma. */
  choose(outcome: string): void {
    if (outcome === 'LIMPIEZA_USO') { this.pendingOutcome.set(outcome); this.step.set('penalidad'); return; }
    this.submit(outcome);
  }
  confirmPenalty(penaltyAmount: number, observation: string): void {
    const o = this.pendingOutcome();
    if (o) this.submit(o, { penaltyAmount, observation });
  }

  private submit(outcome: string, penalty?: { penaltyAmount: number; observation: string }): void {
    const c = this.ctx();
    if (!c) return;
    this.busy.set(true);
    const body: Record<string, unknown> = { roomOutcome: outcome };
    if (penalty && penalty.penaltyAmount > 0) { body['penaltyAmount'] = penalty.penaltyAmount; body['penaltyObservation'] = penalty.observation || undefined; }
    if (c.kind === 'RENOVACION') { if (c.stayRenewalId) body['stayRenewalId'] = c.stayRenewalId; else if (c.saleId) body['saleId'] = c.saleId; }
    const url = c.kind === 'CHECKIN' ? `${this.api}/stays/${c.stayId}/cancel-checkin` : `${this.api}/stays/${c.stayId}/cancel-renewal`;
    this.http.post(url, body).subscribe({
      next: () => {
        this.busy.set(false); this.visible.set(false);
        this.toast.add({ severity: 'success', summary: c.kind === 'CHECKIN' ? 'Check-in anulado' : 'Renovación anulada', detail: 'Habitación, folio, caja y estadísticas sincronizados.' });
        this.completed.update((n) => n + 1);
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo anular.' }); },
    });
  }
}
