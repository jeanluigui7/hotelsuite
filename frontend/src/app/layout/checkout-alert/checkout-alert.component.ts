import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CheckoutAlertService, type CheckoutAlert } from './checkout-alert.service';

/**
 * Aviso emergente de vencimiento de estancias (−15 min) con cola y voz.
 * Montado en el shell → aparece en cualquier pantalla de recepción.
 */
@Component({
  selector: 'app-checkout-alert',
  standalone: true,
  imports: [DatePipe],
  template: `
    <!-- Indicador flotante: aparece si hay avisos en cola pero el modal está cerrado (✕). -->
    @if (svc.current() && hidden()) {
      <button class="co-bell" type="button" (click)="reopen()" aria-label="Avisos de vencimiento pendientes">
        <span class="bell-ico">🔔</span>
        <span class="bell-count">{{ svc.pendingCount() }}</span>
      </button>
    }

    @if (svc.current(); as a) {
      @if (!hidden()) {
        <div class="co-backdrop" (click)="close()"></div>
        <div class="co-modal" role="alertdialog" aria-labelledby="co-title" aria-describedby="co-desc">
          <button class="co-x" type="button" (click)="close()" aria-label="Cerrar">✕</button>

          <div class="co-head">
            <span class="co-ico" [class.overdue]="rem(a).overdue">{{ rem(a).overdue ? '⏰' : '📞' }}</span>
            <div>
              <div class="co-eyebrow">Recordatorio de salida</div>
              <h2 id="co-title">Llamar a la habitación</h2>
            </div>
          </div>

          <div class="co-room">{{ a.roomNumber }}</div>
          @if (a.guestName) {
            <div class="co-guest">{{ a.guestName }}</div>
          }

          <div id="co-desc" class="co-when" [class.overdue]="rem(a).overdue">
            <div class="co-when-h">
              <span class="l">Vence</span>
              <strong>{{ a.plannedCheckoutAt | date: 'hh:mm a' }}</strong>
            </div>
            <div class="co-count" [class.overdue]="rem(a).overdue">{{ rem(a).text }}</div>
          </div>

          <p class="co-hint">Llame por intercomunicador para avisar la salida.</p>

          @if (svc.pendingCount() > 1) {
            <div class="co-queue">Hay {{ svc.pendingCount() - 1 }} aviso(s) más en cola.</div>
          }

          <div class="co-actions">
            <button class="btn done" type="button" (click)="callDone(a)">Llamada realizada</button>
            <button class="btn snooze" type="button" (click)="snooze(a)">Recordar en 2 min</button>
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        --co-accent: #b45309;
        --co-accent-soft: #fef3c7;
        --co-danger: #b91c1c;
        --co-danger-soft: #fee2e2;
      }
      .co-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        z-index: 2000;
        animation: co-fade 0.15s ease;
      }
      .co-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2001;
        width: min(92vw, 420px);
        background: #fff;
        border-radius: 18px;
        padding: 1.6rem 1.5rem 1.4rem;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
        text-align: center;
        animation: co-pop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .co-x {
        position: absolute;
        top: 0.6rem;
        right: 0.7rem;
        border: none;
        background: transparent;
        font-size: 1rem;
        color: #94a3b8;
        cursor: pointer;
        line-height: 1;
        padding: 0.3rem;
      }
      .co-x:hover {
        color: #475569;
      }
      .co-head {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        justify-content: center;
        margin-bottom: 0.8rem;
      }
      .co-ico {
        font-size: 1.8rem;
        line-height: 1;
        animation: co-pulse 1.4s ease-in-out infinite;
      }
      .co-ico.overdue {
        animation: co-pulse 0.8s ease-in-out infinite;
      }
      .co-eyebrow {
        font-size: 0.7rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--co-accent);
        font-weight: 700;
        text-align: left;
      }
      .co-head h2 {
        margin: 0.1rem 0 0;
        font-size: 1.15rem;
        color: #1e293b;
        text-align: left;
      }
      .co-room {
        font-size: 3.4rem;
        font-weight: 800;
        color: #0f172a;
        line-height: 1;
        margin: 0.2rem 0;
        font-variant-numeric: tabular-nums;
      }
      .co-guest {
        font-size: 0.95rem;
        color: #475569;
        margin-bottom: 0.9rem;
      }
      .co-when {
        background: var(--co-accent-soft);
        border-radius: 12px;
        padding: 0.7rem 0.9rem;
        margin: 0.4rem 0 0.2rem;
      }
      .co-when.overdue {
        background: var(--co-danger-soft);
      }
      .co-when-h {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 0.5rem;
      }
      .co-when-h .l {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #92400e;
      }
      .co-when.overdue .co-when-h .l {
        color: var(--co-danger);
      }
      .co-when-h strong {
        font-size: 1.15rem;
        color: #92400e;
        font-variant-numeric: tabular-nums;
      }
      .co-when.overdue .co-when-h strong {
        color: var(--co-danger);
      }
      .co-count {
        margin-top: 0.25rem;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--co-accent);
      }
      .co-count.overdue {
        color: var(--co-danger);
      }
      .co-hint {
        margin: 0.9rem 0 0.2rem;
        font-size: 0.85rem;
        color: #64748b;
      }
      .co-queue {
        margin-top: 0.5rem;
        font-size: 0.78rem;
        color: #64748b;
        background: #f1f5f9;
        border-radius: 999px;
        padding: 0.25rem 0.7rem;
        display: inline-block;
      }
      .co-actions {
        display: grid;
        gap: 0.6rem;
        margin-top: 1.1rem;
      }
      .btn {
        border: none;
        border-radius: 10px;
        padding: 0.7rem 1rem;
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.12s ease;
      }
      .btn:hover {
        filter: brightness(0.96);
      }
      .btn.done {
        background: #16a34a;
        color: #fff;
      }
      .btn.snooze {
        background: #fff;
        color: #334155;
        border: 1px solid #cbd5e1;
      }
      /* Indicador flotante */
      .co-bell {
        position: fixed;
        bottom: 1.4rem;
        right: 1.4rem;
        z-index: 1999;
        border: none;
        background: var(--co-accent);
        color: #fff;
        border-radius: 999px;
        padding: 0.7rem 1rem 0.7rem 0.85rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        box-shadow: 0 10px 28px rgba(180, 83, 9, 0.4);
        cursor: pointer;
        animation: co-pulse 1.4s ease-in-out infinite;
      }
      .bell-ico {
        font-size: 1.2rem;
        line-height: 1;
      }
      .bell-count {
        font-weight: 800;
        font-size: 0.95rem;
        font-variant-numeric: tabular-nums;
      }
      @keyframes co-fade {
        from {
          opacity: 0;
        }
      }
      @keyframes co-pop {
        from {
          opacity: 0;
          transform: translate(-50%, -46%) scale(0.94);
        }
      }
      @keyframes co-pulse {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.08);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .co-ico,
        .co-bell,
        .co-modal,
        .co-backdrop {
          animation: none;
        }
      }
    `,
  ],
})
export class CheckoutAlertComponent {
  readonly svc = inject(CheckoutAlertService);
  /** El usuario cerró el modal con ✕ (queda el 🔔, no marca realizada). */
  private readonly _hidden = signal(false);
  readonly hidden = this._hidden.asReadonly();
  private lastAnnounced: string | null = null;

