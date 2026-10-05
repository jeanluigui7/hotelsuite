import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { PAYMENT_METHODS } from '../../shared/payments';
import { salesService } from '../sales/sales.service';
import { serviceCatalogRepository } from '../service-catalog/service-catalog.repository';

/** Servicios y penalidades (modal de recepción): cobro de servicios/penalidades/ropa adicional a una
 *  habitación ocupada, con Pago Total/Parcial/Adeudo, cortesía (precio 0) y reserva de ropa para
 *  que limpieza la entregue (el stock se descuenta UNA vez, en la entrega). */

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
function round(n: number): number { return Math.round(n * 100) / 100; }

const chargeItem = z
  .object({
    conceptId: z.string().min(1).optional(), // concepto del catálogo (servicio/penalidad/ropa/amenity)
    productId: z.string().min(1).optional(),
    description: z.string().max(200).optional(),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().min(0).optional(), // monto libre (requiere permiso) o precio directo
    isCourtesy: z.boolean().optional(),
    courtesyReason: z.string().max(200).optional(),
  })
  .refine((v) => v.conceptId || v.productId || (v.description && v.unitPrice !== undefined), {
    message: 'Cada ítem requiere un concepto, un producto, o descripción y precio',
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
  opToken: z.string().min(8).max(80).optional(),
});
export type ChargeDto = z.infer<typeof chargeSchema>;

type ConceptFull = NonNullable<Awaited<ReturnType<typeof loadConcept>>>;
function loadConcept(branchId: string, id: string) {
  return prisma.serviceConcept.findFirst({
    where: { id, branchId },
    include: { inventoryCategory: { select: { id: true, name: true, type: true } }, articles: { select: { articleId: true } }, group: { select: { category: { select: { tipo: true } } } } },
  });
}

/** Resuelve el "piso" del LinenStock de una habitación (nombre del subalmacén que la cubre). */
async function resolveFloor(branchId: string, room: { id: string; tower: string | null; floor: string | null }): Promise<string | null> {
  const cover = await prisma.subWarehouseRoom.findFirst({ where: { branchId, roomId: room.id }, include: { subWarehouse: { select: { name: true } } } });
  return cover?.subWarehouse?.name ?? room.tower ?? room.floor ?? null;
}

/** LinenItems compatibles de un concepto ROPA para un tipo de habitación (por scope + dotación tipo/tamaño). */
async function compatibleLinen(branchId: string, roomTypeId: string, concept: ConceptFull): Promise<{ id: string; name: string; size: string | null; color: string | null }[]> {
  let items: { id: string; name: string; size: string | null; color: string | null }[];
  if (concept.articleScope === 'SPECIFIC') {
    const ids = concept.articles.map((a) => a.articleId);
    items = ids.length ? await prisma.linenItem.findMany({ where: { branchId, id: { in: ids }, status: 'active' }, select: { id: true, name: true, size: true, color: true } }) : [];
  } else {
    items = concept.inventoryCategoryId
      ? await prisma.linenItem.findMany({ where: { branchId, categoryId: concept.inventoryCategoryId, status: 'active' }, select: { id: true, name: true, size: true, color: true } })
      : [];
  }
  if (!items.length) return items;
  // Compatibilidad por dotación del tipo de habitación: tipo (linenItemId) y, si no, tamaño.
  const dot = await prisma.roomTypeDotacion.findMany({ where: { branchId, roomTypeId, status: 'active' } });
  const dotIds = new Set(dot.map((d) => d.linenItemId).filter((x): x is string => !!x));
  const byId = items.filter((i) => dotIds.has(i.id));
  if (byId.length) return byId;
  const catName = concept.inventoryCategory?.name;
  const sizes = new Set(dot.filter((d) => (d.category && catName && norm(d.category) === norm(catName)) || (d.name && catName && norm(d.name).includes(norm(catName)))).map((d) => norm(d.size)).filter((s) => s));
  if (sizes.size) {
    const bySize = items.filter((i) => i.size && sizes.has(norm(i.size)));
    if (bySize.length) return bySize;
  }
  return items; // sin restricción de dotación resoluble (la calidad no se modela) → todo el tipo
}

