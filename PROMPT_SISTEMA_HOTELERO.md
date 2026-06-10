# PROMPT MAESTRO — Sistema de Gestión Hotelera Multi-Sucursal

> **Cómo usar este documento:** Este es el prompt principal que pegarás al **agente de Claude dentro de VS Code (Claude Code)**. Está dividido en fases. No le pidas que haga todo de golpe: avanza **fase por fase**, validando cada entregable antes de pasar a la siguiente. Al inicio de cada sesión, pega la sección "Contexto Permanente" + la fase en la que estás.

---

## 0. CONTEXTO PERMANENTE (pegar siempre al inicio de cada sesión)

Eres un arquitecto de software senior y desarrollador fullstack experto en **Angular, Node.js/Express y bases de datos**. Vamos a construir, de forma incremental y con commits limpios, un **Sistema de Gestión Hotelera multi-sucursal** llamado `HotelSuite`.

**Reglas que debes respetar en TODO momento:**

1. **Arquitectura limpia y por capas.** Separación estricta: `frontend/` (Angular), `backend/` (Node/Express), y la base de datos. Nada de lógica de negocio en controladores ni en componentes.
2. **No avances de fase sin que yo confirme.** Al terminar cada fase, muéstrame qué creaste, cómo probarlo, y espera mi "OK".
3. **Código tipado.** TypeScript en frontend y backend. Sin `any` salvo justificación.
4. **Cada respuesta tuya debe incluir**: los archivos exactos que creas/modificas (ruta completa), y el comando para probar.
5. **Multi-tenant / multi-sucursal desde el diseño.** Toda entidad operativa lleva `sucursalId`. Toda query se filtra por la(s) sucursal(es) del usuario autenticado.
6. **Seguridad por defecto.** Validación de entrada, RBAC, hashing de contraseñas, JWT, rate limiting, sanitización.
7. Idioma de la UI: **español**. Idioma del código (variables, funciones, comentarios técnicos): **inglés**. Nombres de dominio pueden ir en español si aportan claridad (ej. `Habitacion`).

---

## 1. DESCRIPCIÓN FUNCIONAL DEL SISTEMA

`HotelSuite` administra uno o varios hoteles (sucursales). Cubre el ciclo completo: recepción, habitaciones, ventas, finanzas, inventario, logística, RRHH, reportería y mensajería por WhatsApp. La interfaz es **dark mode**, densa en información, orientada a operación en tiempo real.

### 1.1 Módulos (menú principal)

| Módulo | Submódulos / Pantallas |
|--------|------------------------|
| **Tablero (Dashboard)** | Resumen de Recepción/Estancias, Resumen de Limpieza, Resumen de Caja/Dinero, Control Interno del Turno |
| **Operaciones** | Habitaciones, Frigobar, Historial de Estancias, Productos y Servicios, Check-Outs, Reservas, Conserjería, Historial de Limpiezas, Revisiones, Mantenimientos, Observaciones |
| **Finanzas** | Pagos, Cajas, Tickets, Comprobantes, Panel Fiscal, Folios Maestros (más Notas de Crédito/Débito asociadas a comprobantes) |
| **Inventario** | Configuración, Áreas, Categorías, Artículos, Movimientos, Movimientos de Limpieza, **Almacenes** (Productos, Ropa, Recepción, Limpieza, Lavandería, Amenities), Inventario de Limpieza |
| **Logística** | Kardex, Proveedores, Ingresos con Factura, Valorización de Stock, Reporte de Ganancias, Productos a Reponer |
| **Recursos Humanos** | Usuarios, Asistencias, Historial de Actividades |
| **Reportes** | Reporte de Habitaciones, Reporte de Limpiezas, Inspecciones de Limpieza, Ventas Detalladas, Reporte Lavandería, Cuadro de Turno, Simulador Límite Productos, Rendimiento General |
| **WhatsApp** | Instancias, Configuración de Mensajes (plantillas con variables) |
| **Configuraciones** | Hotel, Pool WiFi, Clientes, Tiers de Clientes, Tipos de Habitación, Atributos de Habitación, Tarifa Personalizada, Permisos por Categoría, Inspección de Limpieza, Horarios, Autenticación por Roles, Huella Digital, **Items** (Check-In, Por Tarifa, Servicios/Penalidades, Mantenimiento), Máquinas de Lavandería, Recordatorios, Landing Page, Landing Habitaciones |

