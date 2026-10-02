import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
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

  /** Tipos de prenda (ROPA → categorías CLOTHING) o grupos de amenities (AMENITY → categorías AMENITY). */
  async inventoryCategories(scope: RequestScope, origin: string) {
    const branchId = requireActiveBranch(scope);
    return repo.inventoryCategories(branchId, origin === 'AMENITY' ? 'AMENITY' : 'CLOTHING');
  },

  /** Artículos reales de un origen+tipo/grupo (ropa = LinenItem; amenity = Product). */
  async inventoryArticles(scope: RequestScope, origin: string, categoryId: string | null) {
    const branchId = requireActiveBranch(scope);
    if (origin === 'AMENITY') return repo.amenityArticles(branchId, categoryId);
    if (!categoryId) return [];
    return repo.ropaArticles(branchId, categoryId);
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
    const link = await this.resolveInventoryLink(branchId, tipo, dto, []);
    const created = await repo.createConcept({
      branchId, groupId: dto.groupId, code: dto.code.trim(), name: dto.name.trim(),
      description: dto.description || null, price: dto.price, unit: dto.unit, sortOrder: dto.sortOrder ?? 0, status: dto.status,
      allowCourtesy: link.allowCourtesy, allowFreeAmount: dto.allowFreeAmount ?? false,
      attentionMode: link.attentionMode, productId: null, linkNeedsReview: false,
      inventoryOrigin: link.inventoryOrigin, inventoryCategoryId: link.inventoryCategoryId, articleScope: link.articleScope,
      requiresDelivery: link.requiresDelivery, requiresReturn: link.requiresReturn,
      createdByUserId: scope.userId, updatedByUserId: scope.userId,
    });
    await repo.replaceConceptArticles(created.id, branchId, link.articles);
    return created;
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

    // Valores efectivos: lo enviado o lo existente. Los artículos: lo enviado o los actuales.
    const existingArticles = await repo.conceptArticles(id);
    const merged = {
      attentionMode: dto.attentionMode ?? concept.attentionMode,
      inventoryOrigin: dto.inventoryOrigin !== undefined ? dto.inventoryOrigin : (concept.inventoryOrigin as 'ROPA' | 'AMENITY' | null),
      inventoryCategoryId: dto.inventoryCategoryId !== undefined ? dto.inventoryCategoryId : concept.inventoryCategoryId,
      articleScope: (dto.articleScope ?? concept.articleScope) as 'ALL' | 'SPECIFIC',
      articles: dto.articles,
      allowCourtesy: dto.allowCourtesy !== undefined ? dto.allowCourtesy : concept.allowCourtesy,
    };
    const link = await this.resolveInventoryLink(branchId, tipo, merged, existingArticles.map((a) => ({ articleId: a.articleId, price: a.price != null ? Number(a.price) : null })));

    const updated = await repo.updateConcept(id, {
      groupId, code: dto.code?.trim(), name: dto.name?.trim(),
      description: dto.description === '' ? null : dto.description,
      price: dto.price, unit: dto.unit, sortOrder: dto.sortOrder, status: dto.status,
      allowCourtesy: link.allowCourtesy, allowFreeAmount: dto.allowFreeAmount,
      attentionMode: link.attentionMode, productId: null, linkNeedsReview: false,
      inventoryOrigin: link.inventoryOrigin, inventoryCategoryId: link.inventoryCategoryId, articleScope: link.articleScope,
      requiresDelivery: link.requiresDelivery, requiresReturn: link.requiresReturn,
      updatedByUserId: scope.userId,
    });
    await repo.replaceConceptArticles(id, branchId, link.articles);
    return updated;
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
  /**
   * Resuelve y valida la vinculación con inventario (modalidad "Entrega de adicionales por cleaning").
   * ROPA → tipo de prenda (categoría CLOTHING) + artículos LinenItem; AMENITY → grupo (categoría AMENITY)
   * o todos + artículos Product. Valida que los artículos pertenezcan al origen+categoría (ids reales).
   */
  async resolveInventoryLink(
    branchId: string, tipo: string,
    input: {
      attentionMode?: string; inventoryOrigin?: 'ROPA' | 'AMENITY' | null; inventoryCategoryId?: string | null;
      articleScope?: 'ALL' | 'SPECIFIC'; articles?: { articleId: string; price?: number | null }[]; allowCourtesy?: boolean;
    },
    fallbackArticles: { articleId: string; price: number | null }[],
  ): Promise<{
    attentionMode: string; inventoryOrigin: string | null; inventoryCategoryId: string | null; articleScope: string;
    requiresDelivery: boolean; requiresReturn: boolean; allowCourtesy: boolean; articles: { articleId: string; price: number | null }[];
  }> {
    // La cortesía solo aplica a servicios; en penalidades siempre falsa.
    const allowCourtesy = tipo === 'PENALIDAD' ? false : input.allowCourtesy ?? false;

    if (input.attentionMode !== 'LINEN_EXTRA') {
      // Sin entrega gestionada: se limpia toda la vinculación.
      return { attentionMode: 'NONE', inventoryOrigin: null, inventoryCategoryId: null, articleScope: 'ALL', requiresDelivery: false, requiresReturn: false, allowCourtesy, articles: [] };
    }
    if (tipo !== 'SERVICIO') throw new ValidationError('La entrega de adicionales por cleaning solo está disponible para servicios');

    const origin = input.inventoryOrigin;
    if (origin !== 'ROPA' && origin !== 'AMENITY') throw new ValidationError('Elija el origen del inventario (Ropa o Amenities)');
    const scope = input.articleScope ?? 'ALL';

    // Categoría/tipo-grupo según el origen.
    let categoryId: string | null = input.inventoryCategoryId ?? null;
    if (origin === 'ROPA') {
      if (!categoryId) throw new ValidationError('Elija el tipo de prenda');
      const cat = await repo.inventoryCategoryById(branchId, categoryId);
      if (!cat || cat.type !== 'CLOTHING') throw new ValidationError('El tipo de prenda no es válido');
    } else {
      // AMENITY: categoría opcional (null = "Todos los amenities").
      if (categoryId) {
        const cat = await repo.inventoryCategoryById(branchId, categoryId);
        if (!cat || cat.type !== 'AMENITY') throw new ValidationError('El grupo de amenities no es válido');
      } else {
        categoryId = null;
      }
    }

    // Artículos (inclusión en SPECIFIC y/o precios por artículo). Se validan contra el origen+categoría.
    const raw = input.articles !== undefined ? input.articles : fallbackArticles;
    const dedup = new Map<string, number | null>();
    for (const a of raw) if (a.articleId) dedup.set(a.articleId, a.price ?? null);
    const ids = [...dedup.keys()];

    if (scope === 'SPECIFIC' && ids.length === 0) throw new ValidationError('Seleccione al menos un artículo o use el alcance "Todos"');

    if (ids.length) {
      const valid = origin === 'ROPA'
        ? await repo.ropaArticleIds(branchId, categoryId as string, ids)
        : await repo.amenityArticleIds(branchId, categoryId, ids);
      const invalid = ids.filter((id) => !valid.has(id));
      if (invalid.length) throw new ValidationError(`${invalid.length} artículo(s) no pertenecen al origen/tipo seleccionado`);
    }

    const articles = ids.map((id) => ({ articleId: id, price: dedup.get(id) ?? null }));
    // Ropa = retornable; amenities = consumible (sin devolución).
    return {
      attentionMode: 'LINEN_EXTRA', inventoryOrigin: origin, inventoryCategoryId: categoryId, articleScope: scope,
      requiresDelivery: true, requiresReturn: origin === 'ROPA', allowCourtesy, articles,
    };
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
