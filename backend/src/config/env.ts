import { z } from 'zod';

/**
 * Environment variables validated with Zod.
 * Fail fast on boot if the configuration is invalid.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BACKEND_PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z.string().default('http://localhost:4200'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().optional(),

    // Auth
    JWT_ACCESS_SECRET: z.string().default('dev_access_secret_change_me'),
    JWT_REFRESH_SECRET: z.string().default('dev_refresh_secret_change_me'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    REFRESH_COOKIE_NAME: z.string().default('hs_refresh'),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      if (val.JWT_ACCESS_SECRET.startsWith('dev_') || val.JWT_REFRESH_SECRET.startsWith('dev_')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT secrets must be set to strong values in production',
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';
