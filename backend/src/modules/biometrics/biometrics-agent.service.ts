import { randomBytes, timingSafeEqual } from 'crypto';
import type { BiometricDevice } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { NotFoundError, UnauthorizedError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import type { RequestScope } from '../../shared/context';
import { recordAttendance } from '../attendance/attendance.repository';
import { fpAuthStore } from '../fingerprint-login/fp-auth.store';
import { biometricsRepository } from './biometrics.repository';
import type { IngestMark } from './biometrics.schema';

/**
 * Integración con el huellero vía AGENTE LOCAL. El backend vive en la nube y no
 * alcanza la IP LAN del equipo, así que un agente en la red del hotel lee las
 * marcas y las empuja aquí por HTTPS. Estos endpoints NO usan JWT de usuario: se
 * autentican con un token por dispositivo (guardado en Setting, sin migración).
 */

const TOKEN_KEY = (deviceId: string): string => `biometrics.agentToken.${deviceId}`;
const SEEN_KEY = (deviceId: string): string => `biometrics.agentSeen.${deviceId}`;

async function getSetting(branchId: string, key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
  return s?.value ?? null;
}
async function setSetting(branchId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { branchId_key: { branchId, key } }, update: { value }, create: { branchId, key, value } });
}

/** Comparación en tiempo constante de tokens (evita fuga por timing). */
function tokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const biometricsAgentService = {
  /** (Panel) Genera/rota el token del agente para un dispositivo. Devuelve el token UNA sola vez. */
  async generateToken(scope: RequestScope, deviceId: string): Promise<{ token: string; ingestUrl: string }> {
    const branchId = requireActiveBranch(scope);
    const device = await biometricsRepository.findDevice(deviceId);
    if (!device || device.branchId !== branchId) throw new NotFoundError('Dispositivo no encontrado');
    const token = randomBytes(24).toString('hex'); // 48 hex chars
    await setSetting(branchId, TOKEN_KEY(deviceId), token);
    return { token, ingestUrl: '/api/biometrics/ingest' };
  },

  /** (Panel) Estado del agente: si hay token configurado y la última vez que reportó. */
  async agentStatus(scope: RequestScope, deviceId: string): Promise<{ configured: boolean; lastSeen: string | null }> {
    const branchId = requireActiveBranch(scope);
    const device = await biometricsRepository.findDevice(deviceId);
    if (!device || device.branchId !== branchId) throw new NotFoundError('Dispositivo no encontrado');
    const [tok, seen] = await Promise.all([getSetting(branchId, TOKEN_KEY(deviceId)), getSetting(branchId, SEEN_KEY(deviceId))]);
    return { configured: !!tok, lastSeen: seen };
  },

  /** (Agente) Verifica el token y devuelve el dispositivo, o lanza 401. */
  async authDevice(deviceId: string, token: string): Promise<BiometricDevice> {
    const device = deviceId ? await biometricsRepository.findDevice(deviceId) : null;
    if (!device) throw new UnauthorizedError('Credenciales de agente inválidas');
    const expected = await getSetting(device.branchId, TOKEN_KEY(deviceId));
    if (!expected || !tokensMatch(token, expected)) throw new UnauthorizedError('Credenciales de agente inválidas');
    return device;
  },

  /**
   * (Agente) Ingesta de marcas. Mapea cada deviceUserId → usuario enrolado y registra la asistencia
   * alternando IN/OUT respecto a la última marca del usuario. Idempotente: descarta duplicados por
   * (usuario + dispositivo + instante). Procesa en orden cronológico para que el IN/OUT sea coherente.
   */
  async ingest(deviceId: string, token: string, marks: IngestMark[]): Promise<{ recorded: number; skipped: number }> {
    const device = await this.authDevice(deviceId, token);
    await setSetting(device.branchId, SEEN_KEY(deviceId), new Date().toISOString());

    const sorted = [...marks].sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
    let recorded = 0;
    let skipped = 0;
    for (const m of sorted) {
      const enrollment = await biometricsRepository.findEnrollment(device.id, String(m.deviceUserId).trim());
      if (!enrollment) {
        logger.warn(`Ingesta: deviceUserId=${m.deviceUserId} sin enrolar en device ${device.id}`);
        skipped++;
        continue;
      }
      // Marca que responde a una autenticación por huella (login/logout) → no genera asistencia.
      if (fpAuthStore.consumeForMark(enrollment.userId, device.id)) { skipped++; continue; }
      const at = m.at ? new Date(m.at) : new Date();
      const dup = await prisma.attendance.findFirst({ where: { branchId: device.branchId, userId: enrollment.userId, deviceId: device.id, at } });
      if (dup) { skipped++; continue; }
      const last = await prisma.attendance.findFirst({ where: { branchId: device.branchId, userId: enrollment.userId }, orderBy: { at: 'desc' } });
      const type = last?.type === 'IN' ? 'OUT' : 'IN';
      await recordAttendance({ branchId: device.branchId, userId: enrollment.userId, type, source: 'BIOMETRIC', deviceId: device.id, at });
      recorded++;
    }
    await biometricsRepository.updateDevice(device.id, { status: 'online', lastSyncAt: new Date() });
    return { recorded, skipped };
  },

  /** (Agente) Latido: marca el dispositivo "en línea" y actualiza la última señal del agente. */
  async heartbeat(deviceId: string, token: string): Promise<{ ok: true }> {
    const device = await this.authDevice(deviceId, token);
    await setSetting(device.branchId, SEEN_KEY(deviceId), new Date().toISOString());
    await biometricsRepository.updateDevice(device.id, { status: 'online', lastSyncAt: new Date() });
    return { ok: true };
  },
};
