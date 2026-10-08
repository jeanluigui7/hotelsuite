import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ValidationError, ConflictError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { PAYMENT_METHODS } from '../../shared/payments';
import { salesService } from '../sales/sales.service';
import { recordActivity } from '../activity-log/activity.emitter';
import { serviceCatalogRepository } from '../service-catalog/service-catalog.repository';

type Db = Prisma.TransactionClient | typeof prisma;

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
    // Modalidad EXPLÍCITA (no se deduce por importe 0): VENTA | CORTESIA | INCLUIDO.
    modality: z.enum(['VENTA', 'CORTESIA', 'INCLUIDO']).optional(),
    stayBenefitId: z.string().min(1).optional(), // beneficio a consumir (modality=INCLUIDO)
    place: z.enum(['ROOM', 'DINING']).optional(),
    observations: z.string().max(500).optional(),
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

  /** Núcleo de disponibilidad (reutilizado por availability() y charge()). `db` permite re-chequear
   *  dentro de una transacción serializable al reservar (protección contra reservas simultáneas). */
  async availabilityFor(branchId: string, room: { id: string; roomTypeId: string; tower: string | null; floor: string | null }, concept: ConceptFull, db: Db = prisma) {
    const unitPrice = Number(concept.price);
    const catName = concept.inventoryCategory?.name ?? 'unidad(es)';
    if (concept.attentionMode !== 'LINEN_EXTRA') return { available: null as number | null, unitPrice, categoryName: catName, floor: null as string | null, issue: null as string | null };

    if (concept.inventoryOrigin === 'AMENITY') {
      const products = await compatibleAmenity(branchId, concept);
      if (!products.length) return { available: 0, unitPrice, categoryName: catName, floor: null, issue: 'No hay amenities compatibles configurados para este concepto.' };
      const ids = products.map((p) => p.id);
      const stocks = await db.stock.findMany({ where: { productId: { in: ids } }, select: { quantity: true } });
      const physical = stocks.reduce((a, s) => a + Number(s.quantity), 0);
      const reserved = (await db.roomSupply.aggregate({ _sum: { reservedQty: true }, where: { branchId, roomId: room.id, status: 'RESERVED', inventoryCategoryId: concept.inventoryCategoryId } }))._sum.reservedQty ?? 0;
      return { available: Math.max(0, physical - reserved), unitPrice, categoryName: catName, floor: null, issue: null };
    }

    // ROPA
    const items = await compatibleLinen(branchId, room.roomTypeId, concept);
    if (!items.length) return { available: 0, unitPrice, categoryName: catName, floor: null, issue: 'No hay prendas compatibles configuradas para esta habitación.' };
    const floor = await resolveFloor(branchId, room);
    if (!floor) return { available: 0, unitPrice, categoryName: catName, floor: null, issue: 'La habitación no tiene un almacén de ropa vinculado. Configúralo en Inventario › Sub-almacenes.' };
    const stocks = await db.linenStock.findMany({ where: { linenItemId: { in: items.map((i) => i.id) }, floor }, select: { rem: true, sum: true } });
    const physical = stocks.reduce((a, s) => a + (s.rem ?? 0) + (s.sum ?? 0), 0);
    const reserved = (await db.roomSupply.aggregate({ _sum: { reservedQty: true }, where: { branchId, roomId: room.id, status: 'RESERVED', inventoryCategoryId: concept.inventoryCategoryId } }))._sum.reservedQty ?? 0;
    return { available: Math.max(0, physical - reserved), unitPrice, categoryName: catName, floor, issue: null };
  },

  /** Cobra/registra servicios, penalidades y ropa adicional; reserva la ropa para entrega por limpieza. */
  async charge(scope: RequestScope, dto: ChargeDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await prisma.stay.findFirst({ where: { id: dto.stayId, branchId, status: 'OPEN' }, include: { room: { select: { id: true, roomTypeId: true, tower: true, floor: true } } } });
    if (!stay) throw new ValidationError('La estancia no está activa');
    const freeAmountAllowed = scope.isSuperAdmin || scope.permissions.includes('settings:edit') || scope.permissions.includes('finance:edit');

    const saleItems: { productId?: string; description?: string; quantity: number; unitPrice?: number; conceptKind?: 'SERVICE' | 'PENALTY'; courtesy?: boolean; modality?: 'VENTA' | 'CORTESIA' | 'INCLUIDO'; stayBenefitId?: string }[] = [];
    const reservations: { concept: ConceptFull; quantity: number; courtesy: boolean; reason: string | null }[] = [];
    // Pedidos de servicio (NO ropa): las 3 modalidades generan un ServiceOrder (prep Restaurante/Bar;
    // hoy entrega directa DELIVERED). Los INCLUIDO consumen cupo en una tx SERIALIZABLE tras crear la
    // venta, para que dos cobros no gasten el mismo último cupo.
    const serviceOrders: { conceptId: string; name: string; quantity: number; modality: 'VENTA' | 'CORTESIA' | 'INCLUIDO'; benefitId: string | null; place: string; observations: string | null }[] = [];

    for (const it of dto.items) {
      if (it.conceptId) {
        const concept = await loadConcept(branchId, it.conceptId);
        if (!concept) throw new ValidationError('Concepto inválido');
        if (concept.status !== 'active') throw new ValidationError(`El concepto "${concept.name}" no está activo`);
        const tipo = concept.group.category.tipo;
        const modality = it.modality ?? (it.isCourtesy ? 'CORTESIA' : 'VENTA');
        let unitPrice: number;
        let benefitId: string | null = null;
        if (modality === 'INCLUIDO') {
          if (tipo === 'PENALIDAD') throw new ValidationError('Una penalidad no puede ser "incluida en tarifa"');
          // Beneficio contratado y vigente, con cupo disponible (chequeo final en la tx serializable).
          const benefit = await prisma.stayBenefit.findFirst({
            where: {
              branchId, stayId: stay.id, status: 'ACTIVE', conceptId: concept.id,
              ...(it.stayBenefitId ? { id: it.stayBenefitId } : {}),
            },
            orderBy: { periodStart: 'asc' },
          });
          if (!benefit) throw new ValidationError(`La tarifa no incluye "${concept.name}" para esta estancia`);
          const now = new Date();
          if (now < benefit.periodStart || now > benefit.periodEnd) throw new ValidationError(`El beneficio "${concept.name}" no está vigente en este momento`);
          const available = benefit.includedQty - benefit.pendingQty - benefit.deliveredQty;
          if (it.quantity > available) throw new ValidationError(`Solo quedan ${Math.max(0, available)} "${concept.name}" incluidos disponibles`);
          unitPrice = 0;
          benefitId = benefit.id;
        } else if (modality === 'CORTESIA' || it.isCourtesy) {
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
        saleItems.push({ description: concept.name, quantity: it.quantity, unitPrice, conceptKind: tipo === 'PENALIDAD' ? 'PENALTY' : 'SERVICE', courtesy: modality === 'CORTESIA', modality, stayBenefitId: benefitId ?? undefined });
        // Pedido para servicios (no penalidades, no ropa que ya va por RoomSupply): las 3 modalidades.
        if (tipo !== 'PENALIDAD' && concept.attentionMode !== 'LINEN_EXTRA') {
          serviceOrders.push({ conceptId: concept.id, name: concept.name, quantity: it.quantity, modality, benefitId, place: it.place ?? 'ROOM', observations: it.observations ?? null });
        }
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

    // Reservas de ropa: solo si esta venta no las creó ya (idempotencia por opToken). La creación va en
    // una transacción SERIALIZABLE que re-chequea disponibilidad para que dos cobros simultáneos del
    // mismo stock no sobre-reserven (solo uno gana la última unidad).
    const already = await prisma.roomSupply.count({ where: { saleId: sale.id } });
    const supplies: string[] = [];
    if (already === 0 && reservations.length) {
      const saleItems = sale.items.map((i) => ({ id: i.id, description: i.description, used: false }));
      await prisma.$transaction(async (tx) => {
        for (const r of reservations) {
          const av = await this.availabilityFor(branchId, stay.room, r.concept, tx);
          if (av.issue) throw new ValidationError(av.issue);
          if (av.available != null && r.quantity > av.available) {
            throw new ConflictError(`Solo hay ${av.available} ${av.categoryName} disponible(s) para esta habitación.`);
          }
          const line = saleItems.find((i) => !i.used && i.description === r.concept.name);
          if (line) line.used = true;
          const s = await tx.roomSupply.create({
            data: {
              branchId, roomId: stay.roomId, stayId: stay.id, description: r.concept.name,
              quantity: r.quantity, reservedQty: r.quantity, status: 'RESERVED',
              conceptId: r.concept.id, inventoryCategoryId: r.concept.inventoryCategoryId,
              saleId: sale.id, saleItemId: line?.id ?? null,
              courtesy: r.courtesy, courtesyReason: r.reason, createdByUserId: scope.userId,
            },
          });
          supplies.push(s.id);
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    // Pedidos de servicio (todas las modalidades) + consumo de cupo de los INCLUIDOS. Idempotente por
    // saleId (no duplica si se reintenta). Tx SERIALIZABLE: re-valida el cupo y lo descuenta
    // (deliveredQty += qty) antes de registrar la entrega como ServiceOrder DELIVERED (entrega directa).
    const orders: string[] = [];
    const alreadyOrders = await prisma.serviceOrder.count({ where: { saleId: sale.id } });
    if (alreadyOrders === 0 && serviceOrders.length) {
      const saleLines = sale.items.map((i) => ({ id: i.id, description: i.description, used: false }));
      await prisma.$transaction(async (tx) => {
        for (const o of serviceOrders) {
          if (o.modality === 'INCLUIDO' && o.benefitId) {
            const b = await tx.stayBenefit.findUnique({ where: { id: o.benefitId } });
            if (!b || b.status !== 'ACTIVE') throw new ConflictError(`El beneficio de "${o.name}" ya no está disponible`);
            const available = b.includedQty - b.pendingQty - b.deliveredQty;
            if (o.quantity > available) throw new ConflictError(`Solo quedan ${Math.max(0, available)} "${o.name}" incluidos disponibles`);
            await tx.stayBenefit.update({ where: { id: b.id }, data: { deliveredQty: { increment: o.quantity } } });
          }
          const line = saleLines.find((i) => !i.used && i.description === o.name);
          if (line) line.used = true;
          const so = await tx.serviceOrder.create({
            data: {
              branchId, stayId: stay.id, roomId: stay.roomId, guestId: stay.guestId,
              conceptId: o.conceptId, description: o.name, quantity: o.quantity,
              modality: o.modality, stayBenefitId: o.benefitId, saleId: sale.id, saleItemId: line?.id ?? null,
              place: o.place, observations: o.observations,
              operationalStatus: 'DELIVERED', requestedByUserId: scope.userId, deliveredByUserId: scope.userId, deliveredAt: new Date(),
            },
          });
          orders.push(so.id);
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
    const owed = round(Number(sale.total) - Number(sale.paid));
    return { sale, owed, supplies, orders };
  },

  /** Pedidos de servicio de una estancia (prep Restaurante/Bar). Estado operativo ≠ estado de pago. */
  async serviceOrdersForStay(scope: RequestScope, stayId: string, status?: string) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.serviceOrder.findMany({
      where: { branchId, stayId, ...(status ? { operationalStatus: status } : {}) },
      orderBy: { requestedAt: 'desc' },
    });
    return rows;
  },

  /** Beneficios de tarifa de una estancia con el disponible calculado (para el modal de recepción). */
  async benefitsForStay(scope: RequestScope, stayId: string) {
    const branchId = requireActiveBranch(scope);
    const stay = await prisma.stay.findFirst({ where: { id: stayId, branchId, status: 'OPEN' }, select: { id: true } });
    if (!stay) return [];
    const now = new Date();
    const benefits = await prisma.stayBenefit.findMany({
      where: { branchId, stayId, status: 'ACTIVE' },
      orderBy: [{ conceptId: 'asc' }, { periodStart: 'asc' }],
    });
    return benefits.map((b) => ({
      id: b.id,
      conceptId: b.conceptId,
      serviceName: b.serviceName,
      includedQty: b.includedQty,
      pendingQty: b.pendingQty,
      deliveredQty: b.deliveredQty,
      availableQty: Math.max(0, b.includedQty - b.pendingQty - b.deliveredQty),
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      scheduleFrom: b.scheduleFrom,
      scheduleTo: b.scheduleTo,
      place: b.place,
      // Vigente = dentro del período (el horario diario lo valida el servidor al cobrar).
      vigente: now >= b.periodStart && now <= b.periodEnd,
    }));
  },

  /** Suministros/reservas (para limpieza). `status='RESERVED'` incluye también los PENDING legados. */
  async supplies(scope: RequestScope, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.RoomSupplyWhereInput = { branchId };
    if (status === 'RESERVED') where.status = { in: ['RESERVED', 'PENDING'] };
    else if (status) where.status = status;
    const rows = await prisma.roomSupply.findMany({ where, orderBy: { createdAt: 'desc' } });
    const roomIds = [...new Set(rows.map((r) => r.roomId))];
    const conceptIds = [...new Set(rows.map((r) => r.conceptId).filter((x): x is string => !!x))];
    const [rooms, concepts] = await Promise.all([
      prisma.room.findMany({ where: { id: { in: roomIds } }, include: { roomType: { select: { name: true } } } }),
      conceptIds.length ? prisma.serviceConcept.findMany({ where: { id: { in: conceptIds } }, select: { id: true, inventoryCategory: { select: { name: true } } } }) : Promise.resolve([]),
    ]);
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const catMap = new Map(concepts.map((c) => [c.id, c.inventoryCategory?.name ?? 'Suministro']));
    return rows.map((r) => {
      const room = roomMap.get(r.roomId);
      return {
        id: r.id, roomId: r.roomId, room: room?.number ?? '—', floor: room?.floor ?? null, roomType: room?.roomType?.name ?? '',
        description: r.description, category: r.conceptId ? (catMap.get(r.conceptId) ?? 'Suministro') : 'Suministro',
        quantity: r.quantity, status: r.status, conceptId: r.conceptId, saleId: r.saleId,
        courtesy: r.courtesy, courtesyReason: r.courtesyReason, createdAt: r.createdAt, deliveredAt: r.deliveredAt,
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
   * Limpieza confirma la entrega: UNA variante por unidad (units[]), descuenta el stock UNA sola vez,
   * registra las prendas como ADICIONALES de la habitación (sin tocar la dotación BASE) y consume la
   * reserva. Atómico (serializable + guard de estado) → no se puede entregar/rechazar dos veces.
   */
  async deliver(scope: RequestScope, id: string, units?: string[]) {
    const branchId = requireActiveBranch(scope);
    const supply = await prisma.roomSupply.findFirst({ where: { id, branchId } });
    if (!supply) throw new ValidationError('Suministro no encontrado');
    if (supply.status === 'DELIVERED') return { ok: true, already: true };
    if (supply.status !== 'RESERVED' && supply.status !== 'PENDING') throw new ConflictError('La solicitud ya fue procesada.');

    const room = await prisma.room.findUnique({ where: { id: supply.roomId }, select: { id: true, roomTypeId: true, floor: true, tower: true, number: true } });
    const floor = room ? await resolveFloor(branchId, room) : null;

    // Prendas compatibles (tipo + tamaño + almacén + vínculo del concepto) para validar/auto-resolver.
    let compat: { id: string; name: string; size: string | null; color: string | null }[] = [];
    if (supply.conceptId && room) {
      const concept = await loadConcept(branchId, supply.conceptId);
      if (concept && concept.inventoryOrigin === 'ROPA') compat = await compatibleLinen(branchId, room.roomTypeId, concept);
    }
    const compatMap = new Map(compat.map((c) => [c.id, c]));

    // Una variante por unidad (length = quantity). Si no se envían, auto-resolver.
    let unitIds: string[];
    if (units && units.length) {
      if (units.length !== supply.quantity) throw new ValidationError(`Debes indicar ${supply.quantity} prenda(s).`);
      for (const u of units) if (compat.length && !compatMap.has(u)) throw new ValidationError('Una de las prendas elegidas no es compatible con esta habitación.');
      unitIds = units;
    } else {
      let itemId: string | null = null;
      if (compat.length && floor) {
        const stocks = await prisma.linenStock.findMany({ where: { linenItemId: { in: compat.map((c) => c.id) }, floor } });
        const withStock = stocks.find((s) => (s.rem ?? 0) + (s.sum ?? 0) >= supply.quantity) ?? stocks.find((s) => (s.rem ?? 0) + (s.sum ?? 0) > 0);
        itemId = withStock?.linenItemId ?? compat[0]?.id ?? null;
      }
      if (!itemId) {
        const linen = await prisma.linenItem.findMany({ where: { branchId, status: 'active' }, select: { id: true, name: true } });
        const m = linen.find((l) => supply.description.toUpperCase().includes(l.name.toUpperCase()) || l.name.toUpperCase().includes(supply.description.toUpperCase()));
        itemId = m?.id ?? null;
        if (m) compatMap.set(m.id, { id: m.id, name: m.name, size: null, color: null });
      }
      unitIds = itemId ? Array(supply.quantity).fill(itemId) : [];
    }

    const byItem = new Map<string, number>();
    for (const u of unitIds) byItem.set(u, (byItem.get(u) ?? 0) + 1);

    await prisma.$transaction(async (tx) => {
      const guard = await tx.roomSupply.updateMany({ where: { id, status: { in: ['RESERVED', 'PENDING'] } }, data: { status: 'DELIVERING' } });
      if (guard.count === 0) throw new ConflictError('La solicitud ya fue procesada.');
      for (const [itemId, count] of byItem) {
        if (floor) {
          const stock = await tx.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId: itemId, floor } } });
          const avail = (stock?.rem ?? 0) + (stock?.sum ?? 0);
          if (avail < count) throw new ConflictError(`Stock insuficiente de la prenda seleccionada (disponible ${avail}).`);
          const fromSum = Math.min(stock?.sum ?? 0, count);
          const fromRem = count - fromSum;
          await tx.linenStock.update({ where: { linenItemId_floor: { linenItemId: itemId, floor } }, data: { sum: { decrement: fromSum }, rem: { decrement: fromRem } } });
          await tx.linenMovement.create({ data: { branchId, linenItemId: itemId, type: 'SUPPLY', quantity: -count, floor, areaFrom: `Piso ${floor}`, areaTo: `Hab. ${room?.number ?? ''}`.trim(), reference: 'Entrega de ropa adicional a habitación', createdByUserId: scope.userId } });
        }
        // Registrar como ADICIONAL de la habitación (no toca la dotación BASE).
        const name = compatMap.get(itemId)?.name ?? supply.description;
        await tx.roomInventoryMovement.create({ data: { branchId, roomId: supply.roomId, type: 'EXTRA', articleKind: 'LINEN_REUSABLE', name, quantity: count, toLocation: `Hab. ${room?.number ?? ''}`.trim(), reference: `supply:${id}`, createdByUserId: scope.userId } });
        await tx.roomInventory.upsert({
          where: { roomId_articleKind_name: { roomId: supply.roomId, articleKind: 'LINEN_REUSABLE', name } },
          create: { branchId, roomId: supply.roomId, articleKind: 'LINEN_REUSABLE', name, linenItemId: itemId, quantity: count },
          update: { quantity: { increment: count } },
        });
      }
      const deliveredJson = JSON.stringify([...byItem.entries()].map(([itemId, qty]) => ({ linenItemId: itemId, name: compatMap.get(itemId)?.name ?? supply.description, qty })));
      await tx.roomSupply.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date(), deliveredByUserId: scope.userId, deliveredJson, linenItemId: unitIds[0] ?? null, reservedQty: 0 } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    void recordActivity(scope, { activity: 'SUPPLY_DELIVER', area: 'LIMPIEZA', roomId: supply.roomId, entityId: id, reference: `Hab. ${room?.number ?? ''}`.trim(), detail: `Ropa adicional entregada · ${supply.description} x${supply.quantity}`, meta: { supplyId: id, saleId: supply.saleId } });
    return { ok: true };
  },

  /**
   * Rechaza una solicitud: libera la reserva, anula SOLO la línea del cargo (no toda la venta), y si
   * hubo pago crea una DEVOLUCIÓN PENDIENTE (ChangeCredit) por el importe pagado atribuible; avisa a
   * recepción por la bitácora. No mueve caja (recepción confirma la entrega del dinero después).
   */
  async reject(scope: RequestScope, id: string, reason?: string) {
    const branchId = requireActiveBranch(scope);
    const supply = await prisma.roomSupply.findFirst({ where: { id, branchId } });
    if (!supply) throw new ValidationError('Suministro no encontrado');
    if (supply.status === 'REJECTED') return { ok: true, already: true };
    if (supply.status !== 'RESERVED' && supply.status !== 'PENDING') throw new ConflictError('La solicitud ya fue procesada.');

    const roomNum = (await prisma.room.findUnique({ where: { id: supply.roomId }, select: { number: true } }))?.number ?? '';

    // Importe pagado atribuible a la línea del suministro (proporcional si el pago fue parcial).
    let refund = 0;
    let saleInfo: { id: string; cashSessionId: string | null } | null = null;
    if (supply.saleId) {
      const s = await prisma.sale.findUnique({ where: { id: supply.saleId }, include: { items: true, payments: true } });
      if (s && s.status !== 'CANCELLED') {
        const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
        const total = Number(s.total);
        const item = supply.saleItemId ? s.items.find((it) => it.id === supply.saleItemId) : s.items.find((it) => it.description === supply.description && !it.voided);
        const lineSubtotal = item ? Number(item.subtotal) : 0;
        saleInfo = { id: s.id, cashSessionId: s.cashSessionId };
        if (!supply.courtesy && lineSubtotal > 0 && total > 0 && paid > 0) {
          refund = round(Math.min(lineSubtotal, lineSubtotal * (paid / total)));
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      const guard = await tx.roomSupply.updateMany({
        where: { id, status: { in: ['RESERVED', 'PENDING'] } },
        data: { status: 'REJECTED', reservedQty: 0, rejectedByUserId: scope.userId, rejectedReason: reason?.trim() || null, rejectedAt: new Date(), refundAmount: refund > 0 ? refund : null },
      });
      if (guard.count === 0) throw new ConflictError('La solicitud ya fue procesada.');
      // Devolución pendiente (no mueve caja): recepción la entrega/confirma luego con el flujo de vuelto.
      if (refund > 0 && supply.stayId) {
        await tx.changeCredit.create({ data: {
          branchId, stayId: supply.stayId, room: roomNum || null, originSessionId: saleInfo?.cashSessionId ?? null,
          amount: refund, remaining: refund, status: 'PENDIENTE', kind: 'REFUND', createdByUserId: scope.userId,
          note: `Devolución por servicio rechazado: ${supply.description}${reason?.trim() ? ` · ${reason.trim()}` : ''}`,
        } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    // Anular SOLO la línea del cargo (voidLine maneja su propia tx y no toca las demás líneas).
    if (saleInfo && supply.saleItemId) {
      try { await salesService.voidLine(scope, saleInfo.id, { itemId: supply.saleItemId, reason: `Servicio rechazado en limpieza${reason?.trim() ? `: ${reason.trim()}` : ''}` }); }
      catch { /* la línea pudo anularse/ya no existir; el rechazo igual procede */ }
    }

    void recordActivity(scope, {
      activity: 'SUPPLY_REJECT', area: 'VENTAS', roomId: supply.roomId, entityId: id, reference: `Hab. ${roomNum}`,
      detail: `Servicio rechazado — Hab. ${roomNum}. Cargo anulado.${refund > 0 ? ` Devolución pendiente: S/ ${refund.toFixed(2)}.` : ''}${reason?.trim() ? ` Motivo: ${reason.trim()}` : ''}`,
      meta: { supplyId: id, saleId: supply.saleId, refund, reason: reason?.trim() || null },
    });
    return { ok: true, refund };
  },
};