### 1.2 Flujos clave (vistos en el diseño)

- **Mapa de habitaciones en tiempo real**: tarjetas por estado (Libre/naranja, Ocupada/azul, Limpieza, Mantenimiento). Cada tarjeta abre acciones.
- **Cambio de estado de habitación / Check-in**: pestañas → Datos del Huésped (tipo de documento, número, plazo de estancia, tarifa), Huéspedes Adicionales, Venta de Productos/Servicios, Métodos de Pago.
- **Tarifas**: por tipo de habitación, tarifa personalizada, tiers de cliente, penalidades.
- **Venta de productos**: a habitación ocupada o cliente externo, con control de stock por almacén.
- **Métodos de pago múltiples** + generación de **comprobante electrónico** (boleta/factura, integración tipo facturación electrónica).
- **Notas de Crédito/Débito** sobre comprobantes existentes.
- **Folio de estancia / Check-out**: consumo total, productos, limpieza, observaciones, cierre y pago.
- **Cierre de caja / Cuadro de turno**: por turno y por usuario, arqueo, ventas por artículo.
- **Limpieza**: asignación, inspección con checklist, movimientos de inventario de limpieza.
- **Reportes**: rendimiento del personal, ventas detalladas, valorización de stock, ganancias.
- **WhatsApp**: instancias conectadas + plantillas de mensajes con variables (`{cliente}`, `{habitacion}`, etc.).

### 1.3 Roles (perfiles)

Configurables vía "Autenticación por Roles" + "Permisos por Categoría". Mínimo:

| Rol | Alcance típico |
|-----|----------------|
| **Super Admin** | Todas las sucursales, configuración global, gestión de usuarios y roles |
| **Administrador de Sucursal / Gerente** | Su sucursal: finanzas, reportes, inventario, RRHH |
| **Recepcionista** | Operaciones: check-in/out, ventas, caja de su turno |
| **Caja** | Caja, comprobantes, arqueo de turno |
| **Supervisor de Limpieza** | Asignación e inspección de limpieza |
| **Personal de Limpieza** | Sus tareas asignadas, cambio de estado de habitación a limpia, checklist |
| **Logística / Almacén** | Inventario, kardex, proveedores, reposición |

El permiso es **granular por módulo y por acción** (ver / crear / editar / eliminar / aprobar), y por sucursal.

---

## 2. STACK TECNOLÓGICO Y DECISIÓN DE BASE DE DATOS

### 2.1 Stack

- **Frontend:** Angular 17+ (standalone components, signals), Angular Material o PrimeNG (dark theme), RxJS, Tailwind opcional para densidad de UI.
- **Backend:** Node.js 20 LTS + Express + TypeScript. Validación con **Zod**. Auth con **JWT** (access + refresh). Logging con **pino**.
- **Base de datos:** ver decisión abajo.
- **ORM/ODM:** **Prisma** (si SQL) o **Mongoose** (si Mongo).
- **Infra dev:** Docker Compose (DB + backend + frontend), `.env` por entorno.
- **Tooling:** ESLint + Prettier + Husky (pre-commit), Conventional Commits.
- **Integraciones de hardware:** **QZ Tray** (impresión de comprobantes/tickets desde el navegador) y **lector de huella ZKTeco** vía SDK Node (asistencias). Ver §9.

### 2.2 Decisión: **SQL Server (recomendado)**

> **Recomendación:** usa **SQL Server con Prisma**.
>
> **Por qué SQL relacional y no Mongo para este caso:** este sistema es intensamente **transaccional y relacional** — caja, comprobantes electrónicos, notas de crédito, kardex, stock por almacén, arqueos de turno. Necesitas **integridad referencial fuerte**, **transacciones ACID** (un check-out toca habitación + caja + inventario + comprobante a la vez) y **reportería con JOINs y agregaciones** (ventas detalladas, valorización de stock, rendimiento). Eso es el terreno natural de una base relacional.
>
> **Mongo** sería preferible solo si el modelo fuera mayormente documental/flexible y con poca necesidad de transacciones cruzadas — no es el caso aquí. Si tu organización ya tiene licencia y experiencia en SQL Server, es la opción más sólida; PostgreSQL es una alternativa equivalente y gratuita si la licencia fuera un problema. **Mantendremos el código agnóstico vía Prisma**, de modo que migrar SQL Server ↔ PostgreSQL sea trivial.

