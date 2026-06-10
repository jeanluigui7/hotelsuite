// Prisma client singleton.
// NOTE: Not imported by the running app in FASE 0 (no models / no DB needed for /health).
// It becomes the single DB access point from FASE 1 onward (only repositories use it).
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
