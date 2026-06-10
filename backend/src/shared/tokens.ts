import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // userId
  roleId: string;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings (not JWTs). We store only their hash in DB,
 * so a DB leak does not expose usable tokens, and we can revoke/rotate them.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Parses a TTL like "7d" / "15m" / "3600" into milliseconds. */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(ttl.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2] ?? 'ms';
  const factor: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * (factor[unit] ?? 1);
}
