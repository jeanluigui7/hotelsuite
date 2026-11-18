import type { RequestScope } from '../../shared/context';
import { ConflictError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import type { CreateReservationDto } from './reservations.schema';

const ACTIVE = ['PENDING', 'CONFIRMED'];

export interface AvailabilityQuery {
  from: Date;
  to: Date;
  roomTypeId?: string;
  requisitos?: string[];
  prepMin?: number;
  vehicles?: number;
  excludeReservationId?: string;
}

interface RoomResult {
  id: string;
  number: string;
  floor: string | null;
  roomTypeId: string;
  roomTypeName: string | null;
  available: boolean;
  reason?: string;
  conflictFrom?: string;
  conflictTo?: string;
  /** Hora límite de ingreso para una estadía de la misma duración antes del próximo conflicto. */
  latestCheckIn?: string;
}

const overlaps = (aFrom: number, aTo: number, bFrom: number, bTo: number): boolean => aFrom < bTo && aTo > bFrom;

/** Capacidad de cochera configurada por sucursal (Setting `ops.parkingCapacity`), o null = sin límite. */
async function parkingCapacity(branchId: string): Promise<number | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key: 'ops.parkingCapacity' } } }).catch(() => null);
  if (!s) return null;
  const n = parseInt(s.value, 10);
  return Number.isNaN(n) ? null : n;
}

