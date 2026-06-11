# HotelSuite

Sistema de gestión hotelera **multi-sucursal**: recepción, habitaciones, ventas, finanzas,
inventario, logística, RRHH, reportes y WhatsApp. UI en **dark mode**, en español.

> Documentación funcional completa, modelo de datos y plan por fases en
> [`PROMPT_SISTEMA_HOTELERO.md`](./PROMPT_SISTEMA_HOTELERO.md).
> Instrucciones de trabajo y estado del proyecto en [`CLAUDE.md`](./CLAUDE.md).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Angular 18 (standalone + signals), **PrimeNG** (tema dark Aura), lazy loading por feature |
| Backend | Node.js 20 + Express + TypeScript, Zod, JWT, pino |
| Base de datos | **SQL Server 2022** + **Prisma** (agnóstico, migrable a PostgreSQL) |
| Infra dev | Docker Compose (SQL Server + Adminer + backend + frontend) |
| Calidad | ESLint + Prettier + Husky + Conventional Commits |

## Estructura (monorepo con npm workspaces)

```
hotelsuite/
├─ docker-compose.yml      # SQL Server + Adminer + backend + frontend
├─ .env.example            # plantilla de variables (copiar a .env)
├─ backend/                # Express + TS (routes → controller → service → repository)
└─ frontend/               # Angular 18 + PrimeNG (layout + features lazy)
```

## Requisitos

- Node.js 20 LTS y npm 10+
- (Opcional) Docker Desktop, si quieres levantar SQL Server + Adminer en contenedores

## Puesta en marcha (desarrollo local)

```bash
# 1. Instalar dependencias de todos los workspaces
npm install

# 2. Crear el archivo de entorno
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env

# 3a. Backend (http://localhost:3000)
npm run dev:backend
#    Health check:  GET http://localhost:3000/api/health

# 3b. Frontend (http://localhost:4200)
npm run dev:frontend
```

### Con Docker (cuando tengas Docker Desktop)

```bash
cp .env.example .env
docker compose up -d db adminer   # solo la base de datos + Adminer (http://localhost:8080)
docker compose up                 # toda la stack
```

## Base de datos (Prisma)

```bash
cd backend
npm run prisma:generate           # genera el cliente Prisma
npm run prisma:migrate            # aplica migraciones (desde FASE 1)
npm run prisma:studio             # explorador visual
```

> El modelo de datos (`schema.prisma`) se completa a partir de la **FASE 1**.

## Impresión con QZ Tray (FASE 5)

Para imprimir tickets/comprobantes directo a la impresora desde el navegador:

1. **Instala QZ Tray** desde [qz.io/download](https://qz.io/download/) en la PC de caja/recepción y déjalo corriendo (corre de fondo y abre un WebSocket local).
2. **Genera el par de certificados** (la clave privada vive solo en el backend, **nunca se commitea**):
   ```bash
   mkdir -p backend/certs
   openssl req -x509 -newkey rsa:2048 -days 3650 -nodes \
     -keyout backend/certs/private-key.pem \
     -out backend/certs/cert.pem \
     -subj "/CN=HotelSuite"
   ```
3. **Configura el `.env`** del backend:
   ```bash
   QZ_PRIVATE_KEY_PATH=./certs/private-key.pem
   QZ_CERT_PATH=./certs/cert.pem
   ```
4. El backend expone `GET /api/printing/certificate` y `POST /api/printing/sign` (firma RSA-SHA512). El frontend (`PrintingService` con `qz-tray`) se conecta al WebSocket de QZ, usa esos endpoints para firmar y envía el ticket a la impresora.
5. En **Finanzas › Tickets** verás el indicador de conexión y el botón **Imprimir**. Para evitar el prompt de "sitio no confiable" de QZ, instala el `cert.pem` como certificado confiable de QZ Tray (Advanced → Site Manager).

> `backend/certs/`, `*.pem` y `*.key` están en `.gitignore`. Si `QZ_*` no está configurado, el endpoint responde 503 y la UI muestra "QZ no configurado".

## Despliegue a producción (FASE 10)

Build de producción con Docker (SQL Server + backend + frontend con nginx).

1. **Variables de entorno** — crea `.env` en la raíz (mismas claves que `.env.example` pero con valores reales). Imprescindibles en producción:
   ```bash
   NODE_ENV=production
   MSSQL_SA_PASSWORD=<clave-fuerte>
   DATABASE_URL="sqlserver://db:1433;database=hotelsuite;user=sa;password=<clave-fuerte>;encrypt=true;trustServerCertificate=true"
   JWT_ACCESS_SECRET=<aleatorio-largo>
   JWT_REFRESH_SECRET=<aleatorio-largo>
   CORS_ORIGIN=https://tu-dominio.com
   # QZ Tray (opcional): QZ_PRIVATE_KEY_PATH / QZ_CERT_PATH
   ```
   > El arranque falla si `JWT_*` siguen con valores `dev_*` en `NODE_ENV=production` (validación en `config/env.ts`).

2. **Levantar la stack**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   - El backend ejecuta `prisma migrate deploy` al arrancar (aplica migraciones).
   - El frontend (nginx) sirve el build de Angular en el puerto **80** y hace proxy de `/api` al backend.

3. **Seed inicial** (primera vez, opcional):
   ```bash
   docker compose -f docker-compose.prod.yml exec backend npx prisma db seed
   ```

4. **Backups**: `./scripts/backup-db.sh` (respalda la BD del contenedor; programable por cron). Ver el script para el ejemplo de cron.

### Migraciones

```bash
npm run prisma:migrate -w backend     # dev: crea y aplica migración
npx prisma migrate deploy             # prod: aplica migraciones existentes (lo hace el contenedor)
```

### CI

`.github/workflows/ci.yml` corre en cada push/PR a `main`: install + `prisma generate` + lint + build de backend y frontend.

### Checklist de producción

- [ ] `.env` con secretos fuertes (no `dev_*`) y `CORS_ORIGIN` real.
- [ ] HTTPS por delante (reverse proxy/Ingress); cookie de refresh `secure` se activa con `NODE_ENV=production`.
- [ ] Backups programados (`scripts/backup-db.sh`).
- [ ] Rate limiting activo (global + login) — ya configurado.
- [ ] Revisar logs (pino) y monitoreo de `/api/health`.

## Convenciones

- Commits: **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`…), validados por commitlint vía Husky.
- UI en español; código (variables/funciones/comentarios) en inglés.
- Sin pruebas automatizadas (validación manual por fase).

## Estado

Ver la sección **ESTADO ACTUAL DEL PROYECTO** en [`CLAUDE.md`](./CLAUDE.md).
