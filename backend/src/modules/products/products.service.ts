import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { productsRepository, type ProductWithRelations } from './products.repository';
import type { CreateProductDto, UpdateProductDto } from './products.schema';

const SORTABLE = ['name', 'salePrice', 'createdAt', 'status'] as const;

function serialize(p: ProductWithRelations, warehouseId: string) {
  const stockRow = p.stock.find((s) => s.warehouseId === warehouseId);
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    imageUrl: p.imageUrl,
    brand: p.brand,
    reusable: p.reusable,
    productType: p.productType,
    unit: p.unit,
    igvType: p.igvType,
    igvPercent: p.igvPercent,
    taxable: p.taxable,
    category: p.category,
    categoryId: p.categoryId,
    salePrice: p.salePrice,
    cost: p.cost,
    reorderPoint: p.reorderPoint,
    receptionReorderPoint: p.receptionReorderPoint,
    status: p.status,
    stock: stockRow?.quantity ?? 0,
    // Almacén cuyo stock se muestra (para que Ingresar/Baja escriban en el MISMO almacén).
    warehouseId,
  };
}

async function assertCategoryInBranch(categoryId: string | null | undefined, branchId: string): Promise<void> {
  if (!categoryId) return;
  const cat = await prisma.inventoryCategory.findUnique({ where: { id: categoryId } });
  if (!cat || cat.branchId !== branchId) throw new ValidationError('Categoría inválida');
}

export const productsService = {
  async list(scope: RequestScope, params: PaginationParams, area?: string, status?: string) {
    const branchId = requireActiveBranch(scope);
    // El stock mostrado depende del área: general (PRODUCTS) o el almacén de
    // Recepción/Frigobar cuando la venta es de esa área.
    let whId: string;
    if (area === 'RECEPTION' || area === 'FRIGOBAR') {
      const areaWh = await prisma.warehouse.findFirst({ where: { branchId, type: area } });
      whId = areaWh?.id ?? '';
    } else {
      whId = (await productsRepository.defaultWarehouse(branchId)).id;
    }
    const where: Prisma.ProductWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    // Filtro por estado: 'active' | 'inactive'. Sin valor (o 'all') devuelve todos
    // (la grilla admin filtra en cliente); venta/check-in piden solo 'active'.
    if (status === 'active' || status === 'inactive') where.status = status;
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      productsRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      productsRepository.count(where),
    ]);
    return { items: rows.map((p) => serialize(p, whId)), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const p = await productsRepository.findById(id);
    if (!p || p.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Producto no encontrado');
    return p;
  },

  async create(scope: RequestScope, dto: CreateProductDto) {
    const branchId = requireActiveBranch(scope);
    await assertCategoryInBranch(dto.categoryId, branchId);
    const defaultWh = await productsRepository.defaultWarehouse(branchId);
    // Área inicial: almacén donde se coloca el stock inicial (validado por sucursal).
    let initialWh = defaultWh;
    if (dto.initialWarehouseId) {
      const w = await prisma.warehouse.findUnique({ where: { id: dto.initialWarehouseId } });
      if (!w || w.branchId !== branchId) throw new ValidationError('Almacén (área inicial) inválido');
      initialWh = w;
    }
    const p = await productsRepository.create(
      {
        branchId,
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        sku: dto.sku || null,
        barcode: dto.barcode || null,
        imageUrl: dto.imageUrl || null,
        brand: dto.brand || null,
        reusable: dto.reusable,
        productType: dto.productType,
        unit: dto.unit,
        igvType: dto.igvType,
        igvPercent: dto.igvPercent,
        taxable: dto.taxable,
        salePrice: dto.salePrice,
        cost: dto.cost ?? null,
        reorderPoint: dto.reorderPoint,
        receptionReorderPoint: dto.receptionReorderPoint,
        status: dto.status,
      },
      initialWh.id,
      dto.stock,
    );
    return serialize(p, defaultWh.id);
  },

  async update(scope: RequestScope, id: string, dto: UpdateProductDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    await assertCategoryInBranch(dto.categoryId, branchId);
    const wh = await productsRepository.defaultWarehouse(branchId);
    const p = await productsRepository.update(
      id,
      {
        name: dto.name,
        sku: dto.sku === '' ? null : dto.sku,
        barcode: dto.barcode === '' ? null : dto.barcode,
        imageUrl: dto.imageUrl === '' ? null : dto.imageUrl,
        brand: dto.brand === '' ? null : dto.brand,
        reusable: dto.reusable,
        productType: dto.productType,
        unit: dto.unit,
        igvType: dto.igvType,
        igvPercent: dto.igvPercent,
        taxable: dto.taxable,
        salePrice: dto.salePrice,
        cost: dto.cost,
        reorderPoint: dto.reorderPoint,
        receptionReorderPoint: dto.receptionReorderPoint,
        status: dto.status,
        ...(dto.categoryId !== undefined
          ? dto.categoryId
            ? { category: { connect: { id: dto.categoryId } } }
            : { category: { disconnect: true } }
          : {}),
      },
      dto.stock !== undefined ? { warehouseId: wh.id, quantity: dto.stock } : undefined,
    );
    return serialize(p as ProductWithRelations, wh.id);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return productsRepository.delete(id);
  },
};
