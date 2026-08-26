import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { staysService } from '../stays/stays.service';
import { masterFoliosRepository, type MasterFolioWithStays } from './master-folios.repository';
import type { CreateMasterFolioDto, UpdateMasterFolioDto } from './master-folios.schema';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function serialize(m: MasterFolioWithStays) {
  return {
    id: m.id,
    code: m.code,
    payerName: m.payerName,
    payerDoc: m.payerDoc,
    payerRuc: m.payerRuc,
    payerAddress: m.payerAddress,
    status: m.status,
    notes: m.notes,
    stayCount: m.stays.length,
    createdAt: m.createdAt,
  };
}

export const masterFoliosService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.MasterFolioWhereInput = { branchId };
    if (params.search) {
      where.OR = [
        { code: { contains: params.search } },
        { payerName: { contains: params.search } },
        { payerRuc: { contains: params.search } },
        { payerDoc: { contains: params.search } },
      ];
    }
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      masterFoliosRepository.list({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      masterFoliosRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async detail(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    const stayIds = master.stays.map((s) => s.stayId);
    const summaries = await staysService.folioSummaries(scope, stayIds);
    const totals = summaries.reduce(
      (acc, s) => ({
        total: round2(acc.total + s.total),
        paid: round2(acc.paid + s.paid),
        pending: round2(acc.pending + s.pending),
        invoiced: round2(acc.invoiced + s.invoiced),
      }),
      { total: 0, paid: 0, pending: 0, invoiced: 0 },
    );
    return { ...serialize(master), payer: { name: master.payerName, doc: master.payerDoc, ruc: master.payerRuc, address: master.payerAddress }, stays: summaries, totals };
  },

  async create(scope: RequestScope, dto: CreateMasterFolioDto) {
    const branchId = requireActiveBranch(scope);
    const created = await masterFoliosRepository.create({
      branchId,
      payerName: dto.payerName.trim(),
      payerDoc: dto.payerDoc?.trim() || null,
      payerRuc: dto.payerRuc?.trim() || null,
      payerAddress: dto.payerAddress?.trim() || null,
      notes: dto.notes?.trim() || null,
      createdByUserId: scope.userId,
    });
    return serialize(created);
  },

  async update(scope: RequestScope, id: string, dto: UpdateMasterFolioDto) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    const data: Prisma.MasterFolioUpdateInput = {};
    if (dto.payerName !== undefined) data.payerName = dto.payerName.trim();
    if (dto.payerDoc !== undefined) data.payerDoc = dto.payerDoc.trim() || null;
    if (dto.payerRuc !== undefined) data.payerRuc = dto.payerRuc.trim() || null;
    if (dto.payerAddress !== undefined) data.payerAddress = dto.payerAddress.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    return serialize(await masterFoliosRepository.update(id, data));
  },

  async addStay(scope: RequestScope, id: string, stayId: string) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    const stay = await prisma.stay.findUnique({ where: { id: stayId }, select: { branchId: true } });
    if (!stay || stay.branchId !== branchId) throw new ValidationError('Estancia inválida');
    const existing = await masterFoliosRepository.findStayLink(stayId);
    if (existing) {
      if (existing.masterFolioId === id) throw new ConflictError('La estancia ya está en este folio maestro');
      throw new ConflictError('La estancia ya pertenece a otro folio maestro');
    }
    await masterFoliosRepository.addStay(id, stayId);
    return this.detail(scope, id);
  },

  async removeStay(scope: RequestScope, id: string, stayId: string) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    await masterFoliosRepository.removeStay(id, stayId);
    return this.detail(scope, id);
  },
};
