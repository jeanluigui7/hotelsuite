/**
 * Invoicing abstraction. FASE 5 ships a local/mock provider; a real PSE
 * (SUNAT/Nubefact/etc.) can implement InvoicingProvider later without touching
 * the domain.
 */

export const IGV_RATE = 0.18;

/** Splits an IGV-inclusive total into taxable base and tax. */
export function computeTax(total: number): { subtotal: number; taxAmount: number } {
  const subtotal = Math.round((total / (1 + IGV_RATE)) * 100) / 100;
  const taxAmount = Math.round((total - subtotal) * 100) / 100;
  return { subtotal, taxAmount };
}

export interface IssueDocInput {
  type: string; // BOLETA | FACTURA | CREDIT | DEBIT
  series: string;
  number: number;
  customerDoc?: string | null;
  customerName: string;
  total: number;
}

export interface IssueDocResult {
  providerStatus: string;
  providerRef: string;
}

export interface InvoicingProvider {
  issue(input: IssueDocInput): Promise<IssueDocResult>;
}

/** Local/mock provider: accepts everything and returns a synthetic reference. */
export class LocalInvoicingProvider implements InvoicingProvider {
  async issue(input: IssueDocInput): Promise<IssueDocResult> {
    return {
      providerStatus: 'ACCEPTED',
      providerRef: `LOCAL-${input.series}-${input.number}`,
    };
  }
}

export const invoicingProvider: InvoicingProvider = new LocalInvoicingProvider();
