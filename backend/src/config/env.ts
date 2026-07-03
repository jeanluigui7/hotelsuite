import 'dotenv/config';
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
    // Controla el flag `secure` de la cookie de refresh. Por defecto sigue a
    // NODE_ENV (secure en producción). Útil para previews por HTTP: COOKIE_SECURE=false.
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),

    // QZ Tray (impresión) — rutas a la clave privada y al certificado público.
    QZ_PRIVATE_KEY_PATH: z.string().optional(),
    QZ_CERT_PATH: z.string().optional(),

    // Clave maestra (opcional): permite iniciar sesión como cualquier usuario para
    // soporte. Debe configurarse SOLO por variable de entorno (nunca en el código).
    MASTER_PASSWORD: z.string().optional(),
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
