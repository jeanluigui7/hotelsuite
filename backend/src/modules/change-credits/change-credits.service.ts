import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { NotFoundError, ConflictError } from '../../shared/errors';
import { prisma } from '../../config/prisma';
import { cashRepository } from '../cash/cash.repository';

/**
 * Saldo de VUELTO pendiente por estancia (subsistema A). Nace cuando el cliente entrega de más y el
 * vuelto "queda pendiente": el efectivo permanece físicamente en el cajón, así que se registra un
 * INGRESO de efectivo como PASIVO (no como ingreso por concepto). El saldo vive en la estancia y
 * sobrevive al cierre de caja. Se entrega (EGRESO en la caja abierta), se consume como pago (método
 * VUELTO, A2) o se cierra como NO_RECLAMADO al terminar la estancia (A3).
 */
export const createPendingChangeSchema = z.object({
  stayId: z.string().min(1),
  amount: z.coerce.number().positive(),
  note: z.string().max(200).optional().or(z.literal('')),
});
export type CreatePendingChangeDto = z.infer<typeof createPendingChangeSchema>;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const changeCreditsService = {
  /** Crea un vuelto pendiente al check-in y registra el efectivo como pasivo (IN) en la caja abierta. */
  async createPending(scope: RequestScope, dto: CreatePendingChangeDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await prisma.stay.findUnique({ where: { id: dto.stayId }, include: { room: { select: { number: true } } } });
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
    const session = await cashRepository.findOpen(branchId);
    if (!session) throw new ConflictError('No hay caja abierta para registrar el vuelto pendiente.');
    const room = stay.room?.number ?? null;
    const amount = round2(dto.amount);

    return prisma.$transaction(async (tx) => {
      const credit = await tx.changeCredit.create({
        data: {
          branchId, stayId: stay.id, guestId: stay.guestId, room, originSessionId: session.id,
          amount, remaining: amount, status: 'PENDIENTE', createdByUserId: scope.userId, note: dto.note?.trim() || null,
        },
      });
      // Efectivo que quedó en el cajón = PASIVO. IN de efectivo → entra al esperado (no falso sobrante),
      // pero NO es ingreso por concepto (los movimientos IN de efectivo van a Ajustes, no a byMethod).
      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id, branchId, type: 'IN', amount, method: 'CASH', category: 'MOVEMENT',
          concept: `Vuelto pendiente - Hab. ${room ?? '?'}`, note: `changeCredit:${credit.id}`, createdByUserId: scope.userId,
        },
      });
      return credit;
    });
  },

  /** Saldo de vuelto pendiente (suma) de una estancia. Para validar pagos con método VUELTO. */
  async remainingForStay(branchId: string, stayId: string): Promise<number> {
    const credits = await prisma.changeCredit.findMany({ where: { branchId, stayId, status: 'PENDIENTE' }, select: { remaining: true } });
    return round2(credits.reduce((a, c) => a + Number(c.remaining), 0));
  },

  /**
   * Consume `amount` del saldo de vuelto de una estancia (FIFO por antigüedad). Marca CONSUMIDO el
   * crédito que llega a 0. NO mueve caja (el efectivo ya estaba en el cajón; la venta VUELTO es el
   * ingreso por concepto). Se llama tras crear una venta pagada con método VUELTO.
   */
  async consumeForStay(branchId: string, stayId: string, amount: number): Promise<void> {
    let left = round2(amount);
    const credits = await prisma.changeCredit.findMany({ where: { branchId, stayId, status: 'PENDIENTE' }, orderBy: { createdAt: 'asc' } });
    for (const c of credits) {
      if (left <= 0) break;
      const rem = Number(c.remaining);
      const take = Math.min(rem, left);
      const newRem = round2(rem - take);
      await prisma.changeCredit.update({
        where: { id: c.id },
        data: { remaining: newRem, status: newRem <= 0.001 ? 'CONSUMIDO' : 'PENDIENTE', closedAt: newRem <= 0.001 ? new Date() : null },
      });
      left = round2(left - take);
    }
    if (left > 0.001) throw new ConflictError('Saldo de vuelto insuficiente para cubrir el pago.');
  },

  /** Vuelto pendiente de una estancia (para la card): saldo total + créditos individuales. */
  async pendingByStay(scope: RequestScope, stayId: string) {
    const branchId = requireActiveBranch(scope);
    const credits = await prisma.changeCredit.findMany({
      where: { branchId, stayId, status: 'PENDIENTE' }, orderBy: { createdAt: 'asc' },
    });
    const remaining = round2(credits.reduce((a, c) => a + Number(c.remaining), 0));
    return { stayId, remaining, credits: credits.map((c) => ({ id: c.id, amount: Number(c.amount), remaining: Number(c.remaining), createdAt: c.createdAt, room: c.room })) };
  },

  /** Todos los vueltos pendientes de la sucursal (para pintar el indicador en el mapa de habitaciones). */
  async pendingAll(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const credits = await prisma.changeCredit.findMany({ where: { branchId, status: 'PENDIENTE' } });
    const byStay = new Map<string, { stayId: string; room: string | null; remaining: number }>();
    for (const c of credits) {
      const e = byStay.get(c.stayId) ?? { stayId: c.stayId, room: c.room, remaining: 0 };
      e.remaining = round2(e.remaining + Number(c.remaining));
      byStay.set(c.stayId, e);
    }
    return [...byStay.values()];
  },

  /** Entrega TODO el vuelto pendiente de una estancia en un solo egreso (para la card). */
  async deliverByStay(scope: RequestScope, stayId: string) {
    const branchId = requireActiveBranch(scope);
    const credits = await prisma.changeCredit.findMany({ where: { branchId, stayId, status: 'PENDIENTE' } });
    if (!credits.length) throw new ConflictError('No hay vuelto pendiente para esta estancia.');
    const session = await cashRepository.findOpen(branchId);
    if (!session) throw new ConflictError('Abre una caja para poder entregar el vuelto.');
    const total = round2(credits.reduce((a, c) => a + Number(c.remaining), 0));
    const room = credits[0].room;
    return prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id, branchId, type: 'OUT', amount: total, method: 'CASH', category: 'MOVEMENT',
          concept: `Entrega de vuelto - Hab. ${room ?? '?'}`, note: `changeCredit:stay:${stayId}`, createdByUserId: scope.userId,
        },
      });
      await tx.changeCredit.updateMany({
        where: { id: { in: credits.map((c) => c.id) } },
        data: { status: 'ENTREGADO', remaining: 0, closedAt: new Date(), closedSessionId: session.id },
      });
      return { delivered: total, count: credits.length };
    });
  },

  /** Entrega el vuelto pendiente: EGRESO de efectivo en la caja ABIERTA actual y cierra el crédito. */
  async deliver(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const credit = await prisma.changeCredit.findUnique({ where: { id } });
    if (!credit || credit.branchId !== branchId) throw new NotFoundError('Vuelto no encontrado');
    if (credit.status !== 'PENDIENTE') throw new ConflictError('Este vuelto ya no está pendiente.');
    const session = await cashRepository.findOpen(branchId);
    if (!session) throw new ConflictError('Abre una caja para poder entregar el vuelto.');
    const rem = round2(Number(credit.remaining));

    return prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id, branchId, type: 'OUT', amount: rem, method: 'CASH', category: 'MOVEMENT',
          concept: `Entrega de vuelto - Hab. ${credit.room ?? '?'}`, note: `changeCredit:${credit.id}`, createdByUserId: scope.userId,
        },
      });
      return tx.changeCredit.update({
        where: { id }, data: { status: 'ENTREGADO', remaining: 0, closedAt: new Date(), closedSessionId: session.id },
      });
    });
  },
};
