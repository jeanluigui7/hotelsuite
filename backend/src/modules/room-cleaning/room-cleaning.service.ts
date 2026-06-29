import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import type { RetiroDto, ReposicionDto, FinalizarDto } from './room-cleaning.schema';

const DIRTY = 'Ropa Sucia Pendiente';
const CLEAN_WH = 'Almacén de Limpieza';

async function getRoom(scope: RequestScope, roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { roomType: { select: { id: true, name: true } } } });
  if (!room || room.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Habitación no encontrada');
  return room;
}

/** Resta el stock de la habitación (suelo 0) y devuelve el delta realmente retirado. */
async function decRoomInv(tx: typeof prisma, branchId: string, roomId: string, articleKind: string, name: string, qty: number) {
  const key = { roomId_articleKind_name: { roomId, articleKind, name } };
  const existing = await tx.roomInventory.findUnique({ where: key });
  const current = existing?.quantity ?? 0;
  const removed = Math.min(current, qty);
  if (existing) await tx.roomInventory.update({ where: key, data: { quantity: current - removed } });
  return removed;
}

export const roomCleaningService = {
  /** FASE 1 — Retiro de ropa/artículos de la habitación hacia Ropa Sucia Pendiente (con incidencias). */
  async retiro(scope: RequestScope, roomId: string, dto: RetiroDto) {
    const room = await getRoom(scope, roomId);
    const branchId = room.branchId;
    await prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        const removed = await decRoomInv(tx as never, branchId, roomId, it.articleKind, it.name, it.quantity);
        if (removed <= 0) continue;
        // Dañada/Faltante = incidencia (no vuelve como stock normal); el resto va a Ropa Sucia.
        const type = it.incidencia === 'DANADA' ? 'DAMAGED' : it.incidencia === 'FALTANTE' ? 'LOST' : 'LIMPIEZA_RETIRO';
        const to = it.incidencia === 'DANADA' ? 'Incidencia: prenda dañada' : it.incidencia === 'FALTANTE' ? 'Incidencia: prenda faltante' : DIRTY;
        await tx.roomInventoryMovement.create({
          data: {
            branchId, roomId, type, articleKind: it.articleKind, name: it.name, quantity: -removed,
            fromLocation: `Habitación ${room.number}`, toLocation: to,
            reference: 'Retiro por limpieza', note: it.incidencia !== 'OK' ? it.incidencia : (dto.note || null),
            createdByUserId: scope.userId,
          },
        });
      }
    });
    return { ok: true };
  },

  /** FASE 2 — Reposición de la habitación desde el Almacén de Limpieza. */
  async reposicion(scope: RequestScope, roomId: string, dto: ReposicionDto) {
    const room = await getRoom(scope, roomId);
    const branchId = room.branchId;
    await prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        const key = { roomId_articleKind_name: { roomId, articleKind: it.articleKind, name: it.name } };
        await tx.roomInventory.upsert({
          where: key,
          update: { quantity: { increment: it.quantity } },
          create: { branchId, roomId, articleKind: it.articleKind, name: it.name, quantity: it.quantity },
        });
        await tx.roomInventoryMovement.create({
          data: {
            branchId, roomId, type: 'LIMPIEZA_REPO', articleKind: it.articleKind, name: it.name, quantity: it.quantity,
            fromLocation: CLEAN_WH, toLocation: `Habitación ${room.number}`,
            reference: 'Reposición por limpieza', note: dto.note || null, createdByUserId: scope.userId,
          },
        });
      }
    });
    return { ok: true };
  },

  /**
   * Finaliza la limpieza y pasa la habitación a DISPONIBLE si los ítems obligatorios de la
   * dotación base están completos. Si faltan, exige una excepción (motivo + autorizado por).
   */
  async finalizar(scope: RequestScope, roomId: string, dto: FinalizarDto) {
    const room = await getRoom(scope, roomId);
    if (room.status === 'OCCUPIED') throw new ValidationError('La habitación está ocupada; realice el check-out');
    const branchId = room.branchId;
    const [dot, inv] = await Promise.all([
      prisma.roomTypeDotacion.findMany({ where: { branchId, roomTypeId: room.roomTypeId, status: 'active', required: true } }),
      prisma.roomInventory.findMany({ where: { roomId } }),
    ]);
    const invMap = new Map(inv.map((i) => [`${i.articleKind}|${i.name}`, i.quantity]));
    const faltantes = dot
      .map((d) => ({ name: d.name, articleKind: d.articleKind, baseQty: d.baseQty, actual: invMap.get(`${d.articleKind}|${d.name}`) ?? 0 }))
      .filter((f) => f.actual < f.baseQty);

    if (faltantes.length && !dto.exception) {
      throw new ValidationError(
        `No se puede dejar disponible: faltan ítems obligatorios (${faltantes.map((f) => `${f.name} ${f.actual}/${f.baseQty}`).join(', ')}). Requiere una excepción autorizada.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.room.update({ where: { id: roomId }, data: { status: 'FREE' } });
      if (dto.exception) {
        await tx.roomInventoryMovement.create({
          data: {
            branchId, roomId, type: 'EXCEPTION', articleKind: 'NONE', name: 'Excepción de disponibilidad', quantity: 0,
            toLocation: `Habitación ${room.number}`, reference: 'Disponible con excepción',
            note: `${dto.exception.motivo} | Autorizó: ${dto.exception.autorizadoPor}`, createdByUserId: scope.userId,
          },
        });
      }
    });
    return { ok: true, status: 'FREE', faltantes, excepcion: dto.exception ?? null };
  },
};
