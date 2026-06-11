/**
 * WhatsApp abstraction. FASE 9 ships a local/mock provider; a real provider
 * (WhatsApp Cloud API / Twilio) can implement WhatsAppProvider later.
 */

/** Variables disponibles para las plantillas. */
export const TEMPLATE_VARIABLES = ['cliente', 'habitacion', 'fecha', 'hotel', 'total'] as const;

/** Replaces {key} placeholders in the body with the provided values. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? '');
}

export interface SendResult {
  status: string; // SENT | FAILED
}

export interface WhatsAppProvider {
  send(to: string, body: string): Promise<SendResult>;
}

/** Local/mock provider: pretends to send and always succeeds. */
export class LocalWhatsAppProvider implements WhatsAppProvider {
  async send(_to: string, _body: string): Promise<SendResult> {
    return { status: 'SENT' };
  }
}

export const whatsappProvider: WhatsAppProvider = new LocalWhatsAppProvider();
