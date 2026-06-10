import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const biometricsRepository = {
  // ── Devices ──
  listDevices(args: {
    where: Prisma.BiometricDeviceWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.BiometricDeviceOrderByWithRelationInput;
  }) {
    return prisma.biometricDevice.findMany(args);
  },
  countDevices(where: Prisma.BiometricDeviceWhereInput) {
    return prisma.biometricDevice.count({ where });
  },
  findDevice(id: string) {
    return prisma.biometricDevice.findUnique({ where: { id } });
  },
  createDevice(data: Prisma.BiometricDeviceUncheckedCreateInput) {
    return prisma.biometricDevice.create({ data });
  },
  updateDevice(id: string, data: Prisma.BiometricDeviceUncheckedUpdateInput) {
    return prisma.biometricDevice.update({ where: { id }, data });
  },
  deleteDevice(id: string) {
    return prisma.biometricDevice.delete({ where: { id } });
  },

  // ── Enrollments ──
  listEnrollments(deviceId: string) {
    return prisma.deviceEnrollment.findMany({ where: { deviceId }, orderBy: { createdAt: 'desc' } });
  },
  findEnrollment(deviceId: string, deviceUserId: string) {
    return prisma.deviceEnrollment.findUnique({
      where: { deviceId_deviceUserId: { deviceId, deviceUserId } },
    });
  },
  findEnrollmentById(id: string) {
    return prisma.deviceEnrollment.findUnique({ where: { id } });
  },
  createEnrollment(data: Prisma.DeviceEnrollmentUncheckedCreateInput) {
    return prisma.deviceEnrollment.create({ data });
  },
  deleteEnrollment(id: string) {
    return prisma.deviceEnrollment.delete({ where: { id } });
  },
};