**Conclusión para el agente:** usa **Prisma + SQL Server** salvo que yo indique lo contrario.

---

## 3. ARQUITECTURA

### 3.1 Estructura de carpetas (monorepo)

```
hotelsuite/
├─ docker-compose.yml
├─ .env.example
├─ README.md
├─ backend/
│  ├─ src/
│  │  ├─ config/            # env, db, logger
│  │  ├─ modules/           # un folder por dominio (clean architecture)
│  │  │  ├─ rooms/
│  │  │  │  ├─ room.routes.ts
│  │  │  │  ├─ room.controller.ts      # HTTP: req/res, sin lógica
│  │  │  │  ├─ room.service.ts         # lógica de negocio
│  │  │  │  ├─ room.repository.ts      # acceso a datos (Prisma)
│  │  │  │  ├─ room.schema.ts          # Zod (validación + tipos)
│  │  │  │  └─ room.types.ts
│  │  │  ├─ auth/  guests/  sales/  cashbox/  invoicing/
│  │  │  ├─ inventory/  housekeeping/  logistics/  hr/
│  │  │  ├─ reports/  whatsapp/  branches/  settings/
│  │  ├─ biometrics/        # integración lector ZKTeco (asistencias)
│  │  └─ printing/          # endpoints de impresión / firma QZ Tray
│  │  ├─ middlewares/       # auth, rbac, errorHandler, tenant
│  │  ├─ shared/            # errors, utils, pagination, response
│  │  ├─ app.ts             # express app
│  │  └─ server.ts          # bootstrap
│  ├─ prisma/schema.prisma
└─ frontend/
   └─ src/app/
      ├─ core/              # interceptors, guards, auth, http base
      ├─ shared/            # componentes UI, pipes, directivas, models
      ├─ layout/            # sidebar (menú modular), topbar, shell
      └─ features/          # un módulo lazy-loaded por dominio
         ├─ dashboard/  operations/  finance/  inventory/
         ├─ logistics/  hr/  reports/  whatsapp/  settings/
```

### 3.2 Capas backend (regla de dependencia)

`routes → controller → service → repository → DB`. La dependencia apunta hacia adentro. El **service** no conoce Express; el **repository** es lo único que toca Prisma. Errores de dominio tipados, capturados por un `errorHandler` central.

### 3.3 Multi-sucursal (tenancy)

Middleware `tenant` que, tras `auth`, inyecta `req.scope = { userId, role, branchIds }`. Todo repository recibe ese scope y filtra por `sucursalId`. El Super Admin puede pasar `?branchId=` para cambiar de contexto.

---

## 4. MODELO DE DATOS (entidades núcleo)

Pide al agente generar el `schema.prisma` con al menos estas entidades y relaciones (ajustables):

- **Branch** (sucursal): nombre, dirección, RUC/datos fiscales, config (hora de corte, moneda).
- **User**: nombre, email, passwordHash, estado, `roleId`, relación N:M con `Branch` (un usuario puede operar varias sucursales).
- **Role** + **Permission** + **RolePermission**: RBAC granular (módulo, acción).
- **Attendance** (asistencia), **ActivityLog** (historial de actividades / auditoría).
- **RoomType** (tipo de habitación), **RoomAttribute**, **Room** (habitación: número, piso, estado, `roomTypeId`, `branchId`).
- **Rate / CustomRate / ClientTier** (tarifas, tarifa personalizada, tiers).
- **Guest** (huésped/cliente), documento, contacto.
- **Stay** (estancia): habitación, huésped, huéspedes adicionales, fechas, tarifa, estado.
- **Reservation** (reserva).
- **Product**, **Warehouse** (almacén: Productos/Ropa/Recepción/Limpieza/Lavandería/Amenities), **Stock** (producto×almacén), **InventoryMovement** (Kardex), **InventoryCategory**, **Area**.
- **Sale** + **SaleItem** (venta de productos/servicios a estancia o cliente externo).
- **Payment** (pagos múltiples por venta/estancia) + **PaymentMethod**.
- **Invoice** (comprobante electrónico: boleta/factura) + **CreditDebitNote**.
- **CashSession** (turno de caja) + **CashMovement** (arqueo, ingresos/egresos).
- **Supplier**, **PurchaseInvoice** (ingreso con factura).
- **HousekeepingTask** (limpieza) + **InspectionChecklist** + **InspectionItem**.
- **Maintenance**, **Revision**, **Observation**, **ConciergeRequest**.
- **WhatsAppInstance** + **MessageTemplate** (plantilla con variables).
- **BiometricDevice** (lector ZKTeco: nombre, IP, puerto 4370, `branchId`, estado) + relación con **User** (mapeo `deviceUserId` ↔ usuario del sistema). Las marcas de huella alimentan `Attendance`.
- **Setting** (configuración por sucursal/global).

