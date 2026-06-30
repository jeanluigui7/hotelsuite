import { AppError, NotFoundError, ValidationError } from '../../shared/errors';

const RENIEC_URL = 'https://api.decolecta.com/v1/reniec/dni';

interface DecolectaDni {
  first_name?: string;
  first_last_name?: string;
  second_last_name?: string;
  full_name?: string;
  document_number?: string;
}

export const reniecService = {
  /** Consulta los datos de una persona por DNI en RENIEC (vía decolecta). */
  async lookupDni(numero: string) {
    const token = process.env.RENIEC_TOKEN;
    if (!token) throw new AppError('RENIEC_NOT_CONFIGURED', 'La integración RENIEC no está configurada (falta RENIEC_TOKEN en el .env).', 503);
    const dni = (numero || '').trim();
    if (!/^\d{8}$/.test(dni)) throw new ValidationError('El DNI debe tener 8 dígitos.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(`${RENIEC_URL}?numero=${encodeURIComponent(dni)}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch {
      throw new AppError('RENIEC_UNAVAILABLE', 'No se pudo conectar con RENIEC. Intenta de nuevo.', 502);
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 404) throw new NotFoundError('No se encontró una persona con ese DNI.');
    if (res.status === 401 || res.status === 403) throw new AppError('RENIEC_AUTH', 'La clave de RENIEC es inválida o expiró.', 502);
    if (!res.ok) throw new AppError('RENIEC_ERROR', 'No se pudo consultar RENIEC.', 502);

    const d = (await res.json()) as DecolectaDni;
    if (!d.first_name && !d.full_name) throw new NotFoundError('No se encontró una persona con ese DNI.');
    const lastName = [d.first_last_name, d.second_last_name].filter(Boolean).join(' ').trim();
    return {
      documentType: 'DNI' as const,
      documentNumber: d.document_number ?? dni,
      firstName: (d.first_name ?? '').trim(),
      lastName,
      fullName: d.full_name ?? `${lastName} ${d.first_name ?? ''}`.trim(),
    };
  },
};
