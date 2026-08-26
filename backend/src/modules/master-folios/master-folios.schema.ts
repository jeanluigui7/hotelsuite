import { z } from 'zod';

export const createMasterFolioSchema = z.object({
  payerName: z.string().min(1).max(160),
  payerDoc: z.string().max(20).optional().or(z.literal('')),
  payerRuc: z.string().max(20).optional().or(z.literal('')),
  payerAddress: z.string().max(300).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const updateMasterFolioSchema = z.object({
  payerName: z.string().min(1).max(160).optional(),
  payerDoc: z.string().max(20).optional().or(z.literal('')),
  payerRuc: z.string().max(20).optional().or(z.literal('')),
  payerAddress: z.string().max(300).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['OPEN', 'CLOSED', 'BILLED']).optional(),
});

export const addStaySchema = z.object({ stayId: z.string().min(1) });

export const invoiceMasterSchema = z.object({
  type: z.enum(['BOLETA', 'FACTURA']),
  lineKeys: z.array(z.string().min(1)).min(1),
  customerName: z.string().max(160).optional().or(z.literal('')),
  customerDoc: z.string().max(20).optional().or(z.literal('')),
  customerAddress: z.string().max(300).optional().or(z.literal('')),
});
export type InvoiceMasterDto = z.infer<typeof invoiceMasterSchema>;

export type CreateMasterFolioDto = z.infer<typeof createMasterFolioSchema>;
export type UpdateMasterFolioDto = z.infer<typeof updateMasterFolioSchema>;
export type AddStayDto = z.infer<typeof addStaySchema>;
