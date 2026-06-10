import type { BiometricDevice, Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { recordAttendance } from '../attendance/attendance.repository';
import { biometricsRepository } from './biometrics.repository';
import * as bridge from './biometric-bridge';
import type { CreateDeviceDto, EnrollDto, UpdateDeviceDto } from './biometrics.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

function serializeDevice(d: BiometricDevice) {
  return { ...d, realtimeActive: bridge.isRealtimeActive(d.id) };
}

/**
 * Resolves a biometric mark to a system user and records IN/OUT (toggled from
 * the user's last mark). Bound per device into the real-time listener.
 */
async function handleMark(device: BiometricDevice, deviceUserId: string): Promise<void> {
  const enrollment = await biometricsRepository.findEnrollment(device.id, deviceUserId);
  if (!enrollment) {
    logger.warn(`Biometric mark for unmapped deviceUserId=${deviceUserId} on device ${device.id}`);
    return;
  }
  const last = await prisma.attendance.findFirst({
    where: { branchId: device.branchId, userId: enrollment.userId },
    orderBy: { at: 'desc' },
  });
  const type = last?.type === 'IN' ? 'OUT' : 'IN';
  await recordAttendance({
    branchId: device.branchId,
    userId: enrollment.userId,
    type,
    source: 'BIOMETRIC',
    deviceId: device.id,
  });
}

export const biometricsService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.BiometricDeviceWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      biometricsRepository.listDevices({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      biometricsRepository.countDevices(where),
    ]);
    return { items: rows.map(serializeDevice), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const d = await biometricsRepository.findDevice(id);
    if (!d || d.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Dispositivo no encontrado');
    return d;
  },

  create(scope: RequestScope, dto: CreateDeviceDto) {
    const branchId = requireActiveBranch(scope);
    return biometricsRepository.createDevice({
      branchId,
      name: dto.name,
      ip: dto.ip,
      port: dto.port,
      notes: dto.notes || null,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateDeviceDto) {
    await this.getEntity(scope, id);
    return biometricsRepository.updateDevice(id, {
      name: dto.name,
      ip: dto.ip,
      port: dto.port,
      notes: dto.notes === '' ? null : dto.notes,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    await bridge.stopRealtime(id);
    return biometricsRepository.deleteDevice(id);
  },

  /** Tests TCP connectivity to the reader and updates its status. */
  async test(scope: RequestScope, id: string) {
    const device = await this.getEntity(scope, id);
    try {
      const info = await bridge.testConnection(device.ip, device.port);
      await biometricsRepository.updateDevice(id, { status: 'online', lastSyncAt: new Date() });
      return { ok: true, info };
    } catch (err) {
      await biometricsRepository.updateDevice(id, { status: 'error' });
      throw new ValidationError(`No se pudo conectar al dispositivo (${device.ip}:${device.port})`, {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async connect(scope: RequestScope, id: string) {
    const device = await this.getEntity(scope, id);
    try {
      await bridge.startRealtime(device.id, device.ip, device.port, (duid) => handleMark(device, duid));
      return serializeDevice(await biometricsRepository.updateDevice(id, { status: 'online', lastSyncAt: new Date() }));
    } catch (err) {
      await biometricsRepository.updateDevice(id, { status: 'error' });
      throw new ValidationError('No se pudo iniciar la escucha en tiempo real', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async disconnect(scope: RequestScope, id: string) {
    const device = await this.getEntity(scope, id);
    await bridge.stopRealtime(device.id);
    return serializeDevice(await biometricsRepository.updateDevice(id, { status: 'offline' }));
  },

  // ── Enrollment ──
  async enrollments(scope: RequestScope, deviceId: string) {
    await this.getEntity(scope, deviceId);
    return biometricsRepository.listEnrollments(deviceId);
  },

  async enroll(scope: RequestScope, deviceId: string, dto: EnrollDto) {
    const branchId = requireActiveBranch(scope);
    const device = await this.getEntity(scope, deviceId);

    const user = await prisma.user.findUnique({ where: { id: dto.userId }, include: { branches: true } });
    if (!user || !user.branches.some((b) => b.branchId === branchId)) {
      throw new ValidationError('El usuario no pertenece a la sucursal');
    }
    if (await biometricsRepository.findEnrollment(deviceId, dto.deviceUserId)) {
      throw new ConflictError('Ese ID de usuario del dispositivo ya está enrolado');
    }

    // Best-effort push to the physical device (ignored if unreachable).
    try {
      await bridge.pushUser(device.ip, device.port, dto.deviceUserId, dto.name || user.name);
    } catch (err) {
      logger.warn({ err }, 'No se pudo enrolar en el dispositivo físico; se guarda el mapeo igualmente');
    }

    return biometricsRepository.createEnrollment({
      deviceId,
      userId: dto.userId,
      deviceUserId: dto.deviceUserId,
      name: dto.name || user.name,
    });
  },

  async removeEnrollment(scope: RequestScope, deviceId: string, enrollmentId: string) {
    await this.getEntity(scope, deviceId);
    const enrollment = await biometricsRepository.findEnrollmentById(enrollmentId);
    if (!enrollment || enrollment.deviceId !== deviceId) throw new NotFoundError('Enrolamiento no encontrado');
    return biometricsRepository.deleteEnrollment(enrollmentId);
  },
};
