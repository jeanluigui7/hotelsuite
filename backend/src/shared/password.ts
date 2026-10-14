import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Genera una contraseña temporal fuerte y legible (sin caracteres ambiguos).
 * Se muestra UNA sola vez al administrador; nunca se almacena en texto plano.
 */
export function generateTempPassword(length = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I, O
  const lower = 'abcdefghijkmnpqrstuvwxyz'; // sin l, o
  const digits = '23456789'; // sin 0, 1
  const all = upper + lower + digits;
  // Garantiza al menos una mayúscula, una minúscula y un dígito.
  const chars = [
    upper[randomInt(upper.length)],
    lower[randomInt(lower.length)],
    digits[randomInt(digits.length)],
  ];
  for (let i = chars.length; i < length; i++) chars.push(all[randomInt(all.length)]);
  // Mezcla (Fisher–Yates) para no dejar el patrón fijo al inicio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