export const availabilityService = {
  /**
   * Habitaciones candidatas (del tipo y con los requisitos de atributo) descontando:
   * estancias abiertas, otras reservas activas con la habitación asignada, bloqueos de
   * mantenimiento y el buffer de preparación. Más el estado de la cochera.
   */
  async check(scope: RequestScope, q: AvailabilityQuery) {
    const branchId = requireActiveBranch(scope);
    const prepMs = Math.max(0, q.prepMin ?? 0) * 60000;
    const windowFrom = q.from.getTime() - prepMs;
    const windowTo = q.to.getTime() + prepMs;
    const durationMs = Math.max(60000, q.to.getTime() - q.from.getTime());

    const rooms = await prisma.room.findMany({
      where: { branchId, ...(q.roomTypeId ? { roomTypeId: q.roomTypeId } : {}) },
      select: { id: true, number: true, floor: true, roomTypeId: true, status: true, blocked: true, roomType: { select: { name: true } } },
      orderBy: { number: 'asc' },
    });

    // Filtro por requisitos (atributos del tipo).
    let candidates = rooms;
    const requisitos = (q.requisitos ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
    if (requisitos.length) {
      const typeIds = [...new Set(rooms.map((r) => r.roomTypeId))];
      const attrs = await prisma.roomTypeAttribute.findMany({ where: { roomTypeId: { in: typeIds } }, select: { roomTypeId: true, attribute: { select: { name: true } } } });
      const byType = new Map<string, Set<string>>();
      for (const a of attrs) {
        const set = byType.get(a.roomTypeId) ?? new Set<string>();
        set.add(a.attribute.name.toLowerCase());
        byType.set(a.roomTypeId, set);
      }
      candidates = rooms.filter((r) => requisitos.every((req) => byType.get(r.roomTypeId)?.has(req)));
    }

    const roomIds = candidates.map((r) => r.id);
    const [stays, resRooms] = await Promise.all([
      roomIds.length ? prisma.stay.findMany({ where: { roomId: { in: roomIds }, status: 'OPEN' }, select: { roomId: true, checkInAt: true, plannedCheckoutAt: true } }) : Promise.resolve([]),
      roomIds.length
        ? prisma.reservationRoom.findMany({
            where: { roomId: { in: roomIds }, reservation: { status: { in: ACTIVE }, ...(q.excludeReservationId ? { id: { not: q.excludeReservationId } } : {}) } },
            select: { roomId: true, reservation: { select: { code: true, expectedCheckInAt: true, expectedCheckOutAt: true, durationMinutes: true } } },
          })
        : Promise.resolve([]),
    ]);

    const result: RoomResult[] = candidates.map((room) => {
      const base: RoomResult = { id: room.id, number: room.number, floor: room.floor, roomTypeId: room.roomTypeId, roomTypeName: room.roomType?.name ?? null, available: true };
      if (room.blocked || room.status === 'MAINTENANCE') return { ...base, available: false, reason: 'Habitación bloqueada por mantenimiento' };

      // Conflicto por estancia abierta.
      for (const s of stays.filter((x) => x.roomId === room.id)) {
        const f = s.checkInAt.getTime();
        const t = s.plannedCheckoutAt.getTime();
        if (overlaps(windowFrom, windowTo, f, t)) return { ...base, available: false, reason: 'Ocupada (estancia en curso)', conflictFrom: s.checkInAt.toISOString(), conflictTo: s.plannedCheckoutAt.toISOString() };
      }
      // Conflicto por otra reserva asignada a esta habitación.
      for (const rr of resRooms.filter((x) => x.roomId === room.id)) {
        const f = rr.reservation.expectedCheckInAt.getTime();
        const t = (rr.reservation.expectedCheckOutAt ?? new Date(f + (rr.reservation.durationMinutes || 1440) * 60000)).getTime();
        if (overlaps(windowFrom, windowTo, f, t)) {
          const out: RoomResult = { ...base, available: false, reason: `Reservada (${rr.reservation.code ?? 'otra reserva'})`, conflictFrom: rr.reservation.expectedCheckInAt.toISOString(), conflictTo: new Date(t).toISOString() };
          // Si el conflicto empieza después del ingreso pedido, sugerir la hora límite de ingreso.
          if (f > q.from.getTime()) {
            const latest = f - prepMs - durationMs;
            if (latest > Date.now()) out.latestCheckIn = new Date(latest).toISOString();
          }
          return out;
        }
      }
      return base;
    });

    const cap = await parkingCapacity(branchId);
    let used = 0;
    if ((q.vehicles ?? 0) > 0 || cap !== null) {
      const parkRes = await prisma.reservation.findMany({
        where: { branchId, parkingRequired: true, status: { in: ACTIVE }, ...(q.excludeReservationId ? { id: { not: q.excludeReservationId } } : {}) },
        select: { expectedCheckInAt: true, expectedCheckOutAt: true, durationMinutes: true, parkingVehicles: true },
      });
      for (const r of parkRes) {
        const f = r.expectedCheckInAt.getTime();
        const t = (r.expectedCheckOutAt ?? new Date(f + (r.durationMinutes || 1440) * 60000)).getTime();
        if (overlaps(windowFrom, windowTo, f, t)) used += r.parkingVehicles;
      }
    }
    const requested = q.vehicles ?? 0;
    const available = cap === null ? null : Math.max(0, cap - used);
    const parkingOk = cap === null ? true : requested <= (available ?? 0);

    return {
      from: q.from.toISOString(),
      to: q.to.toISOString(),
      prepMin: q.prepMin ?? 0,
      rooms: result,
      availableCount: result.filter((r) => r.available).length,
      parking: { capacity: cap, used, requested, available, ok: parkingOk },
    };
  },

  /** Valida (server-side) que toda habitación ASIGNADA en el DTO esté libre en la ventana. */
  async assertAssignedRoomsFree(scope: RequestScope, dto: CreateReservationDto, excludeReservationId?: string): Promise<void> {
    const assigned = dto.habitaciones.filter((h) => !!h.roomId);
    if (!assigned.length) return;
    const res = await this.check(scope, { from: dto.entradaAt, to: dto.salidaAt, excludeReservationId });
    const byId = new Map(res.rooms.map((r) => [r.id, r]));
    for (const h of assigned) {
      const r = byId.get(h.roomId!);
      if (r && !r.available) throw new ConflictError(`La habitación ${r.number} no está disponible en ese horario: ${r.reason}`);
    }
  },
};
