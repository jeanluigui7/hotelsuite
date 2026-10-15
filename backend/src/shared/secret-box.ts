import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { env } from '../config/env';

/**
 * Cifrado REVERSIBLE (AES-256-GCM) para guardar la contraseña recuperable y que el cargo máximo
 * pueda consultarla. La llave se deriva del secreto del servidor (JWT_ACCESS_SECRET), así que el
 * dato NO se puede descifrar solo con la base de datos: hace falta el secreto del backend.
 *
 * ⚠️ A diferencia del hash (irreversible) de `passwordHash`, esto SÍ es recuperable; úsese solo
 * para la visualización administrativa que el dueño del sistema solicitó explícitamente.
 */
const KEY = scryptSync(env.JWT_ACCESS_SECRET, 'hotelsuite.pwview.v1', 32);

/** Cifra un texto y devuelve base64(iv | tag | ciphertext). */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Descifra lo producido por sealSecret. Devuelve null si falta o no se puede descifrar. */
export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const buf = Buffer.from(sealed, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
