import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import type { FingerprintPoll } from '../../core/auth/auth.models';

type ModalState = 'starting' | 'waiting' | 'success' | 'timeout' | 'error';

/**
 * Modal reutilizable de autenticación biométrica. Abre una solicitud (login o logout), muestra una
 * cuenta regresiva de ~30 s y sondea el estado hasta que el huellero empuja la marca del usuario.
 *   - Huella correcta  → "Autenticación exitosa" y emite (success).
 *   - Huella de otro / tiempo agotado → se agota y permite reintentar.
 *   - Cancelar → cancela la solicitud y emite (cancelled).
 * No genera asistencia: el backend consume esa marca como autenticación.
 */
@Component({
  selector: 'app-fingerprint-auth-modal',
  standalone: true,
  template: `
    <div class="fp-backdrop" (click)="onCancel()">
      <div class="fp-modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <div class="fp-icon" [class.ok]="state() === 'success'" [class.bad]="state() === 'timeout' || state() === 'error'">
          @if (state() === 'success') { <i class="pi pi-check-circle"></i> }
          @else if (state() === 'timeout' || state() === 'error') { <i class="pi pi-times-circle"></i> }
          @else { <i class="pi pi-id-card"></i> }
        </div>

        <h3>Autenticación biométrica</h3>
        <p class="fp-name">{{ name || 'Trabajador' }}</p>

        @switch (state()) {
          @case ('starting') { <p class="fp-msg">Preparando…</p> }
          @case ('waiting') {
            <p class="fp-msg">Coloque su dedo en el huellero</p>
            <div class="fp-count"><span>{{ seconds() }}</span><small>segundos</small></div>
            <div class="fp-bar"><div class="fp-bar-fill" [style.width.%]="pct()"></div></div>
          }
          @case ('success') { <p class="fp-msg ok">Autenticación exitosa</p> }
          @case ('timeout') { <p class="fp-msg bad">Tiempo agotado. No se recibió la huella.</p> }
          @case ('error') { <p class="fp-msg bad">{{ errorMsg() }}</p> }
        }

        <div class="fp-actions">
          @if (state() === 'timeout' || state() === 'error') {
            <button type="button" class="fp-btn ghost" (click)="close()">Cerrar</button>
            <button type="button" class="fp-btn" (click)="start()">Reintentar</button>
          } @else if (state() !== 'success') {
            <button type="button" class="fp-btn ghost" (click)="onCancel()">Cancelar</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .fp-backdrop { position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center;
        background: rgba(8, 10, 18, 0.62); backdrop-filter: blur(3px); padding: 1rem; }
      .fp-modal { width: 100%; max-width: 360px; padding: 1.75rem 1.5rem; text-align: center;
        background: var(--p-content-background, #0f1a2b); color: var(--p-text-color, #e6edf5);
        border: 1px solid var(--p-content-border-color, #24324a); border-radius: 18px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); }
      .fp-icon { width: 76px; height: 76px; margin: 0 auto 1rem; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; font-size: 2.1rem;
        background: color-mix(in srgb, var(--rz-accent, #10b981) 16%, transparent); color: var(--rz-accent, #10b981);
        animation: fp-pulse 1.4s ease-in-out infinite; }
      .fp-icon.ok { background: rgba(16, 185, 129, 0.16); color: #10b981; animation: none; }
      .fp-icon.bad { background: rgba(239, 68, 68, 0.16); color: #ef4444; animation: none; }
      @keyframes fp-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.06); opacity: 0.78; } }
      @media (prefers-reduced-motion: reduce) { .fp-icon { animation: none; } }
      h3 { margin: 0 0 0.25rem; font-size: 1.15rem; }
      .fp-name { margin: 0 0 1rem; font-weight: 700; color: var(--rz-accent, #10b981); }
      .fp-msg { margin: 0 0 0.75rem; color: var(--p-text-muted-color, #93a4bd); }
      .fp-msg.ok { color: #10b981; font-weight: 700; }
      .fp-msg.bad { color: #ef4444; font-weight: 600; }
      .fp-count { font-variant-numeric: tabular-nums; }
      .fp-count span { font-size: 2.4rem; font-weight: 800; }
      .fp-count small { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--p-text-muted-color, #93a4bd); }
      .fp-bar { height: 6px; border-radius: 99px; background: var(--p-content-hover-background, #1b2a42); overflow: hidden; margin: 0.9rem 0 0.25rem; }
      .fp-bar-fill { height: 100%; background: var(--rz-accent, #10b981); transition: width 0.9s linear; }
      .fp-actions { display: flex; gap: 0.6rem; margin-top: 1.25rem; }
      .fp-btn { flex: 1; padding: 0.7rem; border-radius: 11px; border: 0; cursor: pointer; font-weight: 700; font-size: 0.9rem;
        background: var(--rz-accent, #10b981); color: #04130d; }
      .fp-btn.ghost { background: transparent; color: var(--p-text-color, #e6edf5); border: 1px solid var(--p-content-border-color, #24324a); }
      .fp-btn:hover { filter: brightness(1.07); }
    `,
  ],
})
export class FingerprintAuthModalComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);

  /** 'login' usa el correo; 'logout' usa la sesión activa. */
  @Input() mode: 'login' | 'logout' = 'login';
  @Input() email = '';
  @Input() name = '';

  @Output() success = new EventEmitter<FingerprintPoll>();
  @Output() cancelled = new EventEmitter<void>();

  readonly state = signal<ModalState>('starting');
  readonly seconds = signal(30);
  readonly errorMsg = signal('');

  private requestId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private deadline = 0;
  private busy = false;

  ngOnInit(): void {
    this.start();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  /** Inicia (o reinicia) el flujo: abre la solicitud y empieza a sondear. */
  start(): void {
    this.stopTimer();
    this.state.set('starting');
    this.seconds.set(30);
    this.errorMsg.set('');
    const open$ = this.mode === 'login' ? this.auth.fpLoginRequest(this.email) : this.auth.fpLogoutRequest();
    open$.subscribe({
      next: (res) => {
        this.requestId = res.data.requestId;
        if (res.data.name) this.name = res.data.name;
        this.deadline = Date.now() + Math.min(30_000, res.data.expiresInMs ?? 30_000);
        this.state.set('waiting');
        this.tick();
        this.timer = setInterval(() => this.tick(), 1200);
      },
      error: (e: HttpErrorResponse) => {
        this.errorMsg.set(e.error?.error?.message ?? 'No se pudo iniciar la autenticación.');
        this.state.set('error');
      },
    });
  }

  pct(): number {
    return Math.max(0, Math.min(100, (this.seconds() / 30) * 100));
  }

  private tick(): void {
    const remaining = Math.ceil((this.deadline - Date.now()) / 1000);
    this.seconds.set(Math.max(0, remaining));
    if (remaining <= 0) {
      this.stopTimer();
      this.cancelOnServer();
      this.state.set('timeout');
      return;
    }
    this.poll();
  }

  private poll(): void {
    if (!this.requestId || this.busy) return;
    this.busy = true;
    const poll$ = this.mode === 'login' ? this.auth.fpLoginPoll(this.requestId) : this.auth.fpLogoutPoll(this.requestId);
    poll$.subscribe({
      next: (res) => {
        this.busy = false;
        const data = res.data;
        if (data.status === 'authenticated') {
          this.stopTimer();
          this.state.set('success');
          setTimeout(() => this.success.emit(data), 650);
        } else if (data.status === 'expired' || data.status === 'cancelled') {
          this.stopTimer();
          this.state.set('timeout');
        }
      },
      error: (e: HttpErrorResponse) => {
        this.busy = false;
        // 409 (caja abierta / lavandería pendiente) u otro error de negocio al finalizar turno.
        this.stopTimer();
        this.errorMsg.set(e.error?.error?.message ?? 'No se pudo completar la operación.');
        this.state.set('error');
      },
    });
  }

  onCancel(): void {
    if (this.state() === 'success') return;
    this.stopTimer();
    this.cancelOnServer();
    this.cancelled.emit();
  }

  close(): void {
    this.stopTimer();
    this.cancelled.emit();
  }

  private cancelOnServer(): void {
    if (this.requestId) this.auth.fpCancel(this.requestId).subscribe({ next: () => undefined, error: () => undefined });
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