> Pide diagramas de relaciones y los índices recomendados (ej. `Stock(productId, warehouseId)` único; índices por `branchId` en tablas operativas).

---

## 5. PLAN POR FASES (ejecución incremental)

Trabaja una fase a la vez. **Entregable + cómo probar + esperar OK.**

### FASE 0 — Scaffolding e infraestructura
- Crea el monorepo con la estructura de §3.1.
- `docker-compose.yml`: SQL Server + (opcional) Adminer; servicios `backend` y `frontend`.
- `.env.example`, ESLint, Prettier, Husky, Conventional Commits.
- Backend "hola mundo" con `/health`. Frontend Angular base con layout + sidebar del menú de §1.1 (estático, dark mode).
- **Entregable:** `docker compose up` levanta DB; `GET /health` responde; frontend muestra el shell con el menú.

### FASE 1 — Auth, Roles y Multi-sucursal
- Modelo `User/Role/Permission/Branch` en Prisma + migración + seed (Super Admin + sucursal demo).
- Endpoints: login, refresh, logout, `me`. JWT access+refresh, hashing bcrypt/argon2.
- Middlewares `auth`, `rbac`, `tenant`. Guard + interceptor en Angular. Pantalla de login + selección de sucursal.
- Pantalla **Usuarios** y **Autenticación por Roles** (CRUD + asignación de permisos granulares).
- **Entregable:** login funcional, rutas protegidas por rol, cambio de sucursal.

### FASE 2 — Configuración del Hotel y Catálogos
- CRUD: Hotel/Sucursal, Tipos de Habitación, Atributos, Tarifas, Tarifa Personalizada, Tiers de Clientes, Clientes (Guests), Horarios, Items (Check-In/Por Tarifa/Servicios-Penalidades/Mantenimiento), Áreas, Categorías.
- **Entregable:** catálogos administrables que alimentan operaciones.

### FASE 3 — Operaciones: Habitaciones y Estancias
- **Mapa de habitaciones** en tiempo real (estados por color). 
- Flujo **Check-in / cambio de estado**: datos de huésped, huéspedes adicionales, selección de tarifa, plazo de estancia.
- Reservas, Historial de Estancias, Observaciones, Conserjería.
- **Entregable:** se puede ocupar/liberar una habitación y registrar una estancia completa.

### FASE 4 — Ventas, Pagos y Caja
- Venta de productos/servicios (a estancia o cliente externo) con descuento de stock.
- Pagos múltiples + apertura/cierre de **turno de caja** + arqueo + **Cuadro de Turno**.
- **Entregable:** una venta descuenta stock, registra pago y aparece en el cierre de caja.

### FASE 5 — Comprobantes electrónicos, Notas e Impresión (QZ Tray)
- Submódulo **Finanzas** completo: Pagos, Cajas, Tickets, Comprobantes, Panel Fiscal, **Folios Maestros**.
- Generación de Boleta/Factura, Panel Fiscal, Notas de Crédito/Débito. (Diseña una capa `InvoicingProvider` abstracta para integrar el PSE/facturador real después.)
- **Integración QZ Tray** para imprimir comprobantes y tickets directamente desde el navegador (ver §9.1). Implementa el endpoint de firma en el backend y el servicio de impresión en Angular.
- **Entregable:** emisión de comprobante a partir de una venta, su nota asociada, y la impresión del ticket vía QZ Tray.

