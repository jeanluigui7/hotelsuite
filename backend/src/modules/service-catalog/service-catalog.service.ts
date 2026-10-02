import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { serviceCatalogRepository as repo } from './service-catalog.repository';
import type {
  CreateCategoryDto, UpdateCategoryDto, CreateGroupDto, UpdateGroupDto, CreateConceptDto, UpdateConceptDto,
} from './service-catalog.schema';

/** Normaliza un nombre para comparar duplicados: sin espacios sobrantes, minúsculas. */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export const serviceCatalogService = {
  /** Árbol completo de un tipo para la pantalla (Categoría → Grupo → Concepto). */
  async tree(scope: RequestScope, tipo: string) {
    const branchId = requireActiveBranch(scope);
    const t = tipo === 'PENALIDAD' ? 'PENALIDAD' : 'SERVICIO';
    return repo.treeByTipo(branchId, t);
  },

  /** Artículos reales candidatos para "ropa adicional" (selector del concepto LINEN_EXTRA). */
  async linenArticles(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    return repo.linenArticles(branchId);
  },

  // ─────────────────────────── Categorías ───────────────────────────
  async createCategory(scope: RequestScope, dto: CreateCategoryDto) {
    const branchId = requireActiveBranch(scope);
    await this.assertCategoryNameFree(branchId, dto.tipo, dto.name, null);
    return repo.createCategory({
      branchId, tipo: dto.tipo, name: dto.name.trim(), description: dto.description || null,
      sortOrder: dto.sortOrder ?? 0, status: dto.status,
      createdByUserId: scope.userId, updatedByUserId: scope.userId,
    });
  },

  async updateCategory(scope: RequestScope, id: string, dto: UpdateCategoryDto) {
    const branchId = requireActiveBranch(scope);
    const cat = await repo.findCategory(id);
    if (!cat || cat.branchId !== branchId) throw new NotFoundError('Categoría no encontrada');
    if (dto.name) await this.assertCategoryNameFree(branchId, cat.tipo, dto.name, id);
    return repo.updateCategory(id, {
      name: dto.name?.trim(), description: dto.description === '' ? null : dto.description,
      sortOrder: dto.sortOrder, status: dto.status, updatedByUserId: scope.userId,
    });
  },

  async removeCategory(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const cat = await repo.findCategory(id);
    if (!cat || cat.branchId !== branchId) throw new NotFoundError('Categoría no encontrada');
    if ((await repo.countGroups(id)) > 0) throw new ValidationError('No se puede eliminar: la categoría contiene grupos. Desactívela en su lugar.');
    await repo.deleteCategory(id);
    return { success: true };
  },

  // ─────────────────────────── Grupos ───────────────────────────
  async createGroup(scope: RequestScope, dto: CreateGroupDto) {
    const branchId = requireActiveBranch(scope);
    const cat = await repo.findCategory(dto.categoryId);
    if (!cat || cat.branchId !== branchId) throw new ValidationError('La categoría no pertenece a la sucursal');
    await this.assertGroupNameFree(dto.categoryId, dto.name, null);
    return repo.createGroup({
      branchId, categoryId: dto.categoryId, name: dto.name.trim(), description: dto.description || null,
      sortOrder: dto.sortOrder ?? 0, status: dto.status,
      createdByUserId: scope.userId, updatedByUserId: scope.userId,
    });
  },

  async updateGroup(scope: RequestScope, id: string, dto: UpdateGroupDto) {
    const branchId = requireActiveBranch(scope);
    const group = await repo.findGroup(id);
    if (!group || group.branchId !== branchId) throw new NotFoundError('Grupo no encontrado');
    let categoryId = group.categoryId;
    if (dto.categoryId && dto.categoryId !== group.categoryId) {
      const target = await repo.findCategory(dto.categoryId);
      if (!target || target.branchId !== branchId) throw new ValidationError('La categoría destino no pertenece a la sucursal');
      if (target.tipo !== group.category.tipo) throw new ValidationError('No se puede mover el grupo a una categoría de otro tipo');
      categoryId = dto.categoryId;
    }
    if (dto.name || categoryId !== group.categoryId) {
      await this.assertGroupNameFree(categoryId, dto.name ?? group.name, id);
    }
    return repo.updateGroup(id, {
      categoryId, name: dto.name?.trim(), description: dto.description === '' ? null : dto.description,
      sortOrder: dto.sortOrder, status: dto.status, updatedByUserId: scope.userId,
    });
  },

  async removeGroup(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const group = await repo.findGroup(id);
    if (!group || group.branchId !== branchId) throw new NotFoundError('Grupo no encontrado');
    if ((await repo.countConcepts(id)) > 0) throw new ValidationError('No se puede eliminar: el grupo contiene conceptos. Desactívelo en su lugar.');
    await repo.deleteGroup(id);
    return { success: true };
  },

  // ─────────────────────────── Conceptos ───────────────────────────
  async createConcept(scope: RequestScope, dto: CreateConceptDto) {
    const branchId = requireActiveBranch(scope);
    const group = await repo.findGroup(dto.groupId);
    if (!group || group.branchId !== branchId) throw new ValidationError('El grupo no pertenece a la sucursal');
    const tipo = group.category.tipo;
    await this.assertConceptCodeFree(branchId, dto.code, null);
    await this.assertConceptNameFree(dto.groupId, dto.name, null);
    const linen = await this.resolveLinen(branchId, tipo, dto.attentionMode, dto.productId ?? null, dto, null);
    return repo.createConcept({
      branchId, groupId: dto.groupId, code: dto.code.trim(), name: dto.name.trim(),
      description: dto.description || null, price: dto.price, unit: dto.unit, sortOrder: dto.sortOrder ?? 0, status: dto.status,
      allowCourtesy: linen.allowCourtesy, allowFreeAmount: dto.allowFreeAmount ?? false,
      attentionMode: linen.attentionMode, productId: linen.productId,
      requiresDelivery: linen.requiresDelivery, requiresReturn: linen.requiresReturn,
      createdByUserId: scope.userId, updatedByUserId: scope.userId,
    });
  },

  async updateConcept(scope: RequestScope, id: string, dto: UpdateConceptDto) {
    const branchId = requireActiveBranch(scope);
    const concept = await repo.findConcept(id);
    if (!concept || concept.branchId !== branchId) throw new NotFoundError('Concepto no encontrado');
    let groupId = concept.groupId;
    let tipo = concept.group.category.tipo;
    if (dto.groupId && dto.groupId !== concept.groupId) {
      const target = await repo.findGroup(dto.groupId);
      if (!target || target.branchId !== branchId) throw new ValidationError('El grupo destino no pertenece a la sucursal');
      if (target.category.tipo !== tipo) throw new ValidationError('No se puede mover el concepto a un grupo de otro tipo');
      groupId = dto.groupId;
      tipo = target.category.tipo;
    }
    if (dto.code && norm(dto.code) !== norm(concept.code)) await this.assertConceptCodeFree(branchId, dto.code, id);
    if (dto.name || groupId !== concept.groupId) await this.assertConceptNameFree(groupId, dto.name ?? concept.name, id);

    const attentionMode = dto.attentionMode ?? concept.attentionMode;
    const productId = dto.productId !== undefined ? dto.productId : concept.productId;
    const linen = await this.resolveLinen(branchId, tipo, attentionMode, productId, dto, id);

    return repo.updateConcept(id, {
      groupId, code: dto.code?.trim(), name: dto.name?.trim(),
      description: dto.description === '' ? null : dto.description,
      price: dto.price, unit: dto.unit, sortOrder: dto.sortOrder, status: dto.status,
      allowCourtesy: linen.allowCourtesy, allowFreeAmount: dto.allowFreeAmount,
      attentionMode: linen.attentionMode, productId: linen.productId,
      requiresDelivery: linen.requiresDelivery, requiresReturn: linen.requiresReturn,
      updatedByUserId: scope.userId,
    });
  },

  async removeConcept(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const concept = await repo.findConcept(id);
    if (!concept || concept.branchId !== branchId) throw new NotFoundError('Concepto no encontrado');
    // FASE 1: los conceptos aún no son referenciados por operaciones (las ventas guardan snapshot,
    // no FK), por lo que eliminar no deja huérfanos. Las fases futuras que lo referencien revalidarán.
    await repo.deleteConcept(id);
    return { success: true };
  },

  // ─────────────────────────── Helpers ───────────────────────────
  /** Resuelve y valida la modalidad de atención + vínculo de ropa adicional. */
  async resolveLinen(
    branchId: string, tipo: string, attentionMode: string, productId: string | null,
    flags: { allowCourtesy?: boolean; requiresDelivery?: boolean; requiresReturn?: boolean },
    selfId: string | null,
  ): Promise<{ attentionMode: string; productId: string | null; requiresDelivery: boolean; requiresReturn: boolean; allowCourtesy: boolean }> {
    // La cortesía solo aplica a servicios; en penalidades siempre falsa.
    const allowCourtesy = tipo === 'PENALIDAD' ? false : flags.allowCourtesy ?? false;
    if (attentionMode === 'LINEN_EXTRA') {
      if (tipo !== 'SERVICIO') throw new ValidationError('La entrega de ropa adicional solo está disponible para servicios');
      if (!productId) throw new ValidationError('Debe vincular un artículo del inventario para la entrega de ropa adicional');
      const product = await prisma.product.findFirst({ where: { id: productId, branchId }, select: { id: true } });
      if (!product) throw new ValidationError('El artículo vinculado no pertenece a la sucursal');
      // Evitar conceptos activos duplicados para el mismo artículo y la misma modalidad de alquiler.
      const dupes = (await repo.activeConceptsForProduct(branchId, productId, 'LINEN_EXTRA')).filter((c) => c.id !== selfId);
      if (dupes.length) throw new ConflictError(`Ya existe un concepto activo de ropa adicional para ese artículo ("${dupes[0].name}").`);
      return { attentionMode, productId, requiresDelivery: flags.requiresDelivery ?? true, requiresReturn: flags.requiresReturn ?? true, allowCourtesy };
    }
    // Sin entrega gestionada: sin artículo ni flags de entrega.
    return { attentionMode: 'NONE', productId: null, requiresDelivery: false, requiresReturn: false, allowCourtesy };
  },

  async assertCategoryNameFree(branchId: string, tipo: string, name: string, excludeId: string | null) {
    const n = norm(name);
    const existing = await repo.categoriesOfTipo(branchId, tipo);
    if (existing.some((c) => c.id !== excludeId && norm(c.name) === n)) {
      throw new ConflictError('Ya existe una categoría con ese nombre en este tipo');
    }
  },
  async assertGroupNameFree(categoryId: string, name: string, excludeId: string | null) {
    const n = norm(name);
    const existing = await repo.groupsOfCategory(categoryId);
    if (existing.some((g) => g.id !== excludeId && norm(g.name) === n)) {
      throw new ConflictError('Ya existe un grupo con ese nombre en esta categoría');
    }
  },
  async assertConceptNameFree(groupId: string, name: string, excludeId: string | null) {
    const n = norm(name);
    const existing = await repo.conceptsOfGroup(groupId);
    if (existing.some((c) => c.id !== excludeId && norm(c.name) === n)) {
      throw new ConflictError('Ya existe un concepto con ese nombre en este grupo');
    }
  },
  async assertConceptCodeFree(branchId: string, code: string, excludeId: string | null) {
    const found = await repo.conceptByCode(branchId, code.trim());
    if (found && found.id !== excludeId) throw new ConflictError(`El código "${code.trim()}" ya está en uso`);
  },
};
