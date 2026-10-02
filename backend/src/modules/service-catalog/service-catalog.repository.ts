import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

/** Acceso a datos del catálogo Servicios/Penalidades (único que toca Prisma). */
export const serviceCatalogRepository = {
  // ── Árbol completo de un tipo (categorías → grupos → conceptos) ──
  treeByTipo(branchId: string, tipo: string) {
    return prisma.serviceCategory.findMany({
      where: { branchId, tipo },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        groups: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            concepts: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: {
                articles: { select: { articleId: true, price: true } },
                inventoryCategory: { select: { id: true, name: true, type: true } },
              },
            },
          },
        },
      },
    });
  },

  // ── Categoría ──
  findCategory(id: string) {
    return prisma.serviceCategory.findUnique({ where: { id } });
  },
  categoriesOfTipo(branchId: string, tipo: string) {
    return prisma.serviceCategory.findMany({ where: { branchId, tipo }, select: { id: true, name: true } });
  },
  createCategory(data: Prisma.ServiceCategoryUncheckedCreateInput) {
    return prisma.serviceCategory.create({ data });
  },
  updateCategory(id: string, data: Prisma.ServiceCategoryUncheckedUpdateInput) {
    return prisma.serviceCategory.update({ where: { id }, data });
  },
  deleteCategory(id: string) {
    return prisma.serviceCategory.delete({ where: { id } });
  },
  countGroups(categoryId: string) {
    return prisma.serviceGroup.count({ where: { categoryId } });
  },

  // ── Grupo ──
  findGroup(id: string) {
    return prisma.serviceGroup.findUnique({ where: { id }, include: { category: { select: { id: true, tipo: true, branchId: true } } } });
  },
  groupsOfCategory(categoryId: string) {
    return prisma.serviceGroup.findMany({ where: { categoryId }, select: { id: true, name: true } });
  },
  createGroup(data: Prisma.ServiceGroupUncheckedCreateInput) {
    return prisma.serviceGroup.create({ data });
  },
  updateGroup(id: string, data: Prisma.ServiceGroupUncheckedUpdateInput) {
    return prisma.serviceGroup.update({ where: { id }, data });
  },
  deleteGroup(id: string) {
    return prisma.serviceGroup.delete({ where: { id } });
  },
  countConcepts(groupId: string) {
    return prisma.serviceConcept.count({ where: { groupId } });
  },

  // ── Concepto ──
  findConcept(id: string) {
    return prisma.serviceConcept.findUnique({ where: { id }, include: { group: { select: { id: true, categoryId: true, branchId: true, category: { select: { tipo: true } } } } } });
  },
  conceptsOfGroup(groupId: string) {
    return prisma.serviceConcept.findMany({ where: { groupId }, select: { id: true, name: true } });
  },
  conceptByCode(branchId: string, code: string) {
    return prisma.serviceConcept.findFirst({ where: { branchId, code } });
  },
  createConcept(data: Prisma.ServiceConceptUncheckedCreateInput) {
    return prisma.serviceConcept.create({ data });
  },
  updateConcept(id: string, data: Prisma.ServiceConceptUncheckedUpdateInput) {
    return prisma.serviceConcept.update({ where: { id }, data });
  },
  deleteConcept(id: string) {
    return prisma.serviceConcept.delete({ where: { id } });
  },

  // ── Artículos vinculados al concepto (inclusión en SPECIFIC + precios por artículo) ──
  conceptArticles(conceptId: string) {
    return prisma.serviceConceptArticle.findMany({ where: { conceptId }, select: { articleId: true, price: true } });
  },
  async replaceConceptArticles(conceptId: string, branchId: string, rows: { articleId: string; price: number | null }[]) {
    await prisma.serviceConceptArticle.deleteMany({ where: { conceptId } });
    if (rows.length) {
      await prisma.serviceConceptArticle.createMany({ data: rows.map((r) => ({ conceptId, branchId, articleId: r.articleId, price: r.price })) });
    }
  },

  // ── Inventario real: tipos de prenda (CLOTHING) y grupos de amenities (AMENITY) ──
  inventoryCategories(branchId: string, type: 'CLOTHING' | 'AMENITY') {
    return prisma.inventoryCategory.findMany({
      where: { branchId, type, status: 'active' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true },
    });
  },
  inventoryCategoryById(branchId: string, id: string) {
    return prisma.inventoryCategory.findFirst({ where: { id, branchId }, select: { id: true, name: true, type: true } });
  },
  /** Artículos de ropa (LinenItem) de un tipo de prenda (categoryId). */
  ropaArticles(branchId: string, categoryId: string) {
    return prisma.linenItem.findMany({
      where: { branchId, categoryId, status: 'active' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, type: true },
    });
  },
  /** Artículos de amenities (Product amenity); por grupo (categoryId) o todos los amenities. */
  amenityArticles(branchId: string, categoryId: string | null) {
    const amenity: Prisma.ProductWhereInput = { OR: [{ productType: 'AMENITY' }, { category: { type: 'AMENITY' } }] };
    return prisma.product.findMany({
      where: { branchId, status: 'active', ...(categoryId ? { categoryId } : amenity) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, sku: true },
    });
  },
  /** IDs válidos de ropa dentro de un tipo (para validar pertenencia en el servidor). */
  async ropaArticleIds(branchId: string, categoryId: string, ids: string[]) {
    const rows = await prisma.linenItem.findMany({ where: { branchId, categoryId, id: { in: ids } }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  },
  /** IDs válidos de amenities (por grupo o todos) para validar pertenencia. */
  async amenityArticleIds(branchId: string, categoryId: string | null, ids: string[]) {
    const amenity: Prisma.ProductWhereInput = { OR: [{ productType: 'AMENITY' }, { category: { type: 'AMENITY' } }] };
    const rows = await prisma.product.findMany({ where: { branchId, id: { in: ids }, ...(categoryId ? { categoryId } : amenity) }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  },
};
