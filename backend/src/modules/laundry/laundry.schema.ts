import { z } from 'zod';

export const moveSchema = z.object({
  items: z
    .array(
      z.object({
        articleKind: z.string().min(1).max(30).default('LINEN_REUSABLE'),
        name: z.string().min(1).max(120),
        quantity: z.coerce.number().int().min(1),
      }),
    )
    .min(1),
});

export type MoveDto = z.infer<typeof moveSchema>;
