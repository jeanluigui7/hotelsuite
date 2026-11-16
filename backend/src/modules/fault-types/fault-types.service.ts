import type { FaultType, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { faultTypesRepository } from './fault-types.repository';
import type { CreateFaultTypeDto, UpdateFaultTypeDto } from './fault-types.schema';

/** Catálogo GLOBAL de fallas (no lleva sucursalId): compartido por Recepción y Limpieza. */
export const faultTypesService = {
  async list(params: PaginationParams, status?: string, severity?: string) {
    const where: Prisma.FaultTypeWhereInput = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (params.search) {
      where.OR = [
        { label: { contains: params.search } },
        { categoryLabel: { contains: params.search } },
      ];
    }
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      faultTypesRepository.list({
        where,
        skip,
        take,
        orderBy: [{ categoryLabel: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
      faultTypesRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  /** Árbol agrupado por categoría (para el modal "Reportar falla"). Solo activas por defecto. */
  async catalog(onlyActive = true) {
    const rows = await faultTypesRepository.all(onlyActive);
    const byCat = new Map<string, { category: string; categoryLabel: string; fallas: FaultType[] }>();
    for (const r of rows) {
      let g = byCat.get(r.category);
      if (!g) {
        g = { category: r.category, categoryLabel: r.categoryLabel, fallas: [] };
        byCat.set(r.category, g);
      }
      g.fallas.push(r);
    }
    return Array.from(byCat.values()).map((g) => ({
      category: g.category,
      categoryLabel: g.categoryLabel,
      fallas: g.fallas.map((f) => ({ id: f.id, label: f.label, severity: f.severity })),
    }));
  },

  async getById(id: string) {
    const item = await faultTypesRepository.findById(id);
    if (!item) throw new NotFoundError('Falla no encontrada');
    return item;
  },

  async create(dto: CreateFaultTypeDto) {
    const dup = await faultTypesRepository.findFirst({ category: dto.category, label: dto.label });
    if (dup) throw new ConflictError('Ya existe una falla con esa categoría y nombre');
    return faultTypesRepository.create({
      category: dto.category,
      categoryLabel: dto.categoryLabel,
      label: dto.label,
      severity: dto.severity,
      status: dto.status,
      sortOrder: dto.sortOrder ?? 0,
    });
  },

  async update(id: string, dto: UpdateFaultTypeDto) {
    await this.getById(id);
    if (dto.category && dto.label) {
      const dup = await faultTypesRepository.findFirst({ category: dto.category, label: dto.label });
      if (dup && dup.id !== id) throw new ConflictError('Ya existe una falla con esa categoría y nombre');
    }
    return faultTypesRepository.update(id, {
      category: dto.category,
      categoryLabel: dto.categoryLabel,
      label: dto.label,
      severity: dto.severity,
      status: dto.status,
      sortOrder: dto.sortOrder,
    });
  },

  async remove(id: string) {
    await this.getById(id);
    return faultTypesRepository.delete(id);
  },
};