  constructor() {
    this.svc.start();
    // Anuncia (voz + sonido) cuando cambia el aviso al frente de la cola.
    effect(() => {
      const cur = this.svc.current();
      if (!cur) {
        this.lastAnnounced = null;
        return;
      }
      if (cur.key !== this.lastAnnounced) {
        this.lastAnnounced = cur.key;
        this._hidden.set(false); // un aviso nuevo reabre el modal
        this.announce(cur);
      }
    });
  }

  /** Tiempo restante hasta el vencimiento, como texto + bandera de vencido. */
  rem(a: CheckoutAlert): { text: string; overdue: boolean } {
    const diffMs = a.plannedMs - this.svc.nowMs();
    const mins = Math.round(Math.abs(diffMs) / 60_000);
    if (diffMs <= 0) {
      return { text: mins < 1 ? 'Vencida ahora' : `Vencida hace ${mins} min`, overdue: true };
    }
    return { text: mins < 1 ? 'Vence en menos de 1 min' : `Vence en ${mins} min`, overdue: false };
  }

  callDone(a: CheckoutAlert): void {
    this.svc.markDone(a.key);
    this._hidden.set(false);
  }

  snooze(a: CheckoutAlert): void {
    this.svc.snoozeAlert(a.key);
    this._hidden.set(false);
  }

  /** Cerrar (✕ o backdrop): oculta sin marcar realizada; queda el 🔔. */
  close(): void {
    this._hidden.set(true);
  }

  reopen(): void {
    this._hidden.set(false);
    const cur = this.svc.current();
    if (cur) this.announce(cur);
  }

  /** Voz (es-PE) + beep de respaldo. Todo protegido por autoplay/soporte. */
  private announce(a: CheckoutAlert): void {
    this.beep();
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const diffMs = a.plannedMs - Date.now();
      const mins = Math.max(0, Math.round(diffMs / 60_000));
      const msg =
        diffMs > 0
          ? `Habitación ${this.speak(a.roomNumber)}, vence en ${mins} minutos. Llamar por intercomunicador.`
          : `Habitación ${this.speak(a.roomNumber)} ya venció. Llamar por intercomunicador.`;
      const u = new SpeechSynthesisUtterance(msg);
      u.lang = 'es-PE';
      u.rate = 0.95;
      synth.speak(u);
    } catch {
      /* síntesis de voz no disponible: queda el beep */
    }
  }

  /** Lee el número dígito a dígito para que la voz diga "uno cero siete", no "ciento siete". */
  private speak(room: string): string {
    return /^\d+$/.test(room) ? room.split('').join(' ') : room;
  }

  private beep(): void {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const play = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      play(880, 0, 0.18);
      play(1175, 0.2, 0.22);
      setTimeout(() => ctx.close().catch(() => undefined), 800);
    } catch {
      /* WebAudio no disponible o bloqueado por autoplay */
    }
  }
}
