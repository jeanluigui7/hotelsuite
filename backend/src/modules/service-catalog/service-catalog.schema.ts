import { z } from 'zod';

export const SERVICE_TIPOS = ['SERVICIO', 'PENALIDAD'] as const;
export const CONCEPT_UNITS = ['UNIDAD', 'SERVICIO', 'KILOGRAMO'] as const;
export const ATTENTION_MODES = ['NONE', 'LINEN_EXTRA'] as const;

const statusEnum = z.enum(['active', 'inactive']);
const optText = z.string().max(300).optional().or(z.literal(''));

// ── Categoría ──
export const createCategorySchema = z.object({
  tipo: z.enum(SERVICE_TIPOS),
  name: z.string().trim().min(1).max(120),
  description: optText,
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: statusEnum.default('active'),
});
export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: optText,
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: statusEnum.optional(),
});

// ── Grupo ──
export const createGroupSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: optText,
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: statusEnum.default('active'),
});
export const updateGroupSchema = z.object({
  categoryId: z.string().min(1).optional(), // mover a otra categoría del mismo tipo
  name: z.string().trim().min(1).max(120).optional(),
  description: optText,
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: statusEnum.optional(),
});

// ── Concepto ──
export const INVENTORY_ORIGINS = ['ROPA', 'AMENITY'] as const;
export const ARTICLE_SCOPES = ['ALL', 'SPECIFIC'] as const;

// Artículo vinculado: id real (LinenItem para ropa / Product para amenity) + precio específico opcional.
const articleSchema = z.object({
  articleId: z.string().min(1),
  price: z.coerce.number().min(0).max(999999).nullable().optional(),
});

export const createConceptSchema = z.object({
  groupId: z.string().min(1),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  description: optText,
  price: z.coerce.number().min(0).max(999999),
  unit: z.enum(CONCEPT_UNITS).default('UNIDAD'),
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: statusEnum.default('active'),
  allowCourtesy: z.boolean().optional(),
  allowFreeAmount: z.boolean().optional(),
  attentionMode: z.enum(ATTENTION_MODES).default('NONE'),
  // Vinculación con inventario (solo LINEN_EXTRA)
  inventoryOrigin: z.enum(INVENTORY_ORIGINS).nullable().optional(),
  inventoryCategoryId: z.string().min(1).nullable().optional(),
  articleScope: z.enum(ARTICLE_SCOPES).optional(),
  articles: z.array(articleSchema).optional(),
});
export const updateConceptSchema = z.object({
  groupId: z.string().min(1).optional(), // mover a otro grupo del mismo tipo
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  description: optText,
  price: z.coerce.number().min(0).max(999999).optional(),
  unit: z.enum(CONCEPT_UNITS).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: statusEnum.optional(),
  allowCourtesy: z.boolean().optional(),
  allowFreeAmount: z.boolean().optional(),
  attentionMode: z.enum(ATTENTION_MODES).optional(),
  inventoryOrigin: z.enum(INVENTORY_ORIGINS).nullable().optional(),
  inventoryCategoryId: z.string().min(1).nullable().optional(),
  articleScope: z.enum(ARTICLE_SCOPES).optional(),
  articles: z.array(articleSchema).optional(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
export type CreateGroupDto = z.infer<typeof createGroupSchema>;
export type UpdateGroupDto = z.infer<typeof updateGroupSchema>;
export type CreateConceptDto = z.infer<typeof createConceptSchema>;
export type UpdateConceptDto = z.infer<typeof updateConceptSchema>;
