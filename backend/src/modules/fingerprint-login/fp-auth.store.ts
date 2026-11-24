import { randomBytes } from 'node:crypto';

/**
 * Almacén EN MEMORIA de solicitudes de autenticación por huella. Es efímero a propósito: una solicitud
 * vive ~35 s (más que la cuenta regresiva de 30 s del modal) y nada se persiste. Un reinicio del backend
 * cancela las solicitudes en curso (el usuario reintenta). Asume un único proceso de backend (Docker).
 *
 * La CLAVE del diseño (ver flujo de 4 huellas): el receptor ADMS, al recibir una marca, pregunta
 * `consumeForMark(userId, deviceId)`:
 *   - 'auth'   → había una solicitud PENDIENTE del usuario en ese equipo → autentica la operación y la
 *                marca NO genera asistencia.
 *   - 'swallow'→ una solicitud del usuario se resolvió hace muy poco (la huella de auth llegó algo tarde
 *                o duplicada) → se descarta SIN crear asistencia espuria.
 *   - null     → no hay solicitud → la marca es ASISTENCIA (comportamiento normal).
 */

export type FpOp = 'LOGIN' | 'LOGOUT';
export type FpStatus = 'pending' | 'authenticated' | 'consumed' | 'cancelled' | 'expired';

export interface FpRequest {
  id: string;
  userId: string;
  deviceId: string | null;
  branchId: string;
  op: FpOp;
  status: FpStatus;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
}

/** TTL del lado servidor: algo mayor que los 30 s del modal, para absorber la latencia del push ADMS. */
const TTL_MS = 35_000;
/** Ventana de gracia tras resolver: una huella de auth tardía/duplicada se descarta (no crea asistencia). */
const SWALLOW_GRACE_MS = 10_000;

const byId = new Map<string, FpRequest>();

const now = (): number => Date.now();

function expireStale(r: FpRequest): FpRequest {
  if (r.status === 'pending' && now() > r.expiresAt) {
    r.status = 'expired';
    r.resolvedAt = now();
  }
  return r;
}

function gc(): void {
  const t = now();
  for (const [id, r] of byId) {
    if (r.status !== 'pending' && r.resolvedAt && t - r.resolvedAt > SWALLOW_GRACE_MS + 5_000) byId.delete(id);
    else if (r.status === 'pending' && t > r.expiresAt + SWALLOW_GRACE_MS + 5_000) byId.delete(id);
  }
}

export const fpAuthStore = {
  /** Crea una solicitud; cancela cualquier PENDIENTE previa del mismo usuario (una activa por usuario). */
  create(input: { userId: string; deviceId: string | null; branchId: string; op: FpOp }): FpRequest {
    gc();
    for (const r of byId.values()) {
      if (r.userId === input.userId && r.status === 'pending') {
        r.status = 'cancelled';
        r.resolvedAt = now();
      }
    }
    const t = now();
    const req: FpRequest = {
      id: randomBytes(18).toString('hex'),
      userId: input.userId,
      deviceId: input.deviceId,
      branchId: input.branchId,
      op: input.op,
      status: 'pending',
      createdAt: t,
      expiresAt: t + TTL_MS,
    };
    byId.set(req.id, req);
    return req;
  },

  get(id: string): FpRequest | null {
    const r = byId.get(id);
    return r ? expireStale(r) : null;
  },

  cancel(id: string): void {
    const r = byId.get(id);
    if (r && r.status === 'pending') {
      r.status = 'cancelled';
      r.resolvedAt = now();
    }
  },

  /** El poll marca la solicitud como consumida tras entregar el resultado (una sola vez). */
  markConsumed(id: string): void {
    const r = byId.get(id);
    if (r) {
      r.status = 'consumed';
      r.resolvedAt = now();
    }
  },

  consumeForMark(userId: string, deviceId: string | null): 'auth' | 'swallow' | null {
    const t = now();
    let pending: FpRequest | null = null;
    let recent: FpRequest | null = null;
    for (const r of byId.values()) {
      if (r.userId !== userId) continue;
      if (r.deviceId && deviceId && r.deviceId !== deviceId) continue;
      expireStale(r);
      if (r.status === 'pending') pending = r;
      else if (r.resolvedAt && t - r.resolvedAt <= SWALLOW_GRACE_MS) recent = r;
    }
    if (pending) {
      pending.status = 'authenticated';
      pending.resolvedAt = t;
      return 'auth';
    }
    return recent ? 'swallow' : null;
  },
};
