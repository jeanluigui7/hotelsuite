import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

type Item = { name: string; qty: number };

/** Stock (top) del almacén de un tipo dado. */
async function warehouseStock(branchId: string, type: string): Promise<Item[]> {
  const wh = await prisma.warehouse.findFirst({ where: { branchId, type } });
  if (!wh) return [];
  const rows = await prisma.stock.findMany({
    where: { warehouseId: wh.id, quantity: { gt: 0 } },
    include: { product: { select: { name: true } } },
    orderBy: { quantity: 'desc' },
    take: 15,
  });
  return rows.map((s) => ({ name: s.product.name, qty: s.quantity }));
}

/**
 * Snapshot consolidado de todos los almacenes/áreas para el "Mapa de Almacenes":
 * General (productos/ropa central/amenities), Limpieza (por piso + productos),
 * Lavandería (sucia/en proceso), Recepción y Habitaciones (la habitación como almacén).
 */
export const inventoryMapService = {
  async snapshot(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);

    const [products, amenities, cleaningProducts, reception, linen, locStock, roomInv, rooms, subWh] = await Promise.all([
      warehouseStock(branchId, 'PRODUCTS'),
      warehouseStock(branchId, 'AMENITIES'),
      warehouseStock(branchId, 'CLEANING'),
      warehouseStock(branchId, 'RECEPTION'),
      prisma.linenStock.findMany({ where: { branchId, rem: { gt: 0 } }, include: { linenItem: { select: { name: true, type: true } } } }),
      prisma.linenLocationStock.findMany({ where: { branchId, quantity: { gt: 0 } } }),
      prisma.roomInventory.findMany({ where: { branchId, quantity: { gt: 0 } } }),
      prisma.room.findMany({ where: { branchId }, select: { id: true, number: true, floor: true }, orderBy: [{ floor: 'asc' }, { number: 'asc' }] }),
      prisma.subWarehouse.findMany({
        where: { branchId, area: { type: 'LIMPIEZA' } },
        include: { _count: { select: { rooms: true } }, stock: { where: { quantity: { gt: 0 } } } },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Ropa legada: central (ALMACEN) y por piso.
    const clothingCentral: Item[] = [];
    const floorsMap = new Map<string, Item[]>();
    for (const s of linen) {
      const it = { name: `${s.linenItem.type} ${s.linenItem.name}`.trim(), qty: s.rem };
      if (s.floor === 'ALMACEN') clothingCentral.push(it);
      else {
        if (!floorsMap.has(s.floor)) floorsMap.set(s.floor, []);
        floorsMap.get(s.floor)!.push(it);
      }
    }
    const floors = [...floorsMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([floor, items]) => ({ floor, items }));

    // Lavandería (ubicaciones del módulo nuevo).
    const dirty: Item[] = [];
    const inLaundry: Item[] = [];
    const cleanCentral: Item[] = [];
    for (const l of locStock) {
      const it = { name: l.name, qty: l.quantity };
      if (l.location === 'DIRTY') dirty.push(it);
      else if (l.location === 'LAUNDRY') inLaundry.push(it);
      else if (l.location === 'CLEAN_CENTRAL') cleanCentral.push(it);
    }

    // Habitaciones como almacén virtual.
    const invByRoom = new Map<string, Item[]>();
    for (const r of roomInv) {
      if (!invByRoom.has(r.roomId)) invByRoom.set(r.roomId, []);
      invByRoom.get(r.roomId)!.push({ name: r.name, qty: r.quantity });
    }
    const roomBoxes = rooms.map((r) => ({ number: r.number, floor: r.floor, items: invByRoom.get(r.id) ?? [] }));

    const subWarehouses = subWh.map((s) => ({
      name: s.name,
      roomCount: s._count.rooms,
      items: s.stock.map((x) => ({ name: x.name, qty: x.quantity })),
    }));

    return {
      general: { products, clothingCentral, amenities },
      cleaning: { floors, products: cleaningProducts, subWarehouses },
      laundry: { dirty, inLaundry, cleanCentral },
      reception,
      rooms: roomBoxes,
    };
  },
};
