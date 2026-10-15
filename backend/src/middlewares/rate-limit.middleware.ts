import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { fail } from '../shared/response';

const tooMany = fail({ code: 'RATE_LIMITED', message: 'Demasiadas solicitudes, intente más tarde' });

/** Global API limiter: generous, mitigates abuse. */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(tooMany),
});

/**
 * Limitador del login (mitigación de fuerza bruta). Clave = correo del intento, NO la IP:
 * todo el hotel sale por una sola IP pública (NAT), así que limitar por IP bloqueaba a varias
 * personas a la vez. Por cuenta, un ataque a un correo no afecta a los demás usuarios.
 * NO se aplica a /auth/refresh (es automático y de alta frecuencia; lo cubre el límite global).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return email || req.ip || 'login';
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(tooMany),
});
