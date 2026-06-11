import type { RequestScope } from '../../shared/context';
import { NotFoundError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { remindersRepository } from './reminders.repository';
import type { CreateReminderDto, UpdateReminderDto } from './reminders.schema';

export const remindersService = {
  list(scope: RequestScope) {
    return remindersRepository.list(requireActiveBranch(scope));
  },

  async getById(scope: RequestScope, id: string) {
    const r = await remindersRepository.findById(id);
    if (!r || r.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Recordatorio no encontrado');
    return r;
  },

  create(scope: RequestScope, dto: CreateReminderDto) {
    return remindersRepository.create({
      branchId: requireActiveBranch(scope),
      name: dto.name,
      templateId: dto.templateId ?? null,
      trigger: dto.trigger || null,
      active: dto.active,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateReminderDto) {
    await this.getById(scope, id);
    return remindersRepository.update(id, {
      name: dto.name,
      templateId: dto.templateId === undefined ? undefined : dto.templateId,
      trigger: dto.trigger === '' ? null : dto.trigger,
      active: dto.active,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return remindersRepository.delete(id);
  },
};