### FASE 6 — Inventario, Almacenes y Logística
- Almacenes, Stock por almacén, Movimientos (Kardex), Categorías, Artículos.
- Proveedores, Ingresos con Factura, Valorización de Stock, Productos a Reponer, Reporte de Ganancias.
- **Entregable:** trazabilidad completa de un producto (ingreso → venta → kardex → valorización).

### FASE 7 — Limpieza y Mantenimiento
- Asignación de limpieza, checklist de inspección, Inventario/Movimientos de Limpieza, Lavandería + Máquinas de Lavandería, Mantenimientos, Revisiones.
- **Entregable:** ciclo de limpieza con inspección aprobada y consumo de amenities.

### FASE 8 — RRHH, Biometría (ZKTeco) y Reportería
- Asistencias, Historial de Actividades (auditoría), Rendimiento del Personal.
- **Integración del lector de huella ZKTeco** (ver §9.2): servicio bridge que escucha eventos del dispositivo y registra entradas/salidas en `Attendance`, mapeando el usuario del huellero al usuario del sistema. Pantalla de administración de dispositivos biométricos y de enrolamiento.
- Reportes: Habitaciones, Limpiezas, Ventas Detalladas, Lavandería, Cuadro de Turno, Simulador Límite de Productos, Rendimiento General (con export PDF/Excel).
- **Entregable:** una marca de huella en el dispositivo aparece como asistencia en el sistema; dashboard + reportes con datos reales y exportación.

### FASE 9 — WhatsApp y Landing
- Instancias de WhatsApp, plantillas de mensajes con variables, recordatorios. Landing Page / Landing Habitaciones públicas.
- **Entregable:** envío de mensaje de prueba desde una plantilla.

### FASE 10 — Hardening y despliegue
- Rate limiting, validación exhaustiva, paginación, índices, backups, CI básico, README de despliegue.
- **Entregable:** build de producción documentado.

---

## 6. ESTÁNDARES DE CALIDAD (recordatorio para cada PR)

- DTOs validados con Zod; respuestas con envelope estándar `{ data, meta, error }`.
- Paginación, filtros y ordenamiento en todos los listados.
- Manejo de errores centralizado; nunca exponer stack traces en prod.
- Migraciones versionadas; seeds idempotentes.
- Componentes Angular standalone, lazy loading por feature, estado con signals/servicios.
- Accesibilidad básica y dark theme consistente con el diseño adjunto.
- Conventional Commits (`feat:`, `fix:`, `refactor:`...).

> **Nota:** este proyecto **no incluye pruebas unitarias**. No generes tests automatizados salvo que se te pida explícitamente; valida cada fase de forma manual con los pasos de "cómo probar".

---

## 7. INTEGRACIONES DE HARDWARE

> Dos integraciones distintas y con propósitos diferentes. **No las confundas:** QZ Tray es para **imprimir**, el SDK ZKTeco es para **leer huellas / asistencias**. El huellero NO se conecta por QZ Tray.

### 7.1 QZ Tray — impresión de comprobantes y tickets (módulo Finanzas)

**Qué es y cómo funciona:** QZ Tray es una aplicación de escritorio multiplataforma que corre en segundo plano en la PC del recepcionista/caja y abre un WebSocket local. El frontend (Angular) se conecta a ese WebSocket y le envía trabajos de impresión, que QZ Tray reenvía a la impresora física (térmica de tickets, por ejemplo) sin pasar por el diálogo de impresión del navegador. Funciona en dos partes: el **cliente QZ instalado en la PC** (corre de fondo) y la **librería `qz-tray` incluida en el proyecto** que emite los comandos.

**Seguridad (clave):** la impresión silenciosa requiere que los mensajes vayan **firmados digitalmente**. QZ usa un certificado público y una clave privada. La **clave privada NUNCA va en el frontend** — vive en el backend, que expone un endpoint de firma. Flujo:

```
Angular (qz-tray) ──pide firma──▶ Backend /printing/sign ──firma con clave privada──▶ Angular ──envía job firmado──▶ QZ Tray ──▶ Impresora
```

