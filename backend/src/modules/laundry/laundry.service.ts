import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { addLocationStock, LOCATIONS, type LocationCode } from './location-stock';
import type { MoveDto } from './laundry.schema';

const LINEN_CENTRAL_FLOOR = 'ALMACEN';

async function stockAt(branchId: string, location: LocationCode) {
  const rows = await prisma.linenLocationStock.findMany({
    where: { branchId, location, quantity: { gt: 0 } },
    orderBy: [{ articleKind: 'asc' }, { name: 'asc' }],
  });
  return rows.map((r) => ({ articleKind: r.articleKind, name: r.name, quantity: r.quantity, linenItemId: r.linenItemId }));
}

/** Mueve ítems entre dos ubicaciones del ciclo de ropa, validando el stock de origen. */
async function move(scope: RequestScope, from: LocationCode, to: LocationCode, type: string, reference: string, dto: MoveDto) {
  const branchId = requireActiveBranch(scope);
  await prisma.$transaction(async (tx) => {
    for (const it of dto.items) {
      const key = { branchId_location_articleKind_name: { branchId, location: from, articleKind: it.articleKind, name: it.name } };
      const src = await tx.linenLocationStock.findUnique({ where: key });
      if (!src || src.quantity < it.quantity) {
        throw new ValidationError(`Stock insuficiente de "${it.name}" en ${LOCATIONS[from]} (disponible ${src?.quantity ?? 0}, solicitado ${it.quantity}).`);
      }
      const lid = src.linenItemId; // se arrastra el vínculo legado por todo el ciclo
      await addLocationStock(tx, branchId, from, it.articleKind, it.name, -it.quantity, lid);
      await addLocationStock(tx, branchId, to, it.articleKind, it.name, it.quantity, lid);
      await tx.roomInventoryMovement.create({
        data: {
          branchId, roomId: null, type, articleKind: it.articleKind, name: it.name, quantity: it.quantity,
          fromLocation: LOCATIONS[from], toLocation: LOCATIONS[to], reference, createdByUserId: scope.userId,
        },
      });
      // Al recibir de lavandería, la ropa limpia vinculada vuelve al almacén central legado,
      // para que el flujo clásico "suministrar a piso" la pueda repartir de nuevo.
      if (to === 'CLEAN_CENTRAL' && lid) {
        await tx.linenStock.upsert({
          where: { linenItemId_floor: { linenItemId: lid, floor: LINEN_CENTRAL_FLOOR } },
          update: { rem: { increment: it.quantity } },
          create: { branchId, linenItemId: lid, floor: LINEN_CENTRAL_FLOOR, rem: it.quantity, sum: 0 },
        });
        await tx.linenMovement.create({
          data: { branchId, linenItemId: lid, type: 'LAUNDRY', quantity: it.quantity, floor: LINEN_CENTRAL_FLOOR, areaFrom: LOCATIONS.LAUNDRY, areaTo: 'Almacén de Ropa Limpia Central', reference, createdByUserId: scope.userId },
        });
      }
    }
  });
  return { moved: dto.items.length };
}

export const laundryService = {
  async pending(scope: RequestScope) {
    return stockAt(requireActiveBranch(scope), 'DIRTY');
  },
  async inProcess(scope: RequestScope) {
    return stockAt(requireActiveBranch(scope), 'LAUNDRY');
  },
  async clean(scope: RequestScope) {
    return stockAt(requireActiveBranch(scope), 'CLEAN_CENTRAL');
  },
  /** Ropa Sucia Pendiente → Lavandería. */
  send(scope: RequestScope, dto: MoveDto) {
    return move(scope, 'DIRTY', 'LAUNDRY', 'LAUNDRY_OUT', 'Envío a lavandería', dto);
  },
  /** Lavandería → Ropa Limpia Central. */
  receive(scope: RequestScope, dto: MoveDto) {
    return move(scope, 'LAUNDRY', 'CLEAN_CENTRAL', 'LAUNDRY_IN', 'Recepción desde lavandería', dto);
  },
};
