/* eslint-disable @typescript-eslint/no-explicit-any */
// Thin wrapper around the (untyped) zkteco-js SDK. Every device call is guarded:
// the reader is a network device (TCP 4370) that may be unreachable in dev.
import ZKLib from 'zkteco-js';
import { logger } from '../../config/logger';

export type MarkHandler = (deviceUserId: string) => Promise<void> | void;

const TIMEOUT = 5200;
const INPORT = 5200;

/** Active real-time listeners, keyed by deviceId. */
const active = new Map<string, any>();

function makeClient(ip: string, port: number): any {
  return new ZKLib(ip, port, TIMEOUT, INPORT);
}

/** Connects, reads basic info and disconnects. Throws on failure. */
export async function testConnection(ip: string, port: number): Promise<{ serial?: string; name?: string }> {
  const zk = makeClient(ip, port);
  await zk.createSocket();
  const result: { serial?: string; name?: string } = {};
  try {
    result.serial = await zk.getSerialNumber();
  } catch {
    /* optional */
  }
  try {
    result.name = await zk.getDeviceName();
  } catch {
    /* optional */
  }
  await zk.disconnect();
  return result;
}

/** Enrolls/updates a user on the device (best-effort). */
export async function pushUser(ip: string, port: number, deviceUserId: string, name: string): Promise<void> {
  const zk = makeClient(ip, port);
  await zk.createSocket();
  try {
    await zk.setUser(Number(deviceUserId) || 0, String(deviceUserId), name, '', 0, '0');
  } finally {
    await zk.disconnect();
  }
}

/** Starts the real-time attendance listener for a device. */
export async function startRealtime(
  deviceId: string,
  ip: string,
  port: number,
  onMark: MarkHandler,
): Promise<void> {
  if (active.has(deviceId)) return;
  const zk = makeClient(ip, port);
  await zk.createSocket();
  await zk.getRealTimeLogs((data: any) => {
    const deviceUserId = String(data?.user_id ?? data?.userId ?? data?.deviceUserId ?? '').trim();
    if (deviceUserId) {
      Promise.resolve(onMark(deviceUserId)).catch((err) =>
        logger.error({ err }, 'biometric mark handling failed'),
      );
    }
  });
  active.set(deviceId, zk);
  logger.info(`Biometric real-time listener started for device ${deviceId}`);
}

export async function stopRealtime(deviceId: string): Promise<void> {
  const zk = active.get(deviceId);
  if (!zk) return;
  try {
    await zk.disconnect();
  } catch {
    /* ignore */
  }
  active.delete(deviceId);
}

export function isRealtimeActive(deviceId: string): boolean {
  return active.has(deviceId);
}
