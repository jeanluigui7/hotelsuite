import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { PAYMENT_METHODS } from '../../shared/payments';
import { salesService } from '../sales/sales.service';

/** Servicios y penalidades: cobro de servicios/artículos a una habitación ocupada,
 *  con Pago Total/Parcial/Adeudo (el saldo no cubierto va al adeudo de la estancia),
 *  generando opcionalmente un suministro pendiente para que limpieza lo entregue. */

const chargeItem = z
  .object({
    productId: z.string().min(1).optional(),
    description: z.string().max(200).optional(),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().min(0).optional(),
  })
  .refine((v) => v.productId || (v.description && v.unitPrice !== undefined), {
    message: 'Cada ítem requiere producto, o descripción y precio',
  });

export const chargeSchema = z.object({
  stayId: z.string().min(1),
  items: z.array(chargeItem).min(1, 'Agregue al menos un ítem'),
  payments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        amount: z.coerce.number().positive(),
        reference: z.string().max(120).optional().or(z.literal('')),
      }),
    )
    .default([]),
  createSupply: z.boolean().default(true),
});
export type ChargeDto = z.infer<typeof chargeSchema>;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export const servicesService = {
  /** Catálogo de servicios agrupado por subcategoría (Item kind=SERVICE). */
  async catalog(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const items = await prisma.item.findMany({
      where: { branchId, kind: 'SERVICE', status: 'active' },
      orderBy: [{ subcategory: 'asc' }, { name: 'asc' }],
    });
    const groups = new Map<string, { id: string; name: string; price: number | null }[]>();
    for (const it of items) {
      const key = it.subcategory || 'General';
      const arr = groups.get(key) ?? [];
      arr.push({ id: it.id, name: it.name, price: it.price != null ? Number(it.price) : null });
      groups.set(key, arr);
    }
    return [...groups.entries()].map(([subcategory, services]) => ({ subcategory, services }));
  },

  /** Cobra el servicio/artículos a la estancia y genera suministro pendiente. */
  async charge(scope: RequestScope, dto: ChargeDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await prisma.stay.findUnique({ where: { id: dto.stayId } });
    if (!stay || stay.branchId !== branchId || stay.status !== 'OPEN') {
      throw new ValidationError('La estancia no está activa');
    }

    // El cobro es una venta atada a la estancia (descuenta stock si son productos).
    const sale = await salesService.create(scope, {
      stayId: dto.stayId,
      items: dto.items,
      payments: dto.payments.map((p) => ({ ...p, reference: p.reference || undefined })),
    });

    const owed = round(Number(sale.total) - Number(sale.paid));
    if (owed > 0) {
      const current = stay.balanceDue ? Number(stay.balanceDue) : 0;
      await prisma.stay.update({ where: { id: stay.id }, data: { balanceDue: round(current + owed) } });
    }

    if (dto.createSupply) {
      for (const it of dto.items) {
        await prisma.roomSupply.create({
          data: {
            branchId,
            roomId: stay.roomId,
            stayId: stay.id,
            description: it.description ?? 'Artículo',
            quantity: it.quantity,
            createdByUserId: scope.userId,
          },
        });
      }
    }

    return { sale, owed };
  },

  /** Suministros pendientes/entregados (para limpieza). */
  async supplies(scope: RequestScope, status?: string) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.roomSupply.findMany({
      where: { branchId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    const roomIds = [...new Set(rows.map((r) => r.roomId))];
    const rooms = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } });
    const roomMap = new Map(rooms.map((r) => [r.id, r.number]));
    return rows.map((r) => ({
      id: r.id,
      room: roomMap.get(r.roomId) ?? '—',
      description: r.description,
      quantity: r.quantity,
      status: r.status,
      createdAt: r.createdAt,
      deliveredAt: r.deliveredAt,
    }));
  },

  /** Limpieza confirma la entrega de un suministro pendiente. */
  async deliver(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const supply = await prisma.roomSupply.findUnique({ where: { id } });
    if (!supply || supply.branchId !== branchId) throw new ValidationError('Suministro no encontrado');
    return prisma.roomSupply.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
  },
};
