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

- **Fase actual:** FASE 9 — WhatsApp y Landing (pendiente; esperar "OK fase 8")
- **Fases completadas:** FASE 0 ✅ · 1 ✅ · 2 ✅ · 3 ✅ · 4 ✅ · 5 ✅ · 6 ✅ · 7 ✅ · 8 (8A+8B+8C) ✅
- **Implementado en FASE 8:**
  - 8A: Attendance + ActivityLog + middleware de auditoría automático; módulos attendance/activity-log/performance. UI RRHH › Asistencias/Actividades, Reportes › Rendimiento.
  - 8B: BiometricDevice + DeviceEnrollment; bridge `zkteco-js` 1.7.1 (test/enroll/realtime guardados); módulo biometrics (RBAC settings); marca → Attendance BIOMETRIC. UI Configuraciones › Huella Digital.
  - 8C: módulo `reports` (rooms/housekeeping/sales-detailed/product-limit); UI Reportes › Habitaciones/Limpiezas/Ventas Detalladas/Simulador con export CSV.
- **Implementado en FASE 7:**
  - Prisma: ChecklistItem, HousekeepingTask, TaskInspection, Maintenance, Revision, LaundryMachine, LaundryTask.
  - Backend: `checklist`+`housekeeping` (ciclo de limpieza con consumo de amenities vía Kardex e inspección que libera la habitación), `maintenance`, `revisions`, `laundry-machines` (settings), `laundry-tasks` (reports).
  - Frontend: Configuraciones › Inspección de Limpieza / Máquinas de Lavandería; Operaciones › Historial de Limpiezas / Mantenimientos / Revisiones; Reportes › Reporte Lavandería.
- **Implementado en FASE 6:**
  - Prisma: InventoryMovement (Kardex signed), Product.reorderPoint, SaleItem.unitCost, Supplier, PurchaseInvoice(+Item).
  - Backend: `warehouses`, `movements` (Kardex/ajuste/transferencia; la venta escribe SALE + unitCost), `suppliers`, `purchases` (ingreso → stock + último costo + PURCHASE), `logistics` (valorización, reponer, ganancias). RBAC inventory/logistics.
  - Frontend: Inventario › Almacenes/Movimientos/Artículos(reorder); Logística › Proveedores/Ingresos/Valorización/Reponer/Ganancias.
  - **Trazabilidad completa:** ingreso con factura → venta → kardex → valorización/ganancias.
- **Implementado en FASE 5:**
  - 5A: FolioSeries, Invoice (Boleta/Factura, IGV 18% incluido), CreditDebitNote; capa `InvoicingProvider` mock; módulos folios/invoices/notes/fiscal; UI Comprobantes/Folios Maestros/Panel Fiscal.
  - 5B: backend `printing` (GET /printing/certificate, POST /printing/sign RSA-SHA512, config `QZ_*`); frontend `PrintingService` (qz-tray) + Finanzas › Tickets (estado QZ + imprimir ventas/comprobantes). README con setup de QZ Tray + certificados.
  - **Nota:** imprimir de verdad requiere instalar QZ Tray + impresora; sin `QZ_*` el sign endpoint da 503.
- **Implementado en FASE 4:**
  - Prisma: Warehouse, Product, Stock, CashSession, Sale, SaleItem, Payment, CashMovement. Seed: almacén "Productos" + 2 productos con stock.
  - Backend: `products` (RBAC inventory), `cash` (turno + movimientos + historial + cuadro de turno; RBAC finance/reports), `sales` (venta atada a turno, descuenta stock, pagos múltiples; RBAC finance). Métodos de pago fijos (CASH/CARD/TRANSFER/WALLET).
  - Frontend: Inventario › Artículos; Finanzas › Cajas (turno, arqueo, movimientos) y Pagos (POS); Reportes › Cuadro de Turno.
  - **Pendiente validación con DB:** migrar + probar venta→stock→cierre de caja→cuadro de turno.
- **Implementado en FASE 3:**
  - Prisma: Room, Stay (precio congelado en priceAgreed), StayGuest, Reservation, Observation, ConciergeRequest. Seed con 3 habitaciones.
  - Backend (RBAC `operations`): `rooms` (CRUD + `/rooms/map` + PATCH status), `stays` (check-in transaccional + check-out + historial), `reservations` (por tipo, estados), `observations`, `concierge`.
  - Frontend Operaciones: Habitaciones (mapa polling 15s + check-in/out + admin), Historial de Estancias, Reservas (con "convertir a check-in"), Observaciones, Conserjería.
  - **Pendiente validación con DB:** migrar + seed y probar el ciclo completo.
- **Implementado en FASE 2A:**
  - Prisma: RoomType, RoomAttribute, RoomTypeAttribute (N:M), ClientTier, Guest (global), Rate (por duración), CustomRate, Setting; campos de hotel en Branch. Cascadas secundarias en `NoAction` (SQL Server) con limpieza de hijos en repos. Seed con catálogos demo.
  - Backend: módulos room-attributes, room-types (con atributos), client-tiers, guests, rates+custom-rates (en capas, scope multi-sucursal, RBAC `settings`).
  - Frontend: `CrudApi` genérico + `CatalogApiService`; pantallas Hotel, Tipos de Habitación (atributos + tarifas base), Atributos, Tiers, Clientes, Tarifa Personalizada.
  - **2B:** backend areas, inventory-categories, items (filtro por kind), schedules. Frontend: Inventario › Áreas/Categorías, Configuraciones › Items/Horarios.
  - **Pendiente validación con DB:** correr `prisma migrate dev` + seed y probar todos los CRUD de catálogos.
- **Implementado en FASE 1:**
  - Backend: modelos Prisma (Branch/User/Role/Permission/RolePermission/UserBranch/RefreshToken) + seed idempotente.
  - Auth JWT (access en memoria + refresh opaco hasheado en cookie httpOnly con rotación), bcryptjs.
  - Middlewares `authenticate`/`tenant` (req.scope)/`requirePermission` (RBAC módulo×acción).
  - Módulos en capas: `users`, `roles`, `branches` (paginación/filtro/orden, Zod, envelope).
  - Frontend: login + selección de sucursal, interceptor con refresh, guards, switcher de sucursal, sidebar por permisos, pantallas Usuarios (CRUD) y Autenticación por Roles (matriz).
  - **Pendiente de validación manual con DB:** falta correr `prisma migrate dev` + seed contra el SQL Server del usuario y probar login E2E.
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
