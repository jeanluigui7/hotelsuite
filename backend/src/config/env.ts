import { z } from 'zod';

/**
 * Environment variables validated with Zod.
 * Fail fast on boot if the configuration is invalid.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Optional in FASE 0 (no DB connection required by /health), used from FASE 1 on.
  DATABASE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
