import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError } from '../../shared/errors';
import { buildOrderBy, pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { wifiRepository } from './wifi.repository';
import type { CreateWifiDto, UpdateWifiDto } from './wifi.schema';

const SORTABLE = ['ssid', 'status', 'createdAt'] as const;

export const wifiService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.WifiCredentialWhereInput = { branchId };
    if (params.search) where.ssid = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      wifiRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'ssid') }),
      wifiRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await wifiRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Credencial WiFi no encontrada');
    }
    return item;
  },

  create(scope: RequestScope, dto: CreateWifiDto) {
    const branchId = requireActiveBranch(scope);
    return wifiRepository.create({
      branchId,
      ssid: dto.ssid,
      password: dto.password,
      voucher: dto.voucher || null,
      note: dto.note || null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateWifiDto) {
    await this.getById(scope, id);
    return wifiRepository.update(id, {
      ssid: dto.ssid,
      password: dto.password,
      voucher: dto.voucher === '' ? null : dto.voucher,
      note: dto.note === '' ? null : dto.note,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return wifiRepository.delete(id);
  },
};
