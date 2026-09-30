import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../../core/models/api-response.model';
import type { RoomMapItem } from '../../features/operations/services/operations.models';
import { AuthService } from '../../core/auth/auth.service';

/** Minutos antes del vencimiento en los que se dispara el aviso. */
const LEAD_MIN = 15;
/** Minutos que pospone "Recordar en 2 min". */
const SNOOZE_MIN = 2;
/** Frecuencia del sondeo al mapa (ms). */
const POLL_MS = 20_000;

const DONE_KEY = 'hs_checkout_alerts_done';
const SNOOZE_KEY = 'hs_checkout_alerts_snooze';

/** Aviso de vencimiento de una habitación ocupada. */
export interface CheckoutAlert {
  /** Identidad estable: stayId + hora de salida (cambia al renovar → aviso recalculado). */
  key: string;
  stayId: string;
  roomNumber: string;
  guestName: string;
  /** Hora de salida prevista (ISO). */
  plannedCheckoutAt: string;
  plannedMs: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible: el aviso sigue funcionando en memoria */
  }
}

/**
 * Servicio global que sondea el mapa de habitaciones y mantiene una cola de avisos
 * de vencimiento (−15 min). Se monta en el shell para funcionar en cualquier pantalla
 * de recepción. No toca el backend: reutiliza `/rooms/map`.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutAlertService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  /** Habitaciones ocupadas cuyo −15 min ya pasó (crudas, antes de filtrar done/snooze). */
  private readonly candidates = signal<CheckoutAlert[]>([]);
  /** Avisos ya marcados "Llamada realizada" (persisten a refresh). */
  private readonly done = signal<Record<string, true>>(readJson(DONE_KEY, {}));
  /** Avisos pospuestos: key → timestamp hasta el que se ocultan. */
  private readonly snooze = signal<Record<string, number>>(readJson(SNOOZE_KEY, {}));
  /** Tick para reevaluar snooze/cuenta regresiva sin depender del sondeo. */
  private readonly tick = signal(Date.now());

  private timer: ReturnType<typeof setInterval> | null = null;
  private polling: ReturnType<typeof setInterval> | null = null;
  private started = false;

  /** Cola visible: candidatos no realizados y no pospuestos, el que vence primero al frente. */
  readonly queue = computed<CheckoutAlert[]>(() => {
    const now = this.tick();
    const done = this.done();
    const snooze = this.snooze();
    return this.candidates()
      .filter((a) => !done[a.key])
      .filter((a) => !(snooze[a.key] && snooze[a.key] > now))
      .sort((a, b) => a.plannedMs - b.plannedMs);
  });

  /** Aviso mostrado (frente de la cola) o null. */
  readonly current = computed<CheckoutAlert | null>(() => this.queue()[0] ?? null);
  readonly pendingCount = computed(() => this.queue().length);
  /** Señal de reloj para que el componente actualice la cuenta regresiva. */
  readonly nowMs = this.tick.asReadonly();

  /** Arranca el sondeo (idempotente). Se llama una vez desde el shell. */
  start(): void {
    if (this.started) return;
    this.started = true;
    // Reloj: reevalúa snooze y cuenta regresiva cada segundo.
    this.timer = setInterval(() => this.tick.set(Date.now()), 1000);
    // Sondeo del mapa.
    this.poll();
    this.polling = setInterval(() => this.poll(), POLL_MS);
    // Re-sondea cuando cambia la sucursal activa.
    toObservable(this.auth.activeBranchId).subscribe(() => this.poll());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.polling) clearInterval(this.polling);
    this.timer = this.polling = null;
    this.started = false;
  }

  /** Marca "Llamada realizada": no vuelve a aparecer (persiste a refresh). */
  markDone(key: string): void {
    const next = { ...this.done(), [key]: true as const };
    this.done.set(next);
    writeJson(DONE_KEY, next);
  }

  /** Pospone 2 min: deja pasar los demás avisos y reaparece luego. */
  snoozeAlert(key: string): void {
    const next = { ...this.snooze(), [key]: Date.now() + SNOOZE_MIN * 60_000 };
    this.snooze.set(next);
    writeJson(SNOOZE_KEY, next);
  }

  /** Solo recepción/administración y con sucursal activa. */
  private enabled(): boolean {
    return !!this.auth.activeBranchId() && this.auth.can('operations', 'view');
  }

  private poll(): void {
    if (!this.enabled()) {
      this.candidates.set([]);
      return;
    }
    this.http.get<ApiResponse<RoomMapItem[]>>(`${this.api}/rooms/map`).subscribe({
      next: (res) => this.rebuild(res.data ?? []),
      error: () => {
        /* error transitorio de red: conserva la cola actual hasta el próximo sondeo */
      },
    });
  }

  private rebuild(rooms: RoomMapItem[]): void {
    const now = Date.now();
    const leadMs = LEAD_MIN * 60_000;
    const alerts: CheckoutAlert[] = [];
    const liveKeys = new Set<string>();

    for (const r of rooms) {
      const stay = r.activeStay;
      if (r.status !== 'OCCUPIED' || !stay?.plannedCheckoutAt) continue;
      const plannedMs = new Date(stay.plannedCheckoutAt).getTime();
      if (Number.isNaN(plannedMs)) continue;
      const key = `${stay.id}:${plannedMs}`;
      liveKeys.add(key);
      // Dispara desde −15 min; el aviso persiste aunque la habitación ya haya vencido.
      if (now >= plannedMs - leadMs) {
        alerts.push({
          key,
          stayId: stay.id,
          roomNumber: r.number,
          guestName: stay.guestName ?? '',
          plannedCheckoutAt: stay.plannedCheckoutAt,
          plannedMs,
        });
      }
    }

    // Poda: quita done/snooze de estancias que ya no están en el mapa
    // (check-out o renovación → nueva key), para no acumular basura en localStorage.
    this.prune(this.done, DONE_KEY, liveKeys);
    this.prune(this.snooze, SNOOZE_KEY, liveKeys);
    this.candidates.set(alerts);
    this.tick.set(now);
  }

  private prune<T extends Record<string, unknown>>(
    sig: ReturnType<typeof signal<T>>,
    storageKey: string,
    liveKeys: Set<string>,
  ): void {
    const cur = sig();
    const next = Object.fromEntries(Object.entries(cur).filter(([k]) => liveKeys.has(k))) as T;
    if (Object.keys(next).length !== Object.keys(cur).length) {
      sig.set(next);
      writeJson(storageKey, next);
    }
  }
}