**Tareas para el agente (en FASE 5):**
- Backend (`modules/printing/`): endpoint `POST /api/printing/sign` que recibe el payload y lo firma con la clave privada (variable de entorno / archivo seguro, nunca commiteado). Generar el par de certificados en setup y documentarlo en el README.
- Frontend: servicio `PrintingService` que use la librería `qz-tray` (npm), conecte al WebSocket (`qz.websocket.connect()`), configure el callback de firma apuntando al backend, encuentre la impresora y envíe el ticket/comprobante (formato ESC/POS o PDF según la impresora).
- UI: botón "Imprimir" en Comprobantes/Tickets, e indicador de estado de conexión con QZ Tray.
- README: pasos para que el usuario descargue QZ Tray de qz.io, lo instale y lo deje corriendo al inicio.

### 7.2 Lector de huella ZKTeco — asistencias (módulo RRHH)

**Qué es y cómo funciona:** el dispositivo ZKTeco de la foto es un equipo de **red** (la pantalla muestra Ethernet / Conexión a PC). Se comunica por **TCP/UDP en el puerto 4370**. Desde Node.js se integra con un SDK como **`zkteco-js`** (npm), que permite conectar, gestionar usuarios, leer logs de asistencia y, lo más importante, **escuchar eventos en tiempo real**: cuando alguien marca su huella, el backend lo recibe al instante (sin polling) y registra la entrada/salida.

**Arquitectura recomendada:** un **servicio bridge** dentro del backend (`modules/biometrics/`) que mantiene la conexión con el/los dispositivo(s) por sucursal. Como el lector está en la red local del hotel, este bridge debe correr donde tenga visibilidad de la IP del equipo (la misma red). Si el backend está en la nube, el agente debe proponer un pequeño **agente local** que reenvíe los eventos al backend por HTTP/WebSocket.

**Tareas para el agente (en FASE 8):**
- Modelo `BiometricDevice` (IP, puerto 4370, `branchId`, estado) y mapeo `deviceUserId ↔ User`.
- Servicio que use `zkteco-js`: `createSocket()`, `getRealTimeLogs(callback)` para escuchar marcas, `setUser`/`deleteUser` para enrolar/quitar, `getAttendances()` para sincronizar histórico, manejo de reconexión ante caídas de red.
- Al recibir una marca: resolver el usuario, determinar si es entrada o salida según el turno/horario, y crear el registro en `Attendance`.
- UI: pantalla de administración de dispositivos (alta, prueba de conexión, estado), enrolamiento de usuarios y vista de asistencias en tiempo real.
- README: cómo configurar la IP fija del dispositivo y la red.

---

## 8. ESTÁNDARES DE CALIDAD ADICIONALES (recordatorio para cada cambio)

(Ver §6.) Prioriza: validación de entrada, manejo de errores tipado, paginación en listados, índices por `branchId`, y consistencia del dark theme con el diseño adjunto.

---

## 9. PRIMER MENSAJE QUE LE DARÁS AL AGENTE EN VS CODE

> Copia esto como tu primer prompt real, después de tener el repo abierto:

```
Lee el archivo PROMPT_SISTEMA_HOTELERO.md de la raíz. Vamos a construir el sistema HotelSuite siguiendo ese documento, fase por fase. 

Empieza por la FASE 0 (Scaffolding e infraestructura). Antes de escribir código:
1. Propón la estructura final de carpetas y el contenido de docker-compose.yml y .env.example.
2. Confirma la decisión de base de datos (SQL Server + Prisma) o sugiere alternativa con justificación.
3. Espera mi OK y recién entonces crea los archivos.

No avances a la FASE 1 hasta que yo te diga "OK fase 0".
```

---

## 10. CONSEJOS PARA TRABAJAR CON EL AGENTE DE CLAUDE EN VS CODE

- **Una fase por sesión.** Cierra cada fase con commit y pídele un resumen de lo hecho.
- **Si pierde contexto**, vuelve a pegar §0 (Contexto Permanente) + la fase actual.
- **Revisa las migraciones** antes de aplicarlas a una DB con datos.
- **Versiona el `schema.prisma`** y revisa los diffs: es el corazón del sistema.
- Usa las imágenes del PPTX como **referencia visual**: cuando construyas una pantalla, descríbele el layout (columnas, pestañas, colores de estado) o adjúntale la captura específica.
```
