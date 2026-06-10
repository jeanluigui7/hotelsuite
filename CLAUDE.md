# CLAUDE.md — Instrucciones permanentes del proyecto HotelSuite

> Este archivo lo lees automáticamente al inicio de cada sesión. La especificación
> funcional completa, el modelo de datos y el plan por fases están en
> **`PROMPT_SISTEMA_HOTELERO.md`** (en la raíz). Cuando necesites detalle de QUÉ
> construir, léelo. Este archivo define CÓMO trabajar y el ESTADO actual.

---

## Qué estamos construyendo

`HotelSuite`: sistema de gestión hotelera **multi-sucursal** (recepción, habitaciones,
ventas, finanzas, inventario, logística, RRHH, reportes, WhatsApp). UI en **dark mode**,
en español. Detalle completo en `PROMPT_SISTEMA_HOTELERO.md`.

## Stack

- **Frontend:** Angular 17+ (standalone components, signals), lazy loading por feature, dark theme.
- **Backend:** Node.js 20 + Express + TypeScript. Validación con **Zod**. Auth JWT (access + refresh). Logging con pino.
- **Base de datos:** **SQL Server con Prisma** (código agnóstico para poder migrar a PostgreSQL). No usar Mongo salvo que el usuario lo indique.
- **Infra dev:** Docker Compose. Variables en `.env` (nunca commitear `.env`, sí `.env.example`).
- **Integraciones de hardware:** **QZ Tray** para imprimir comprobantes/tickets desde el navegador (módulo Finanzas, FASE 5) y **lector de huella ZKTeco** vía SDK Node `zkteco-js` por TCP puerto 4370 para asistencias (módulo RRHH, FASE 8). Detalle en `PROMPT_SISTEMA_HOTELERO.md` §7.
- **Sin pruebas unitarias.** No generar tests automatizados salvo que el usuario lo pida. Validación manual por fase.

## Reglas de arquitectura (no negociables)

1. **Separación estricta de capas en backend:** `routes → controller → service → repository → DB`.
   - El **controller** solo maneja req/res, sin lógica de negocio.
   - El **service** tiene la lógica y NO conoce Express.
   - El **repository** es lo único que toca Prisma.
2. **Multi-sucursal desde el diseño:** toda entidad operativa lleva `sucursalId`. Toda query se filtra por las sucursales del usuario autenticado (`req.scope.branchIds`).
3. **TypeScript tipado.** Sin `any` salvo justificación explícita.
4. **DTOs validados con Zod.** Respuestas con envelope estándar `{ data, meta, error }`.
5. **Errores centralizados.** Errores de dominio tipados, capturados por un `errorHandler`. Nunca exponer stack traces en producción.
6. **Seguridad por defecto:** RBAC granular (módulo × acción × sucursal), hashing de contraseñas (argon2/bcrypt), rate limiting, sanitización de entrada.
7. **Estructura de carpetas:** monorepo con `frontend/` y `backend/`. Un folder por dominio dentro de `backend/src/modules/` y `frontend/src/app/features/`.

## Convenciones de código

- UI (textos visibles): **español**. Código (variables, funciones, comentarios): **inglés**. Nombres de dominio pueden ir en español si aportan claridad (ej. `Habitacion`).
- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`.
- ESLint + Prettier obligatorios. Componentes Angular standalone.
- Listados siempre con paginación, filtros y ordenamiento.
- Migraciones versionadas; seeds idempotentes.

## Forma de trabajar conmigo (IMPORTANTE)

- **Avanzamos una FASE a la vez** según el plan de `PROMPT_SISTEMA_HOTELERO.md` (§5).
- **No empieces a escribir código sin proponer primero** el plan de la fase y esperar mi OK.
- **No avances a la siguiente fase** hasta que yo escriba "OK fase N".
- Al cerrar cada módulo o fase: propón un **commit**.
- En cada respuesta indica: archivos creados/modificados (ruta completa) y cómo probar.
- Si pierdes contexto, vuelve a leer este archivo y `PROMPT_SISTEMA_HOTELERO.md`.

## Comandos seguros (puedes ejecutarlos sin pedir permiso)

- `npm`, `npx`, `pnpm` (install, run, build, test)
- `docker`, `docker compose`
- `npx prisma` (generate, migrate dev, studio, db seed)
- `git` (status, add, commit, diff, log) — NO hagas `git push` sin pedírmelo
- `ng` (generate, build, serve, test)

> Pide confirmación antes de: borrar archivos/carpetas, resetear la base de datos
> (`prisma migrate reset`), `git push`, o cualquier comando destructivo.

---

## ESTADO ACTUAL DEL PROYECTO

> Actualiza esta sección al cerrar cada fase. Así sabes (y yo sé) dónde retomamos.

- **Fase actual:** FASE 1 — Auth, Roles y Multi-sucursal (pendiente de iniciar; esperar "OK fase 0")
- **Fases completadas:** FASE 0 — Scaffolding e infraestructura ✅
- **Decisiones tomadas en FASE 0:**
  - UI: **PrimeNG 18** (tema dark Aura), no Angular Material.
  - **Angular 18.2.x** (cumple "17+"), monorepo con **npm workspaces**.
  - DB confirmada: **SQL Server 2022 + Prisma**.
  - Docker Desktop **no instalado** en la máquina dev → FASE 0 validada en local (`npm run dev:backend` + `npm run dev:frontend`).
- **Pendientes / notas:**
  - **`.env.example`** no se pudo crear (el harness bloquea archivos `.env*` por seguridad). El contenido está propuesto; crearlo manualmente copiando desde el README/respuesta.
  - `@primeng/themes@18` quedó deprecado a favor de `@primeuix/themes`; funciona para FASE 0, evaluar migración más adelante.
  - Menú Finanzas confirmado: Pagos, Cajas, Tickets, Comprobantes, Panel Fiscal, Folios Maestros.
  - ZKTeco: el bridge debe correr en una red con visibilidad de la IP del huellero. Si el backend va en la nube, proponer agente local.
