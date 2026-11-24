import type { BiometricDevice } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { NotFoundError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import type { RequestScope } from '../../shared/context';
import { recordAttendance } from '../attendance/attendance.repository';
import { fpAuthStore } from '../fingerprint-login/fp-auth.store';
import { biometricsRepository } from './biometrics.repository';

/**
 * Receptor del protocolo PUSH / ADMS de ZKTeco (iclock). El huellero se conecta hacia AFUERA
 * (hacia este servidor en la nube) y empuja sus marcas por HTTP: así funciona detrás de NAT/DHCP en
 * cualquier red del hotel sin que el servidor deba alcanzar la IP LAN del equipo. No usamos JWT: el
 * equipo se identifica por su número de serie (SN), que un administrador VINCULA a un dispositivo.
 *
 * Endpoints que habla el equipo (bajo /api, servidos por Caddy):
 *   GET  /api/iclock/cdata?SN=..&options=all   -> handshake (opciones)
 *   POST /api/iclock/cdata?SN=..&table=ATTLOG   -> marcas (texto, tab-separado) -> "OK: n"
 *   GET  /api/iclock/getrequest?SN=..           -> comandos (respondemos "OK")
 *   POST /api/iclock/devicecmd?SN=..            -> resultados -> "OK"
 */

const SERIAL_PREFIX = 'biometrics.adms.serial.';
const SERIAL_KEY = (deviceId: string): string => `${SERIAL_PREFIX}${deviceId}`;
const SEEN_KEY = (deviceId: string): string => `biometrics.adms.seen.${deviceId}`;
// Interpretar la tecla ENTRADA/SALIDA (col 3 del ATTLOG) en vez de alternar. Off por defecto: se activa
// desde el panel SOLO tras verificar que el equipo realmente envía el estado (si no, todo saldría IN).
const STATE_KEY = (deviceId: string): string => `biometrics.adms.state.${deviceId}`;

// Dirección del servidor que el administrador debe cargar en el huellero (ADMS). El equipo le añade
// /iclock/... — como va bajo /api, Caddy lo proxya al backend sin cambios de infraestructura.
export const ADMS_SERVER_ADDRESS = 'rizzoshospedaje.com/api';

// Zona horaria del equipo (Perú UTC-5): el huellero envía hora local; se convierte al instante correcto.
const DEVICE_TZ_OFFSET = '-05:00';

// Último SN visto sin vincular (en memoria): el admin lo "reclama" desde el panel. Efímero a propósito;
// el equipo re-anuncia su SN en segundos tras un reinicio del backend.
let lastUnclaimed: { serial: string; at: string } | null = null;

async function getSetting(branchId: string, key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
  return s?.value ?? null;
}
async function setSetting(branchId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { branchId_key: { branchId, key } }, update: { value }, create: { branchId, key, value } });
}

/** Dispositivo vinculado a un número de serie (busca el Setting serial.<deviceId> == SN). */
async function deviceForSerial(sn: string): Promise<BiometricDevice | null> {
  const clean = sn.trim();
  if (!clean) return null;
  const s = await prisma.setting.findFirst({ where: { key: { startsWith: SERIAL_PREFIX }, value: clean } });
  if (!s) return null;
  return biometricsRepository.findDevice(s.key.slice(SERIAL_PREFIX.length));
}

async function markSeen(device: BiometricDevice): Promise<void> {
  await setSetting(device.branchId, SEEN_KEY(device.id), new Date().toISOString());
  await biometricsRepository.updateDevice(device.id, { status: 'online', lastSyncAt: new Date() }).catch(() => undefined);
}

