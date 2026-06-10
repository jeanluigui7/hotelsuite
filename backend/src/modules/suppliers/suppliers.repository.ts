import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const suppliersRepository = {
  list(args: {
    where: Prisma.SupplierWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.SupplierOrderByWithRelationInput;
  }) {
    return prisma.supplier.findMany(args);
  },
  count(where: Prisma.SupplierWhereInput) {
    return prisma.supplier.count({ where });
  },
  findById(id: string) {
    return prisma.supplier.findUnique({ where: { id } });
  },
  create(data: Prisma.SupplierUncheckedCreateInput) {
    return prisma.supplier.create({ data });
  },
  update(id: string, data: Prisma.SupplierUpdateInput) {
    return prisma.supplier.update({ where: { id }, data });
  },
  countPurchases(supplierId: string) {
    return prisma.purchaseInvoice.count({ where: { supplierId } });
  },
  delete(id: string) {
    return prisma.supplier.delete({ where: { id } });
  },
};
