import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { renderTemplate, whatsappProvider } from '../../shared/whatsapp';
import { ADMIN_PHONE_KEY } from '../../shared/notify';
import { prisma } from '../../config/prisma';
import { whatsappRepository } from './whatsapp.repository';
import type {
  CreateInstanceDto,
  CreateTemplateDto,
  SendDto,
  UpdateInstanceDto,
  UpdateTemplateDto,
} from './whatsapp.schema';

export const whatsappService = {
  // ── Instances ──
  listInstances(scope: RequestScope) {
    return whatsappRepository.listInstances(requireActiveBranch(scope));
  },
  async getInstance(scope: RequestScope, id: string) {
    const i = await whatsappRepository.findInstance(id);
    if (!i || i.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Instancia no encontrada');
    return i;
  },
  createInstance(scope: RequestScope, dto: CreateInstanceDto) {
    return whatsappRepository.createInstance({
      branchId: requireActiveBranch(scope),
      name: dto.name,
      provider: dto.provider,
      phoneNumber: dto.phoneNumber || null,
      config: dto.config || null,
    });
  },
  async updateInstance(scope: RequestScope, id: string, dto: UpdateInstanceDto) {
    await this.getInstance(scope, id);
    return whatsappRepository.updateInstance(id, {
      name: dto.name,
      provider: dto.provider,
      phoneNumber: dto.phoneNumber === '' ? null : dto.phoneNumber,
      config: dto.config === '' ? null : dto.config,
    });
  },
  async removeInstance(scope: RequestScope, id: string) {
    await this.getInstance(scope, id);
    return whatsappRepository.deleteInstance(id);
  },
  /** Mock connect/disconnect toggle. */
  async toggleInstance(scope: RequestScope, id: string) {
    const i = await this.getInstance(scope, id);
    return whatsappRepository.updateInstance(id, {
      status: i.status === 'connected' ? 'disconnected' : 'connected',
    });
  },

  // ── Templates ──
  listTemplates(scope: RequestScope) {
    return whatsappRepository.listTemplates(requireActiveBranch(scope));
  },
  async getTemplate(scope: RequestScope, id: string) {
    const t = await whatsappRepository.findTemplate(id);
    if (!t || t.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Plantilla no encontrada');
    return t;
  },
  createTemplate(scope: RequestScope, dto: CreateTemplateDto) {
    return whatsappRepository.createTemplate({ branchId: requireActiveBranch(scope), ...dto });
  },
  async updateTemplate(scope: RequestScope, id: string, dto: UpdateTemplateDto) {
    await this.getTemplate(scope, id);
    return whatsappRepository.updateTemplate(id, dto);
  },
  async removeTemplate(scope: RequestScope, id: string) {
    await this.getTemplate(scope, id);
    return whatsappRepository.deleteTemplate(id);
  },

  // ── Send / Logs ──
  async send(scope: RequestScope, dto: SendDto) {
    const branchId = requireActiveBranch(scope);
    let body = dto.body ?? '';
    if (dto.templateId) {
      const template = await this.getTemplate(scope, dto.templateId);
      body = template.body;
    }
    if (!body) throw new ValidationError('Indique una plantilla o un cuerpo de mensaje');

    const rendered = renderTemplate(body, dto.variables);
    const result = await whatsappProvider.send(dto.to, rendered);

    return whatsappRepository.createLog({
      branchId,
      templateId: dto.templateId ?? null,
      to: dto.to,
      body: rendered,
      status: result.status,
    });
  },

  listLogs(scope: RequestScope) {
    return whatsappRepository.listLogs(requireActiveBranch(scope), 100);
  },

  // ── Notify config (teléfono del admin para avisos de solicitudes, R5) ──
  async getNotifyConfig(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key: ADMIN_PHONE_KEY } } });
    return { adminPhone: s?.value ?? '' };
  },
  async setNotifyConfig(scope: RequestScope, adminPhone: string) {
    const branchId = requireActiveBranch(scope);
    const value = adminPhone.trim();
    await prisma.setting.upsert({
      where: { branchId_key: { branchId, key: ADMIN_PHONE_KEY } },
      update: { value },
      create: { branchId, key: ADMIN_PHONE_KEY, value },
    });
    return { adminPhone: value };
  },
};
