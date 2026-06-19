/**
 * RIZZOS — Avisos al administrador (R5).
 *
 * Notificación best-effort por WhatsApp cuando ocurren solicitudes operativas
 * (pedido de ropa de Limpieza, pedido de productos de Recepción). Reutiliza el
 * WhatsAppProvider (mock por defecto) y registra el envío en MessageLog para que
 * sea auditable desde WhatsApp › Mensajes.
 *
 * Nunca lanza: si no hay teléfono configurado o el envío falla, sólo se loguea y
 * la operación principal continúa.
 */
import { prisma } from '../config/prisma';
import { whatsappProvider } from './whatsapp';

/** Setting key (por sucursal) con el teléfono del administrador a notificar. */
export const ADMIN_PHONE_KEY = 'notify.adminPhone';

async function adminPhone(branchId: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key: ADMIN_PHONE_KEY } } });
  const v = (s?.value ?? '').trim();
  return v || null;
}

/**
 * Envía un aviso al administrador de la sucursal y lo registra en MessageLog.
 * Best-effort: cualquier error se traga (la solicitud no debe fallar por el aviso).
 */
export async function notifyAdmin(branchId: string, body: string): Promise<void> {
  try {
    const to = await adminPhone(branchId);
    if (!to) return; // sin teléfono configurado → no se notifica
    const result = await whatsappProvider.send(to, body);
    await prisma.messageLog.create({
      data: { branchId, to, body, status: result.status, templateId: null },
    });
  } catch {
    // Aviso no crítico: se ignora para no romper el flujo operativo.
  }
}
