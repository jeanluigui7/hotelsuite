import rateLimit from 'express-rate-limit';
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

/** Strict limiter for auth endpoints (brute-force mitigation). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(tooMany),
});