/** Productos amenity compatibles de un concepto AMENITY. */
function compatibleAmenity(branchId: string, concept: ConceptFull) {
  if (concept.articleScope === 'SPECIFIC') {
    const ids = concept.articles.map((a) => a.articleId);
    return ids.length ? prisma.product.findMany({ where: { branchId, id: { in: ids }, status: 'active' }, select: { id: true, name: true } }) : Promise.resolve([]);
  }
  const amenity = { OR: [{ productType: 'AMENITY' }, { category: { type: 'AMENITY' } }] };
  return prisma.product.findMany({ where: { branchId, status: 'active', ...(concept.inventoryCategoryId ? { categoryId: concept.inventoryCategoryId } : amenity) }, select: { id: true, name: true } });
}

export const servicesService = {
  /** Catálogo plano legado (compat con pantallas antiguas): tipo SERVICIO agrupado por categoría. */
  async catalog(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const cats = await serviceCatalogRepository.treeByTipo(branchId, 'SERVICIO');
    const out: { subcategory: string; services: { id: string; name: string; price: number | null }[] }[] = [];
    for (const cat of cats) {
      if (cat.status !== 'active') continue;
      const services: { id: string; name: string; price: number | null }[] = [];
      for (const g of cat.groups) {
        if (g.status !== 'active') continue;
        for (const c of g.concepts) if (c.status === 'active') services.push({ id: c.id, name: c.name, price: Number(c.price) });
      }
      if (services.length) out.push({ subcategory: cat.name, services });
    }
    return out;
  },

  /** Árbol activo (Categoría → Grupo → Concepto) con metadatos del concepto, para el modal de recepción. */
  async catalogTree(scope: RequestScope, tipo: string) {
    const branchId = requireActiveBranch(scope);
    const t = tipo === 'PENALIDAD' ? 'PENALIDAD' : 'SERVICIO';
    const cats = await serviceCatalogRepository.treeByTipo(branchId, t);
    return cats
      .filter((c) => c.status === 'active')
      .map((cat) => ({
        id: cat.id, name: cat.name,
        groups: cat.groups.filter((g) => g.status === 'active').map((g) => ({
          id: g.id, name: g.name,
          concepts: g.concepts.filter((c) => c.status === 'active').map((c) => ({
            id: c.id, name: c.name, price: Number(c.price), unit: c.unit,
            attentionMode: c.attentionMode, inventoryOrigin: c.inventoryOrigin, inventoryCategoryId: c.inventoryCategoryId,
            inventoryCategoryName: c.inventoryCategory?.name ?? null, articleScope: c.articleScope,
            allowCourtesy: c.allowCourtesy, allowFreeAmount: c.allowFreeAmount,
          })),
        })).filter((g) => g.concepts.length),
      }))
      .filter((cat) => cat.groups.length);
  },

  /** Disponibilidad de ropa/amenity para (estancia, concepto): unidades disponibles y precio unitario. */
  async availability(scope: RequestScope, stayId: string, conceptId: string) {
    const branchId = requireActiveBranch(scope);
    const stay = await prisma.stay.findFirst({ where: { id: stayId, branchId, status: 'OPEN' }, include: { room: { select: { id: true, roomTypeId: true, tower: true, floor: true } } } });
    if (!stay) throw new ValidationError('La estancia no está activa');
    const concept = await loadConcept(branchId, conceptId);
    if (!concept) throw new ValidationError('Concepto inválido');
    return this.availabilityFor(branchId, stay.room, concept);
  },

  /** Núcleo de disponibilidad (reutilizado por availability() y charge()). */
  async availabilityFor(branchId: string, room: { id: string; roomTypeId: string; tower: string | null; floor: string | null }, concept: ConceptFull) {
    const unitPrice = Number(concept.price);
    const catName = concept.inventoryCategory?.name ?? 'unidad(es)';
    if (concept.attentionMode !== 'LINEN_EXTRA') return { available: null as number | null, unitPrice, categoryName: catName, floor: null as string | null, issue: null as string | null };

    if (concept.inventoryOrigin === 'AMENITY') {
      const products = await compatibleAmenity(branchId, concept);
      if (!products.length) return { available: 0, unitPrice, categoryName: catName, floor: null, issue: 'No hay amenities compatibles configurados para este concepto.' };
      const ids = products.map((p) => p.id);
      const stocks = await prisma.stock.findMany({ where: { productId: { in: ids } }, select: { quantity: true } });
      const physical = stocks.reduce((a, s) => a + Number(s.quantity), 0);
      const reserved = (await prisma.roomSupply.aggregate({ _sum: { reservedQty: true }, where: { branchId, roomId: room.id, status: 'RESERVED', inventoryCategoryId: concept.inventoryCategoryId } }))._sum.reservedQty ?? 0;
      return { available: Math.max(0, physical - reserved), unitPrice, categoryName: catName, floor: null, issue: null };
    }

    // ROPA
    const items = await compatibleLinen(branchId, room.roomTypeId, concept);
    if (!items.length) return { available: 0, unitPrice, categoryName: catName, floor: null, issue: 'No hay prendas compatibles configuradas para esta habitación.' };
    const floor = await resolveFloor(branchId, room);
    if (!floor) return { available: 0, unitPrice, categoryName: catName, floor: null, issue: 'La habitación no tiene un almacén de ropa vinculado. Configúralo en Inventario › Sub-almacenes.' };
    const stocks = await prisma.linenStock.findMany({ where: { linenItemId: { in: items.map((i) => i.id) }, floor }, select: { rem: true, sum: true } });
    const physical = stocks.reduce((a, s) => a + (s.rem ?? 0) + (s.sum ?? 0), 0);
    const reserved = (await prisma.roomSupply.aggregate({ _sum: { reservedQty: true }, where: { branchId, roomId: room.id, status: 'RESERVED', inventoryCategoryId: concept.inventoryCategoryId } }))._sum.reservedQty ?? 0;
    return { available: Math.max(0, physical - reserved), unitPrice, categoryName: catName, floor, issue: null };
  },

  /** Cobra/registra servicios, penalidades y ropa adicional; reserva la ropa para entrega por limpieza. */
  async charge(scope: RequestScope, dto: ChargeDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await prisma.stay.findFirst({ where: { id: dto.stayId, branchId, status: 'OPEN' }, include: { room: { select: { id: true, roomTypeId: true, tower: true, floor: true } } } });
    if (!stay) throw new ValidationError('La estancia no está activa');
    const freeAmountAllowed = scope.isSuperAdmin || scope.permissions.includes('settings:edit') || scope.permissions.includes('finance:edit');

    const saleItems: { productId?: string; description?: string; quantity: number; unitPrice?: number }[] = [];
    const reservations: { concept: ConceptFull; quantity: number; courtesy: boolean; reason: string | null }[] = [];

    for (const it of dto.items) {
      if (it.conceptId) {
        const concept = await loadConcept(branchId, it.conceptId);
        if (!concept) throw new ValidationError('Concepto inválido');
        if (concept.status !== 'active') throw new ValidationError(`El concepto "${concept.name}" no está activo`);
        const tipo = concept.group.category.tipo;
        let unitPrice: number;
        if (it.isCourtesy) {
          if (tipo === 'PENALIDAD') throw new ValidationError('Las penalidades no admiten cortesía');
          if (!concept.allowCourtesy) throw new ValidationError(`El concepto "${concept.name}" no admite cortesía`);
          unitPrice = 0;
        } else if (it.unitPrice !== undefined && concept.allowFreeAmount && freeAmountAllowed) {
          unitPrice = it.unitPrice; // monto libre (con permiso)
        } else {
          unitPrice = Number(concept.price);
        }
        if (concept.attentionMode === 'LINEN_EXTRA') {
          const av = await this.availabilityFor(branchId, stay.room, concept);
          if (av.issue) throw new ValidationError(av.issue);
          if (av.available != null && it.quantity > av.available) {
            throw new ValidationError(`Solo hay ${av.available} ${av.categoryName} disponible(s) para esta habitación.`);
          }
          reservations.push({ concept, quantity: it.quantity, courtesy: !!it.isCourtesy, reason: it.courtesyReason ?? null });
        }
        saleItems.push({ description: concept.name, quantity: it.quantity, unitPrice });
      } else if (it.productId) {
        saleItems.push({ productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice });
      } else {
        saleItems.push({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice ?? 0 });
      }
    }

    const sale = await salesService.create(scope, {
      stayId: dto.stayId,
      items: saleItems,
      payments: dto.payments.map((p) => ({ ...p, reference: p.reference || undefined })),
      opToken: dto.opToken,
    });

    // Reservas de ropa: solo si esta venta no las creó ya (idempotencia por opToken).
    const already = await prisma.roomSupply.count({ where: { saleId: sale.id } });
    const supplies: string[] = [];
    if (already === 0) {
      for (const r of reservations) {
        const s = await prisma.roomSupply.create({
          data: {
            branchId, roomId: stay.roomId, stayId: stay.id, description: r.concept.name,
            quantity: r.quantity, reservedQty: r.quantity, status: 'RESERVED',
            conceptId: r.concept.id, inventoryCategoryId: r.concept.inventoryCategoryId, saleId: sale.id,
            courtesy: r.courtesy, courtesyReason: r.reason, createdByUserId: scope.userId,
          },
        });
        supplies.push(s.id);
      }
    }
    const owed = round(Number(sale.total) - Number(sale.paid));
    return { sale, owed, supplies };
  },

  /** Suministros/reservas (para limpieza). */
  async supplies(scope: RequestScope, status?: string) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.roomSupply.findMany({ where: { branchId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' } });
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
        id: r.id, roomId: r.roomId, room: room?.number ?? '—', floor: room?.floor ?? null, roomType: room?.roomType?.name ?? '',
        description: r.description, category: categoryOf(r.description), quantity: r.quantity, status: r.status,
        courtesy: r.courtesy, createdAt: r.createdAt, deliveredAt: r.deliveredAt,
      };
    });
  },

  /** Variantes físicas compatibles para que limpieza elija al entregar una reserva de ropa. */
  async variants(scope: RequestScope, supplyId: string) {
    const branchId = requireActiveBranch(scope);
    const supply = await prisma.roomSupply.findFirst({ where: { id: supplyId, branchId } });
    if (!supply) throw new ValidationError('Suministro no encontrado');
    if (!supply.conceptId) return []; // legado: sin concepto no hay variantes estructuradas
    const concept = await loadConcept(branchId, supply.conceptId);
    const room = await prisma.room.findUnique({ where: { id: supply.roomId }, select: { id: true, roomTypeId: true, tower: true, floor: true } });
    if (!concept || !room || concept.inventoryOrigin !== 'ROPA') return [];
    const items = await compatibleLinen(branchId, room.roomTypeId, concept);
    const floor = await resolveFloor(branchId, room);
    const stocks = floor ? await prisma.linenStock.findMany({ where: { linenItemId: { in: items.map((i) => i.id) }, floor }, select: { linenItemId: true, rem: true, sum: true } }) : [];
    const stockMap = new Map(stocks.map((s) => [s.linenItemId, (s.rem ?? 0) + (s.sum ?? 0)]));
    return items.map((i) => ({ id: i.id, name: i.name, size: i.size, color: i.color, available: stockMap.get(i.id) ?? 0 }));
  },

  /**
   * Limpieza confirma la entrega: marca DELIVERED y descuenta del inventario UNA sola vez.
   * Si recibe linenItemId (variante elegida), descuenta esa; si no, resuelve una compatible con stock.
   */
  async deliver(scope: RequestScope, id: string, linenItemId?: string) {
    const branchId = requireActiveBranch(scope);
    const supply = await prisma.roomSupply.findFirst({ where: { id, branchId } });
    if (!supply) throw new ValidationError('Suministro no encontrado');
    if (supply.status === 'DELIVERED') return supply;

    const room = await prisma.room.findUnique({ where: { id: supply.roomId }, select: { id: true, roomTypeId: true, floor: true, tower: true, number: true } });
    const floor = room ? await resolveFloor(branchId, room) : null;

    // Resolver el LinenItem a descontar: elegido por cleaning → validar compatible; si no, primero con stock.
    let itemId: string | null = null;
    if (supply.conceptId && room) {
      const concept = await loadConcept(branchId, supply.conceptId);
      if (concept && concept.inventoryOrigin === 'ROPA') {
        const compat = await compatibleLinen(branchId, room.roomTypeId, concept);
        const compatIds = new Set(compat.map((c) => c.id));
        if (linenItemId) {
          if (!compatIds.has(linenItemId)) throw new ValidationError('La prenda elegida no es compatible con esta habitación.');
          itemId = linenItemId;
        } else if (floor) {
          const stocks = await prisma.linenStock.findMany({ where: { linenItemId: { in: [...compatIds] }, floor } });
          const withStock = stocks.find((s) => (s.rem ?? 0) + (s.sum ?? 0) >= supply.quantity) ?? stocks.find((s) => (s.rem ?? 0) + (s.sum ?? 0) > 0);
          itemId = withStock?.linenItemId ?? compat[0]?.id ?? null;
        }
      }
    }
    if (!itemId) {
      // Legado: resolver por nombre (sin concepto estructurado).
      const linen = await prisma.linenItem.findMany({ where: { branchId, status: 'active' }, select: { id: true, name: true } });
      itemId = linen.find((l) => supply.description.toUpperCase().includes(l.name.toUpperCase()) || l.name.toUpperCase().includes(supply.description.toUpperCase()))?.id ?? null;
    }

    await prisma.$transaction(async (tx) => {
      if (itemId && floor) {
        const stock = await tx.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId: itemId, floor } } });
        const avail = (stock?.rem ?? 0) + (stock?.sum ?? 0);
        const dec = Math.min(supply.quantity, avail);
        if (dec > 0) {
          const fromSum = Math.min(stock?.sum ?? 0, dec);
          const fromRem = dec - fromSum;
          await tx.linenStock.update({ where: { linenItemId_floor: { linenItemId: itemId, floor } }, data: { sum: { decrement: fromSum }, rem: { decrement: fromRem } } });
        }
        await tx.linenMovement.create({ data: { branchId, linenItemId: itemId, type: 'SUPPLY', quantity: -supply.quantity, floor, areaFrom: `Piso ${floor}`, areaTo: `Hab. ${room?.number ?? ''}`.trim(), reference: 'Entrega de ropa adicional a habitación', createdByUserId: scope.userId } });
      }
      await tx.roomSupply.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date(), linenItemId: itemId, reservedQty: 0 } });
    });
    return { ok: true, linenItemId: itemId };
  },

  /** Limpieza rechaza/cancela la entrega: libera la reserva (no descuenta stock). */
  async reject(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const supply = await prisma.roomSupply.findFirst({ where: { id, branchId } });
    if (!supply) throw new ValidationError('Suministro no encontrado');
    return prisma.roomSupply.update({ where: { id }, data: { status: 'REJECTED', reservedQty: 0 } });
  },
};