/** Convierte "YYYY-MM-DD HH:MM:SS" (hora local del equipo) al instante correcto (Date). */
function parseDeviceTime(s: string): Date {
  const iso = s.trim().replace(' ', 'T');
  const d = new Date(`${iso}${DEVICE_TZ_OFFSET}`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Bloque de opciones del handshake (texto plano, una por línea). Realtime=1 → empuje en vivo.
 *  No enviamos TimeZone para NO alterar el reloj del equipo (la hora se interpreta al recibir). */
function handshakeBody(sn: string): string {
  return [
    `GET OPTION FROM: ${sn}`,
    'ErrorDelay=30',
    'Delay=30',
    'TransTimes=00:00;23:59',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog',
    'Realtime=1',
    'Encrypt=0',
  ].join('\n') + '\n';
}

export const biometricsAdmsService = {
  ADMS_SERVER_ADDRESS,

  /** (Equipo) Handshake GET /iclock/cdata. Devuelve las opciones; registra SN visto. */
  async handshake(sn: string): Promise<string> {
    const device = await deviceForSerial(sn);
    if (device) await markSeen(device);
    else { lastUnclaimed = { serial: sn.trim(), at: new Date().toISOString() }; logger.info(`ADMS: handshake de SN ${sn} (sin vincular)`); }
    return handshakeBody(sn);
  },

  /** (Equipo) Subida de datos POST /iclock/cdata. Solo ATTLOG registra asistencia; el resto se ACK. */
  async upload(sn: string, table: string, body: string): Promise<string> {
    const device = await deviceForSerial(sn);
    if (!device) { lastUnclaimed = { serial: sn.trim(), at: new Date().toISOString() }; return 'OK'; }
    await markSeen(device);
    if ((table || '').toUpperCase() !== 'ATTLOG') return 'OK';

    const lines = (body || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const useState = (await getSetting(device.branchId, STATE_KEY(device.id))) === 'on';
    let recorded = 0;
    let authConsumed = 0;
    for (const line of lines) {
      const cols = line.split('\t');
      const pin = (cols[0] ?? '').trim();
      const when = (cols[1] ?? '').trim();
      if (!pin || !when) continue;
      const stateRaw = (cols[2] ?? '').trim();
      const at = parseDeviceTime(when);
      const enrollment = await biometricsRepository.findEnrollment(device.id, pin);
      if (!enrollment) { logger.warn(`ADMS: PIN ${pin} sin enrolar en device ${device.id}`); continue; }

      // ¿Esta marca responde a una solicitud de AUTENTICACIÓN por huella (login/logout)? Si es así, NO
      // genera asistencia: la huella se usó para autenticar la operación del PMS (flujo de 4 huellas).
      const consumed = fpAuthStore.consumeForMark(enrollment.userId, device.id);
      if (consumed) {
        authConsumed++;
        logger.info(`ADMS: marca de usuario ${enrollment.userId} usada como AUTENTICACIÓN (${consumed}); sin asistencia.`);
        continue;
      }

      const dup = await prisma.attendance.findFirst({ where: { branchId: device.branchId, userId: enrollment.userId, deviceId: device.id, at } });
      if (dup) continue;
      // Tipo: si el equipo envía la tecla ENTRADA/SALIDA (col 3) y está habilitado, se respeta; si no, se
      // alterna respecto a la última marca. El estado crudo se registra siempre para poder verificarlo.
      let type: 'IN' | 'OUT';
      if (useState && (stateRaw === '0' || stateRaw === '1')) {
        type = stateRaw === '0' ? 'IN' : 'OUT';
      } else {
        const last = await prisma.attendance.findFirst({ where: { branchId: device.branchId, userId: enrollment.userId }, orderBy: { at: 'desc' } });
        type = last?.type === 'IN' ? 'OUT' : 'IN';
      }
      logger.info(`ADMS: asistencia pin=${pin} estado="${stateRaw}" → ${type}${useState ? ' (por tecla)' : ' (alternado)'}`);
      await recordAttendance({ branchId: device.branchId, userId: enrollment.userId, type, source: 'BIOMETRIC', deviceId: device.id, at });
      recorded++;
    }
    logger.info(`ADMS: ${device.id} subió ${lines.length} línea(s) ATTLOG, ${recorded} asistencia(s), ${authConsumed} autenticación(es).`);
    return `OK: ${recorded}`;
  },

  /** (Equipo) Sondeo de comandos GET /iclock/getrequest. No enviamos comandos → "OK". */
  async getrequest(sn: string): Promise<string> {
    const device = await deviceForSerial(sn);
    if (device) await markSeen(device);
    return 'OK';
  },

  // ── Panel (administración) ──
  /** Estado ADMS de un dispositivo: SN vinculado, última señal, dirección a cargar y SN detectado. */
  async status(scope: RequestScope, deviceId: string): Promise<{ serial: string | null; lastSeen: string | null; serverAddress: string; detected: { serial: string; at: string } | null; useState: boolean }> {
    const branchId = requireActiveBranch(scope);
    const device = await biometricsRepository.findDevice(deviceId);
    if (!device || device.branchId !== branchId) throw new NotFoundError('Dispositivo no encontrado');
    const [serial, seen, state] = await Promise.all([
      getSetting(branchId, SERIAL_KEY(deviceId)),
      getSetting(branchId, SEEN_KEY(deviceId)),
      getSetting(branchId, STATE_KEY(deviceId)),
    ]);
    return { serial, lastSeen: seen, serverAddress: ADMS_SERVER_ADDRESS, detected: lastUnclaimed, useState: state === 'on' };
  },

  /** Activa/desactiva la lectura de la tecla ENTRADA/SALIDA (col 3 del ATTLOG) para ese equipo. */
  async setStateMode(scope: RequestScope, deviceId: string, on: boolean): Promise<{ useState: boolean }> {
    const branchId = requireActiveBranch(scope);
    const device = await biometricsRepository.findDevice(deviceId);
    if (!device || device.branchId !== branchId) throw new NotFoundError('Dispositivo no encontrado');
    await setSetting(branchId, STATE_KEY(deviceId), on ? 'on' : 'off');
    return { useState: on };
  },

  /** Vincula un número de serie a un dispositivo (el admin lo reclama). */
  async bindSerial(scope: RequestScope, deviceId: string, serial: string): Promise<{ serial: string }> {
    const branchId = requireActiveBranch(scope);
    const device = await biometricsRepository.findDevice(deviceId);
    if (!device || device.branchId !== branchId) throw new NotFoundError('Dispositivo no encontrado');
    const clean = serial.trim();
    await setSetting(branchId, SERIAL_KEY(deviceId), clean);
    if (lastUnclaimed && lastUnclaimed.serial === clean) lastUnclaimed = null;
    return { serial: clean };
  },
};
