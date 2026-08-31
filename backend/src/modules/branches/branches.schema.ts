import { z } from 'zod';

const optStr = (max: number) => z.string().max(max).optional().or(z.literal(''));

export const createBranchSchema = z.object({
  name: z.string().min(2).max(120), // nombre comercial
  legalName: optStr(160), // razón social
  taxId: optStr(20), // RUC
  address: optStr(250),
  // Contacto — teléfono separado en fijo / celular / whatsapp.
  phone: optStr(30), // legado
  landline: optStr(30),
  mobile: optStr(30),
  whatsapp: optStr(30),
  whatsappSameAsMobile: z.coerce.boolean().optional(),
  email: z.string().email().max(160).optional().or(z.literal('')),
  website: optStr(200),
  facebook: optStr(300),
  instagram: optStr(300),
  tiktok: optStr(300),
  mapsUrl: optStr(3000),
  logoUrl: optStr(3_000_000), // logo como data URL
  currency: z.string().length(3).default('PEN'),
  cutoffHour: z.coerce.number().int().min(0).max(23).default(0),
  // Administrador presente: controla el modo de cierre de caja (detallado vs ciego).
  adminPresent: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateBranchSchema = createBranchSchema.partial();

export type CreateBranchDto = z.infer<typeof createBranchSchema>;
export type UpdateBranchDto = z.infer<typeof updateBranchSchema>;
