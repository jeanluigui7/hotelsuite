import { z } from 'zod';

/** Common pagination + sorting query params for list endpoints. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().trim().optional(),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Builds the { skip, take } Prisma args from pagination params. */
export function toPrismaPaging(p: PaginationParams): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

/** Builds the response meta for a paginated result. */
export function pageMeta(p: PaginationParams, total: number) {
  return { page: p.page, pageSize: p.pageSize, total };
}

/**
 * Builds a safe Prisma `orderBy` from pagination params, restricted to a whitelist
 * of sortable fields. Falls back to `defaultField` when `sortBy` is absent/invalid.
 */
export function buildOrderBy<T extends string>(
  p: PaginationParams,
  allowed: readonly T[],
  defaultField: T,
): Record<string, 'asc' | 'desc'> {
  const field = p.sortBy && (allowed as readonly string[]).includes(p.sortBy) ? p.sortBy : defaultField;
  return { [field]: p.sortDir };
}
