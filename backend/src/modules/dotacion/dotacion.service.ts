import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { dotacionRepository } from './dotacion.repository';
import type { CreateDotacionDto, UpdateDotacionDto } from './dotacion.schema';

/** El tipo de habitación debe pertenecer a la sucursal activa. */
async function assertRoomTypeInBranch(roomTypeId: string, branchId: string): Promise<void> {
  const rt = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
  if (!rt || rt.branchId !== branchId) throw new ValidationError('Tipo de habitación inválido');
}

export const dotacionService = {
  async list(scope: RequestScope, roomTypeId?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.RoomTypeDotacionWhereInput = { branchId };
    if (roomTypeId) where.roomTypeId = roomTypeId;
    return dotacionRepository.list(where);
  },

  async getById(scope: RequestScope, id: string) {
    const item = await dotacionRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Ítem de dotación no encontrado');
    return item;
  },

  async create(scope: RequestScope, dto: CreateDotacionDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    return dotacionRepository.create({
      branchId,
      roomTypeId: dto.roomTypeId,
      category: dto.category || null,
      articleKind: dto.articleKind,
      name: dto.name,
      size: dto.size || null,
      linenItemId: dto.linenItemId || null,
      productId: dto.productId || null,
      baseQty: dto.baseQty,
      required: dto.required ?? false,
      allowExtra: dto.allowExtra ?? false,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateDotacionDto) {
    const branchId = requireActiveBranch(scope);
    await this.getById(scope, id);
    if (dto.roomTypeId) await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    return dotacionRepository.update(id, {
      ...(dto.roomTypeId ? { roomType: { connect: { id: dto.roomTypeId } } } : {}),
      category: dto.category === '' ? null : dto.category,
      articleKind: dto.articleKind,
      name: dto.name,
      size: dto.size === '' ? null : dto.size,
      linenItemId: dto.linenItemId === '' ? null : dto.linenItemId,
      productId: dto.productId === '' ? null : dto.productId,
      baseQty: dto.baseQty,
      required: dto.required,
      allowExtra: dto.allowExtra,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return dotacionRepository.delete(id);
  },
};
