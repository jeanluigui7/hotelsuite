import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const whatsappRepository = {
  // ── Instances ──
  listInstances(branchId: string) {
    return prisma.whatsAppInstance.findMany({ where: { branchId }, orderBy: { name: 'asc' } });
  },
  findInstance(id: string) {
    return prisma.whatsAppInstance.findUnique({ where: { id } });
  },
  createInstance(data: Prisma.WhatsAppInstanceUncheckedCreateInput) {
    return prisma.whatsAppInstance.create({ data });
  },
  updateInstance(id: string, data: Prisma.WhatsAppInstanceUncheckedUpdateInput) {
    return prisma.whatsAppInstance.update({ where: { id }, data });
  },
  deleteInstance(id: string) {
    return prisma.whatsAppInstance.delete({ where: { id } });
  },

  // ── Templates ──
  listTemplates(branchId: string) {
    return prisma.messageTemplate.findMany({ where: { branchId }, orderBy: { name: 'asc' } });
  },
  findTemplate(id: string) {
    return prisma.messageTemplate.findUnique({ where: { id } });
  },
  createTemplate(data: Prisma.MessageTemplateUncheckedCreateInput) {
    return prisma.messageTemplate.create({ data });
  },
  updateTemplate(id: string, data: Prisma.MessageTemplateUncheckedUpdateInput) {
    return prisma.messageTemplate.update({ where: { id }, data });
  },
  deleteTemplate(id: string) {
    return prisma.messageTemplate.delete({ where: { id } });
  },

  // ── Logs ──
  listLogs(branchId: string, take: number) {
    return prisma.messageLog.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' }, take });
  },
  createLog(data: Prisma.MessageLogUncheckedCreateInput) {
    return prisma.messageLog.create({ data });
  },
};
