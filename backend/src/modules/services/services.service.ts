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

    // El saldo no pagado ya queda como venta OPEN atada a la estancia (no se duplica en balanceDue,
    // que se reserva para recargos sin venta: early check-in / late check-out).
    const owed = round(Number(sale.total) - Number(sale.paid));

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
    const [rooms, linen] = await Promise.all([
      prisma.room.findMany({ where: { id: { in: roomIds } }, include: { roomType: { select: { name: true } } } }),
      prisma.linenItem.findMany({ where: { branchId, status: 'active' }, select: { name: true, type: true } }),
    ]);
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sábana', EDREDON: 'Edredón', AMENITY: 'Amenity' };
    const categoryOf = (desc: string): string => {
      const li = linen.find((l) => desc.toUpperCase().includes(l.name.toUpperCase()) || l.name.toUpperCase().includes(desc.toUpperCase()));
      return li ? (TYPE_LABEL[li.type] ?? li.type) : 'Suministro';
    };
    return rows.map((r) => {
      const room = roomMap.get(r.roomId);
      return {
        id: r.id,
        roomId: r.roomId,
        room: room?.number ?? '—',
        floor: room?.floor ?? null,
        roomType: room?.roomType?.name ?? '',
        description: r.description,
        category: categoryOf(r.description),
        quantity: r.quantity,
        status: r.status,
        createdAt: r.createdAt,
        deliveredAt: r.deliveredAt,
      };
    });
  },

  /**
   * Limpieza confirma la entrega de un suministro pendiente: marca DELIVERED y descuenta
   * del inventario correspondiente (ropa del piso si el ítem coincide con un linen item).
   */
  async deliver(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const supply = await prisma.roomSupply.findUnique({ where: { id } });
    if (!supply || supply.branchId !== branchId) throw new ValidationError('Suministro no encontrado');
    if (supply.status === 'DELIVERED') return supply;

    const room = await prisma.room.findUnique({ where: { id: supply.roomId }, select: { floor: true, tower: true, number: true } });
    // El floor del LinenStock === nombre del subalmacén que cubre la habitación (= room.tower),
    // NO el dígito room.floor. Se resuelve por cobertura y cae a tower/floor.
    const cover = await prisma.subWarehouseRoom.findFirst({ where: { branchId, roomId: supply.roomId }, include: { subWarehouse: { select: { name: true } } } });
    const floor = cover?.subWarehouse?.name ?? room?.tower ?? room?.floor ?? null;
    // Resuelve el ítem de ropa por nombre para descontar del remanente del piso.
    const linen = await prisma.linenItem.findMany({ where: { branchId, status: 'active' }, select: { id: true, name: true } });
    const item = linen.find((l) => supply.description.toUpperCase().includes(l.name.toUpperCase()) || l.name.toUpperCase().includes(supply.description.toUpperCase()));

    await prisma.$transaction(async (tx) => {
      if (item && floor) {
        const stock = await tx.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId: item.id, floor } } });
        // Descuenta del disponible (REM + SUM), primero de SUM (suministrado en el turno).
        const avail = (stock?.rem ?? 0) + (stock?.sum ?? 0);
        const dec = Math.min(supply.quantity, avail);
        if (dec > 0) {
          const fromSum = Math.min(stock?.sum ?? 0, dec);
          const fromRem = dec - fromSum;
          await tx.linenStock.update({ where: { linenItemId_floor: { linenItemId: item.id, floor } }, data: { sum: { decrement: fromSum }, rem: { decrement: fromRem } } });
        }
        await tx.linenMovement.create({
          data: { branchId, linenItemId: item.id, type: 'SUPPLY', quantity: -supply.quantity, floor, areaFrom: `Piso ${floor}`, areaTo: `Hab. ${room?.number ?? ''}`.trim(), reference: 'Entrega de suministro a habitación', createdByUserId: scope.userId },
        });
      }
      await tx.roomSupply.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
    });
    return { ok: true };
  },

  /** Limpieza rechaza la entrega de un suministro (no entregado). */
  async reject(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const supply = await prisma.roomSupply.findUnique({ where: { id } });
    if (!supply || supply.branchId !== branchId) throw new ValidationError('Suministro no encontrado');
    return prisma.roomSupply.update({ where: { id }, data: { status: 'REJECTED' } });
  },
};
