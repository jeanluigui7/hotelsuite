import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/** Flujo de limpieza RIZZOS: iniciar limpieza (recoger ropa con estado OK/ROBADA/DETERIORADA)
 *  → habitación EN CURSO → finalizar limpieza → Disponible. */

const CLEANABLE = ['CLEANING', 'LIMPIEZA_EN_ESPERA', 'LIMPIEZA_EN_CURSO', 'LIMPIEZA_SOLICITADA', 'REQUIERE_REPASO'];

export const startSchema = z.object({
  inspections: z
    .array(
      z.object({
        linenItemId: z.string().min(1).optional(),
        description: z.string().min(1).max(200),
        state: z.enum(['OK', 'ROBADA', 'DETERIORADA']).default('OK'),
        pickup: z.boolean().default(false),
      }),
    )
    .default([]),
});
export type StartDto = z.infer<typeof startSchema>;

export const requestLinenSchema = z.object({
  items: z.array(z.object({ linenItemId: z.string().min(1), floor: z.string().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
});
export const laundrySchema = z.object({
  linenItemId: z.string().min(1),
  floor: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  reason: z.string().max(200).optional(),
});
export type RequestLinenDto = z.infer<typeof requestLinenSchema>;
export type LaundryDto = z.infer<typeof laundrySchema>;

export const cleaningService = {
  /** Ítems de ropa de la sucursal (para el modal de recoger ropa). */
  async linenItems(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const items = await prisma.linenItem.findMany({ where: { branchId, status: 'active' }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    return items.map((i) => ({ id: i.id, type: i.type, name: i.name, color: i.color, reusable: i.reusable }));
  },

  /** Habitaciones que requieren limpieza/repaso, con su tarea en curso si existe. */
  async roomsToClean(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const rooms = await prisma.room.findMany({
      where: { branchId, status: { in: CLEANABLE } },
      include: { roomType: { select: { name: true } } },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
    const tasks = await prisma.housekeepingTask.findMany({ where: { branchId, status: 'IN_PROGRESS' } });
    const taskByRoom = new Map(tasks.map((t) => [t.roomId, t.id]));
    return rooms.map((r) => ({
      id: r.id,
      number: r.number,
      floor: r.floor,
      status: r.status,
      typeName: r.roomType.name,
      repaso: r.status === 'REQUIERE_REPASO',
      enCurso: r.status === 'LIMPIEZA_EN_CURSO' || taskByRoom.has(r.id),
      taskId: taskByRoom.get(r.id) ?? null,
    }));
  },

  /** Inicia la limpieza: crea la tarea con la inspección de ropa y deja la habitación EN CURSO. */
  async start(scope: RequestScope, roomId: string, dto: StartDto) {
    const branchId = requireActiveBranch(scope);
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.branchId !== branchId) throw new ValidationError('Habitación no encontrada');
    if (!CLEANABLE.includes(room.status)) throw new ValidationError('La habitación no está pendiente de limpieza');

    const task = await prisma.housekeepingTask.create({
      data: {
        branchId,
        roomId,
        assignedToUserId: scope.userId,
        status: 'IN_PROGRESS',
        result: 'PENDING',
        linenInspections: {
          create: dto.inspections.map((i) => ({
            description: i.description,
            linenItemId: i.linenItemId ?? null,
            state: i.state,
            pickup: i.pickup,
          })),
        },
      },
    });
    await prisma.room.update({ where: { id: roomId }, data: { status: 'LIMPIEZA_EN_CURSO' } });
    return { taskId: task.id };
  },

  /** Finaliza la limpieza: cierra la tarea y deja la habitación Disponible. */
  async finish(scope: RequestScope, roomId: string) {
    const branchId = requireActiveBranch(scope);
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.branchId !== branchId) throw new ValidationError('Habitación no encontrada');
    const task = await prisma.housekeepingTask.findFirst({ where: { branchId, roomId, status: 'IN_PROGRESS' } });
    if (task) {
      await prisma.housekeepingTask.update({ where: { id: task.id }, data: { status: 'DONE', result: 'APPROVED', completedAt: new Date() } });
    }
    await prisma.room.update({ where: { id: roomId }, data: { status: 'FREE' } });
    return { ok: true };
  },

  /** Inventario de ropa por pisos: REM (remanente) y SUM (suministrado) por tipo/ítem. */
  async linenInventory(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [items, stocks] = await Promise.all([
      prisma.linenItem.findMany({ where: { branchId, status: 'active' }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      prisma.linenStock.findMany({ where: { branchId } }),
    ]);
    const floors = [...new Set(stocks.map((s) => s.floor))].sort();
    const key = (li: string, f: string) => `${li}|${f}`;
    const stockMap = new Map(stocks.map((s) => [key(s.linenItemId, s.floor), s]));
    return {
      floors: floors.map((floor) => ({
        floor,
        rows: items.map((it) => {
          const s = stockMap.get(key(it.id, floor));
          return { linenItemId: it.id, type: it.type, name: it.name, color: it.color, rem: s?.rem ?? 0, sum: s?.sum ?? 0 };
        }),
      })),
    };
  },

  /** Solicita ropa al almacén/administrador (queda como movimiento REQUEST pendiente). */
  async requestLinen(scope: RequestScope, dto: RequestLinenDto) {
    const branchId = requireActiveBranch(scope);
    for (const i of dto.items) {
      await prisma.linenMovement.create({
        data: { branchId, linenItemId: i.linenItemId, type: 'REQUEST', quantity: i.quantity, floor: i.floor, reference: 'Solicitud de limpieza', createdByUserId: scope.userId },
      });
    }
    // Aviso al administrador (mock; se integrará con WhatsApp real cuando se configure).
    return { requested: dto.items.length };
  },

  /** Envía prenda manchada/deteriorada a lavandería (descuenta del remanente). */
  async sendToLaundry(scope: RequestScope, dto: LaundryDto) {
    const branchId = requireActiveBranch(scope);
    const stock = await prisma.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId: dto.linenItemId, floor: dto.floor } } });
    if (!stock || stock.branchId !== branchId || stock.rem < dto.quantity) throw new ValidationError('Cantidad insuficiente en el remanente');
    await prisma.$transaction([
      prisma.linenStock.update({ where: { linenItemId_floor: { linenItemId: dto.linenItemId, floor: dto.floor } }, data: { rem: { decrement: dto.quantity } } }),
      prisma.linenMovement.create({ data: { branchId, linenItemId: dto.linenItemId, type: 'LAUNDRY', quantity: -dto.quantity, floor: dto.floor, reference: dto.reason || 'Manchada/Deteriorada', createdByUserId: scope.userId } }),
    ]);
    return { ok: true };
  },
};
