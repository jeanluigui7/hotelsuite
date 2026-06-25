import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const include = {
  category: { select: { id: true, name: true } },
  stock: true,
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof include }>;

export const productsRepository = {
  async defaultWarehouse(branchId: string) {
    const existing = await prisma.warehouse.findFirst({
      where: { branchId },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    return prisma.warehouse.create({ data: { branchId, name: 'Productos', type: 'PRODUCTS' } });
  },

  list(args: {
    where: Prisma.ProductWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ProductOrderByWithRelationInput;
  }) {
    return prisma.product.findMany({ ...args, include });
  },
  count(where: Prisma.ProductWhereInput) {
    return prisma.product.count({ where });
  },
  findById(id: string) {
    return prisma.product.findUnique({ where: { id }, include });
  },

  create(
    data: {
      branchId: string;
      categoryId: string | null;
      name: string;
      sku: string | null;
      barcode: string | null;
      imageUrl: string | null;
      brand: string | null;
      reusable: boolean;
      productType: string;
      unit: string;
      igvType: string;
      igvPercent: number;
      taxable: boolean;
      salePrice: number;
      cost: number | null;
      reorderPoint: number;
      receptionReorderPoint: number;
      status: string;
    },
    warehouseId: string,
    stock: number,
  ) {
    return prisma.product.create({
      data: {
        ...data,
        stock: { create: [{ warehouseId, quantity: stock }] },
      },
      include,
    });
  },

  async update(
    id: string,
    data: Prisma.ProductUpdateInput,
    stockUpdate?: { warehouseId: string; quantity: number },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });
      if (stockUpdate) {
        await tx.stock.upsert({
          where: { productId_warehouseId: { productId: id, warehouseId: stockUpdate.warehouseId } },
          update: { quantity: stockUpdate.quantity },
          create: { productId: id, warehouseId: stockUpdate.warehouseId, quantity: stockUpdate.quantity },
        });
      }
      return tx.product.findUnique({ where: { id }, include });
    });
  },

  delete(id: string) {
    return prisma.product.delete({ where: { id } });
  },
};
