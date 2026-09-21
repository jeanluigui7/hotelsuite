import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/**
 * Configuración de Frigobar: define QUÉ habitaciones participan del sistema (Room.frigobarEnabled)
 * y muestra el estado de dotación real vs la Dotación Base (RoomTypeDotacion articleKind=FRIGOBAR).
 * NO implementa consumo/inspección/reposición (fase posterior).
 */

export const bulkFrigobarSchema = z.object({
  rooms: z.array(z.object({ roomId: z.string().min(1), enabled: z.boolean() })).min(1),
});
export type BulkFrigobarDto = z.infer<typeof bulkFrigobarSchema>;

export const frigobarService = {
  /** Habitaciones con su estado de frigobar y de dotación (para /settings/frigobar). */
  async listRooms(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const rooms = await prisma.room.findMany({
      where: { branchId },
      include: { roomType: { select: { id: true, name: true } } },
      orderBy: { number: 'asc' },
    });
    const roomIds = rooms.map((r) => r.id);
    const typeIds = [...new Set(rooms.map((r) => r.roomTypeId))];
    const [dot, inv, lastMovs] = await Promise.all([
      // Dotación Base de FRIGOBAR por tipo de habitación.
      prisma.roomTypeDotacion.findMany({ where: { branchId, roomTypeId: { in: typeIds }, articleKind: 'FRIGOBAR', status: 'active' }, select: { roomTypeId: true, productId: true, name: true, baseQty: true } }),
      // Inventario real de FRIGOBAR por habitación.
      prisma.roomInventory.findMany({ where: { roomId: { in: roomIds }, articleKind: 'FRIGOBAR' }, select: { roomId: true, productId: true, name: true, quantity: true } }),
      // Última dotación (movimiento de carga de frigobar) por habitación.
      prisma.roomInventoryMovement.findMany({ where: { roomId: { in: roomIds }, articleKind: 'FRIGOBAR', type: { in: ['ROOM_LOAD', 'INITIAL'] } }, select: { roomId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    // Base por tipo: clave = productId||name → cantidad.
    const baseByType = new Map<string, Map<string, number>>();
    for (const d of dot) {
      const key = d.productId ?? d.name;
      const m = baseByType.get(d.roomTypeId) ?? new Map<string, number>();
      m.set(key, (m.get(key) ?? 0) + d.baseQty);
      baseByType.set(d.roomTypeId, m);
    }
    const invByRoom = new Map<string, Map<string, number>>();
    for (const i of inv) {
      const key = i.productId ?? i.name;
      const m = invByRoom.get(i.roomId) ?? new Map<string, number>();
      m.set(key, (m.get(key) ?? 0) + i.quantity);
      invByRoom.set(i.roomId, m);
    }
    const lastByRoom = new Map<string, Date>();
    for (const mv of lastMovs) if (mv.roomId && !lastByRoom.has(mv.roomId)) lastByRoom.set(mv.roomId, mv.createdAt);

    const status = (room: (typeof rooms)[number]): 'NO_APLICA' | 'SIN_DOTAR' | 'DOTADO' | 'INCOMPLETO' => {
      if (!room.frigobarEnabled) return 'NO_APLICA';
      const base = baseByType.get(room.roomTypeId) ?? new Map();
      const cur = invByRoom.get(room.id) ?? new Map();
      if (cur.size === 0) return 'SIN_DOTAR';
      // Dotado = mismo conjunto y cantidades que la base; cualquier diferencia = incompleto.
      if (base.size === 0) return 'INCOMPLETO';
      const keys = new Set([...base.keys(), ...cur.keys()]);
      for (const k of keys) if ((base.get(k) ?? 0) !== (cur.get(k) ?? 0)) return 'INCOMPLETO';
      return 'DOTADO';
    };

    return rooms.map((r) => ({
      id: r.id,
      number: r.number,
      type: r.roomType?.name ?? '—',
      floor: r.floor,
      frigobarEnabled: r.frigobarEnabled,
      dotStatus: status(r),
      lastDotacion: lastByRoom.get(r.id) ?? null,
    }));
  },

  /** Activa/desactiva el frigobar en lote (Guardar cambios). */
  async bulkUpdate(scope: RequestScope, dto: BulkFrigobarDto) {
    const branchId = requireActiveBranch(scope);
    const ids = dto.rooms.map((r) => r.roomId);
    const valid = new Set((await prisma.room.findMany({ where: { id: { in: ids }, branchId }, select: { id: true } })).map((r) => r.id));
    let updated = 0;
    for (const r of dto.rooms) {
      if (!valid.has(r.roomId)) continue;
      await prisma.room.update({ where: { id: r.roomId }, data: { frigobarEnabled: r.enabled } });
      updated++;
    }
    return { updated };
  },
};
