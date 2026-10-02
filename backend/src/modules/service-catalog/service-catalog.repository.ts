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
              include: { product: { select: { id: true, name: true, category: { select: { name: true } } } } },
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
  activeConceptsForProduct(branchId: string, productId: string, attentionMode: string) {
    return prisma.serviceConcept.findMany({ where: { branchId, productId, attentionMode, status: 'active' }, select: { id: true, name: true } });
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

  // ── Artículos candidatos para "ropa adicional" (reutilizables / ropa / amenities) ──
  linenArticles(branchId: string) {
    return prisma.product.findMany({
      where: {
        branchId,
        status: 'active',
        OR: [{ reusable: true }, { category: { type: { in: ['CLOTHING', 'AMENITY'] } } }],
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, salePrice: true, reusable: true, category: { select: { name: true, type: true } } },
    });
  },
};
