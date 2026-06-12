# HotelSuite — Manual de usuario detallado

Guía completa del sistema: conceptos, roles, **cómo registrar la información en cada
catálogo y módulo (campo por campo)**, procesos paso a paso con ejemplos, y cómo se
mantiene la integridad de los datos. Pensado para que un usuario nuevo configure y
opere el sistema de principio a fin.

---

## Índice
1. Conceptos generales
2. Roles y accesos
3. **Orden recomendado para configurar una sucursal nueva**
4. Módulo Configuraciones (catálogos maestros)
5. Módulo Inventario
6. Módulo Logística
7. Módulo Operaciones
8. Módulo Finanzas
9. Módulo Recursos Humanos
10. Módulo WhatsApp
11. Módulo Reportes
12. Módulo Tablero
13. Página pública (Landing)
14. Procesos transversales (ciclos completos)
15. Integridad de la información
16. Consejos de registro y buenas prácticas

---

## 1. Conceptos generales

- **Multi-sucursal:** cada dato operativo pertenece a una **sucursal**. La activa se elige en el **selector de la barra superior**; al cambiarla, todas las pantallas muestran los datos de esa sucursal.
- **Inicio de sesión:** correo + contraseña. El menú lateral se arma según los **permisos** del rol del usuario.
- **Permisos = módulo × acción** (`ver`, `crear`, `editar`, `eliminar`, `aprobar`).
- **Patrón de pantallas:** los catálogos se listan en tablas con **paginación, búsqueda y orden**; se crean/editan con un botón **"Nuevo"** que abre un **diálogo** (formulario); se elimina con el ícono de papelera (pide confirmación).
- **Compartido entre sucursales (global):** Clientes (huéspedes), Usuarios y Roles/Permisos. Todo lo demás es por sucursal.
- **Campos obligatorios:** el botón **Guardar** se habilita solo cuando los campos mínimos están completos. Si el servidor rechaza algo, aparece un mensaje rojo (toast) explicando el motivo.

---

## 2. Roles y accesos

| Rol | Módulos | Para qué sirve |
|-----|---------|----------------|
| **Super Admin** | Todo | Configura el sistema y administra todas las sucursales |
| **Gerente** | Tablero, Operaciones, Finanzas, Inventario, Logística, RRHH, Reportes | Supervisión operativa y financiera |
| **Recepcionista** | Tablero, Operaciones, Finanzas | Check-in/out, ventas, caja |
| **Caja** | Tablero, Finanzas | Cobros, comprobantes, arqueo |
| **Supervisor de Limpieza** | Tablero, Operaciones, Inventario | Asignar e inspeccionar limpieza |
| **Personal de Limpieza** | Operaciones | Ejecutar tareas de limpieza |
| **Logística** | Tablero, Inventario, Logística, Reportes | Compras, kardex, reposición |

Los permisos finos se ajustan en **Configuraciones › Autenticación por Roles**.

---

## 3. Orden recomendado para configurar una sucursal nueva

Una sucursal recién creada está **vacía**. Configura los catálogos **en este orden** (cada paso depende del anterior):

1. **Hotel** (datos de la sucursal) → Configuraciones › Hotel
2. **Atributos de Habitación** (WiFi, TV, A/C…) → Configuraciones › Atributos
3. **Tipos de Habitación** (con sus atributos y **tarifas base**) → Configuraciones › Tipos de Habitación
4. **Tiers de Clientes** (descuentos) → Configuraciones › Tiers
5. **Tarifa Personalizada** (opcional, por tier) → Configuraciones › Tarifa Personalizada
6. **Habitaciones** (las unidades físicas) → Operaciones › Habitaciones (admin)
7. **Almacenes** (Productos, Amenities…) → Inventario › Almacenes
8. **Categorías** de inventario → Inventario › Categorías
9. **Artículos** (productos con stock) → Inventario › Artículos
10. **Series de Folios** (boletas/facturas) → Finanzas › Folios Maestros
11. **Items y Servicios** → Configuraciones › Items / Productos y Servicios
12. **Checklist de Inspección** → Configuraciones › Inspección de Limpieza
13. **Máquinas de Lavandería**, **Horarios**, **Pool WiFi** → Configuraciones
14. **Usuarios y Roles** → RRHH › Usuarios / Configuraciones › Roles
15. **Landing Page** (texto de bienvenida) → Configuraciones › Landing Page

> Atajo: para RIZZOS ya se sembró todo esto. Para otra sucursal nueva, sigue la lista.

---

## 4. Módulo Configuraciones (catálogos maestros)

> Patrón general: entra a la pantalla → botón **"Nuevo"** → llena el formulario → **Guardar**. Para editar, ícono de lápiz; para eliminar, papelera.

### 4.1 Sucursales
**Para qué:** crear y administrar las sucursales del hotel.
**Campos:**
- **Nombre** (obligatorio): nombre comercial. Ej. `RIZZOS`.
- **RUC:** identificación fiscal.
- **Razón social:** nombre legal para comprobantes.
- **Dirección, Teléfono, Correo.**
- **Moneda:** código de 3 letras (`PEN`).
- **Hora de corte de turno (0–23):** hora a la que "cierra" el día operativo.
- **Activa:** sí/no.
**Ejemplo:** Nueva sucursal → Nombre `RIZZOS`, RUC `20987654321`, Moneda `PEN`, Corte `6` → Guardar. Luego cámbiate a ella en el selector superior y configura sus catálogos.

### 4.2 Hotel
**Para qué:** editar los datos de la **sucursal activa** (los mismos campos que arriba, pero de la sucursal en la que estás).

### 4.3 Atributos de Habitación
**Para qué:** características que tendrán los tipos de habitación (se muestran como servicios en la landing).
**Campos:** **Nombre** (ej. `WiFi`), **Icono** (clase PrimeIcons, ej. `pi pi-wifi`).
**Ejemplo:** Nuevo → `Aire acondicionado`, icono `pi pi-cloud` → Guardar.

### 4.4 Tipos de Habitación
**Para qué:** definir las categorías de habitación, con sus atributos y **tarifas base**.
**Campos:**
- **Nombre** (ej. `Doble`), **Descripción** (ej. `Habitación con 1 cama de 2 plazas`), **Capacidad** (personas), **Precio base** (referencial).
- **Atributos:** marca los que aplican (WiFi, TV…).
- **Tarifas base:** agrega filas con **Etiqueta** (ej. `Noche (24h)`), **Duración en minutos** (1440 = 24h) y **Precio**.
**Ejemplo:** Nuevo tipo `Doble`, capacidad 2 → marca WiFi/TV/AC → agrega tarifas: `3 horas`/180/30, `Noche (24h)`/1440/80 → Guardar.

### 4.5 Tiers de Clientes
**Para qué:** niveles de cliente con descuento.
**Campos:** **Nombre** (ej. `VIP`), **% Descuento** (0–100), **Descripción**, **Estado**.
**Ejemplo:** `Frecuente`, 8% → Guardar. Al hacer check-in con ese tier, el precio baja 8%.

### 4.6 Clientes (huéspedes)
**Para qué:** registro global de huéspedes (se reutiliza en cualquier sucursal).
**Campos:** **Tipo de documento** (DNI/CE/Pasaporte/RUC), **Número** (único), **Nombres**, **Apellidos**, **Teléfono**, **Correo**, **Notas**.
**Ejemplo:** Nuevo → DNI `40111222`, `María Gonzales`, tel `987111222` → Guardar.

### 4.7 Tarifa Personalizada
**Para qué:** precios especiales por **tier** sobre un tipo/duración (sobrescriben la tarifa base para ese tier).
**Campos:** Tipo de habitación, Tier, Duración, Precio.

### 4.8 Items
**Para qué:** conceptos cobrables/uso interno por categoría (`kind`): **CHECKIN** (extras al ingresar), **RATE** (cargos por tarifa, ej. hora adicional), **SERVICE_PENALTY** (penalidades), **MAINTENANCE** (conceptos de mantenimiento).
**Campos:** **Tipo (kind)**, **Nombre**, **Descripción**, **Precio**, **Estado**.

### 4.9 Inspección de Limpieza (Checklist)
**Para qué:** lista de puntos a verificar al inspeccionar una habitación.
**Campos:** **Nombre** del ítem (ej. `Cambio de sábanas`).
**Ejemplo:** agrega `Cambio de sábanas`, `Limpieza de baño`, `Reposición de amenities`.

### 4.10 Horarios
**Para qué:** turnos del personal.
**Campos:** **Nombre** (ej. `Turno Mañana`), **Hora inicio** (`07:00`), **Hora fin** (`15:00`), **Días** (`1,2,3,4,5,6,7`).

### 4.11 Máquinas de Lavandería
**Para qué:** equipos para las tareas de lavandería.
**Campos:** **Nombre** (ej. `Lavadora 1`), **Capacidad** (ej. `10kg`), **Estado** (disponible/ocupada/mantenimiento).

### 4.12 Pool WiFi
**Para qué:** credenciales/vouchers de WiFi para entregar a huéspedes.
**Campos:** **Red (SSID)**, **Contraseña**, **Voucher** (opcional), **Nota** (opcional), **Estado**.
**Ejemplo:** SSID `Hotel-Huespedes`, clave `bienvenido2026`, nota `Lobby` → Guardar.

### 4.13 Recordatorios
**Para qué:** avisos automáticos (ligados a una plantilla de WhatsApp).
**Campos:** **Nombre**, **Plantilla**, **Disparador** (texto, ej. `1h antes del checkout`), **Activo**.

### 4.14 Landing Page
**Para qué:** personalizar el texto de bienvenida de la página pública.
**Campos:** **Mensaje de bienvenida**.

### 4.15 Autenticación por Roles
**Para qué:** crear roles y asignar permisos (matriz módulo × acción).
**Cómo:** Nuevo rol → nombre/descripción → marca las casillas de permisos por módulo → Guardar.

### 4.16 Permisos por Categoría
**Para qué:** vista del catálogo de permisos del sistema agrupado por módulo (solo lectura/referencia).

### 4.17 Huella Digital (biométrico)
**Para qué:** registrar el lector ZKTeco y enrolar al personal para marcar asistencia.
**Campos:** **IP del dispositivo**, **puerto** (4370), nombre; luego "Enrolar" por usuario.

---

## 5. Módulo Inventario

### 5.1 Almacenes
**Campos:** **Nombre**, **Tipo** (PRODUCTS, AMENITIES, CLEANING, LAUNDRY, RECEPTION, CLOTHING).
**Ejemplo:** `Productos` (PRODUCTS) para lo que se vende; `Amenities` (AMENITIES) para insumos de limpieza.

### 5.2 Áreas
**Campos:** **Nombre** (ej. `Recepción`, `Pisos`), Descripción.

### 5.3 Categorías
**Campos:** **Nombre** (ej. `Bebidas`, `Amenities`), Descripción.

### 5.4 Artículos (productos)
**Para qué:** productos vendibles o insumos, con stock.
**Campos:** **Nombre**, **SKU** (código, opcional), **Categoría**, **Precio de venta**, **Costo**, **Punto de reposición** (alerta de stock bajo), **Estado**, **Stock inicial**.
**Ejemplo:** `Agua mineral`, categoría Bebidas, venta `3.00`, costo `1.20`, reposición `10`, stock `50` → Guardar.

### 5.5 Configuración (de Inventario)
**Campos:** **Almacén por defecto** (de dónde se descuenta al vender), **Punto de reposición por defecto**, **Alerta de stock bajo** (on/off).

### 5.6 Movimientos
**Para qué:** ajustes y transferencias manuales de stock.
- **Ajuste:** producto, almacén, cantidad (+/−), referencia.
- **Transferencia:** producto, almacén origen → destino, cantidad.

### 5.7 Movimientos de Limpieza / Inventario de Limpieza
Vistas filtradas a los almacenes de limpieza/amenities: el Kardex y las existencias de esos insumos.

---

## 6. Módulo Logística

### 6.1 Proveedores
**Campos:** **Nombre/Razón social**, **RUC**, **Contacto**, **Teléfono**, **Correo**.

### 6.2 Ingresos con Factura (compra)
**Para qué:** registrar la entrada de mercadería. **Suma stock**, fija el **último costo** y genera Kardex.
**Campos:** **Proveedor**, **Almacén**, **N° de documento**, y líneas: **Producto**, **Cantidad**, **Costo unitario**.
**Ejemplo:** Proveedor `Distribuidora Andina`, almacén `Productos`, doc `F001-0001` → Agua x50 a 1.20, Gaseosa x40 a 2.50 → Guardar.

### 6.3 Kardex
Selecciona un producto → ves cada movimiento con **saldo corrido**; exporta CSV.

### 6.4 Valorización de Stock / Reporte de Ganancias / Productos a Reponer
- **Valorización:** valor del inventario (cantidad × último costo).
- **Ganancias:** ventas − costo en un rango.
- **Reponer:** productos en/bajo su punto de reposición.

---

## 7. Módulo Operaciones

### 7.1 Habitaciones (mapa)
- Vista de todas las habitaciones por color de estado (Libre/Ocupada/Limpieza/Mantenimiento), refresco automático.
- **Administrar (alta de habitación):** **Número**, **Piso**, **Tipo de habitación**, Notas.
- **Check-in:** clic en habitación **Libre** → "Check-in" → **Tarifa** (define duración y precio), **Tier** (opcional), **Huésped** (existente o nuevo: documento, nombre, teléfono), **Adultos/Niños**, Notas → Confirmar. La habitación pasa a Ocupada; se crea la **Estancia** con precio congelado.
- **Check-out:** desde la habitación ocupada o desde Check-Outs.

### 7.2 Check-Outs
Lista de estancias activas; las **vencidas** (pasaron su hora) salen en naranja. Botón **Check-out** → la habitación pasa a Limpieza.

### 7.3 Frigobar
Carga consumo de minibar a una estancia: selecciona habitación ocupada → agrega productos → **Registrar consumo** (crea venta atada a la estancia y descuenta stock).

### 7.4 Reservas
**Campos:** **Tipo de habitación**, **Fecha esperada**, **Duración**, **Huésped** (registrado o nombre libre + teléfono), Adultos/Niños, Estado (Pendiente/Confirmada). Acción **"Convertir a check-in"** al llegar.

### 7.5 Historial de Estancias
Consulta de estancias (abiertas/cerradas) con filtros.

### 7.6 Productos y Servicios
Gestiona **Servicios** (lavandería, late check-out: nombre + precio) y muestra los **productos** vendibles (solo lectura; se editan en Inventario).

### 7.7 Conserjería
**Campos:** Habitación, **Categoría** (taxi/comida/despertador/otros), **Descripción**, Estado (Pendiente→En progreso→Hecho).

### 7.8 Observaciones
**Campos:** Habitación (opcional), **Título**, **Detalle**, Estado (Abierta/Resuelta).

### 7.9 Historial de Limpiezas
Ciclo de tareas: **Crear** (habitación + asignado) → **Iniciar** → **Completar** (registrando amenities consumidos) → **Inspeccionar** (checklist) → al aprobar, libera la habitación.

### 7.10 Mantenimientos
**Campos:** Habitación, **Título**, **Descripción**, **Costo**, **Programado para**, Estado (Abierto/En progreso/Hecho/Cancelado).

### 7.11 Revisiones
**Campos:** Habitación, **Notas**, Estado (Pendiente/OK/Con observación).

---

## 8. Módulo Finanzas

### 8.1 Cajas
- **Abrir turno:** **Monto inicial**, Notas. (Requisito para poder vender.)
- **Movimientos:** **Tipo** (Ingreso/Egreso), **Monto**, **Concepto**.
- **Cerrar turno:** **Monto contado**; el sistema calcula la diferencia vs lo esperado.

### 8.2 Pagos (POS)
Venta de mostrador: agrega productos (descuenta stock) → agrega **pagos** (Efectivo/Tarjeta/Transferencia/Yape-Plin) → Cobrar. Debe haber turno abierto.

### 8.3 Comprobantes
**Campos:** **Tipo** (Boleta/Factura), **Cliente**, **Documento**, **Total** (o desde una venta). El sistema asigna **folio** y calcula **IGV 18% incluido**. Acción **Anular**.

### 8.4 Folios Maestros
Series de numeración. **Campos:** **Tipo de documento** (BOLETA/FACTURA/NOTE), **Serie** (ej. `B001`). El número correlativo avanza solo.

### 8.5 Panel Fiscal
Resumen del estado de los comprobantes (emitidos/anulados) — representación del PSE (mock).

### 8.6 Tickets (impresión)
Imprime ventas y comprobantes. Con **QZ Tray** conectado imprime directo a la impresora; si no, abre una **vista previa** e imprime por el navegador. Botón de **vista previa** siempre disponible.

---

## 9. Módulo Recursos Humanos

### 9.1 Usuarios
**Campos:** **Nombre**, **Correo** (único, es el login), **Contraseña**, **Rol**, **Sucursales** asignadas.
**Ejemplo:** `Ana Pérez`, `ana@hotel.com`, rol `Recepcionista`, sucursal RIZZOS → Guardar.

### 9.2 Asistencias
Registro de entradas/salidas (manual o por **huella** si hay lector ZKTeco configurado).

### 9.3 Historial de Actividades
Auditoría: qué usuario hizo qué acción y cuándo.

---

## 10. Módulo WhatsApp

### 10.1 Instancias
**Campos:** **Nombre**, **Proveedor** (mock/cloud/twilio), **Número**, Estado, Config. Botón para **probar envío**.

### 10.2 Configuración de Mensajes (plantillas)
**Campos:** **Nombre**, **Cuerpo** con variables `{{nombre}}`, `{{hotel}}`, `{{habitacion}}`.

---

## 11. Módulo Reportes
- **Reporte de Habitaciones:** ocupación por estado.
- **Reporte de Limpiezas / Inspecciones de Limpieza:** estado y resultados.
- **Ventas Detalladas:** líneas de venta por rango (con CSV).
- **Reporte Lavandería.**
- **Cuadro de Turno:** arqueo por turno.
- **Simulador Límite de Productos:** días de cobertura de stock.
- **Rendimiento General:** actividad del personal.
> La mayoría permite **exportar a CSV** y filtrar por fechas.

---

## 12. Módulo Tablero
Resúmenes de la sucursal activa: **Recepción** (ocupación, check-ins/outs, pendientes), **Limpieza** (tareas/inspecciones), **Caja** (cobros por método, esperado), **Control de Turno** (responsable, ventas, esperado). Es la pantalla de inicio.

---

## 13. Página pública (Landing)
Cada sucursal tiene una web pública (sin login):
```
http://<servidor>/landing/<id-de-sucursal>
```
Muestra hero, **servicios**, **habitaciones** con filtro por tipo, "solo disponibles", **tarifas**, disponibilidad y botón **Reservar** (abre WhatsApp al número del hotel), testimonios, ubicación con mapa y contacto. El número de WhatsApp se toma del **teléfono de la sucursal** (Configuraciones › Sucursales).

---

## 14. Procesos transversales (ciclos completos)

1. **Habitación:** Libre → (check-in) Ocupada → (check-out) Limpieza → (inspección aprobada) Libre.
2. **Venta:** turno abierto → venta (descuenta stock + Kardex + pago) → comprobante (folio + IGV) → impresión.
3. **Inventario:** compra con factura (entra stock + costo + Kardex) → consumo/venta (sale stock + Kardex) → valorización/ganancias.
4. **Limpieza:** tarea creada → iniciada → completada (consume amenities) → inspeccionada → habitación liberada.

---

## 15. Integridad de la información

- **Transacciones atómicas (todo o nada)** en los procesos que tocan varias tablas: ventas, compras, movimientos, limpieza, comprobantes, notas, check-in/out, usuarios, roles, tipos de habitación.
- **Stock y Kardex siempre juntos:** ningún cambio de stock queda sin su movimiento de Kardex → nunca se desincronizan.
- **Relaciones protegidas:** todo cuelga de su sucursal; el borrado es controlado para no dejar datos huérfanos.
- **Multi-sucursal estricto:** cada consulta se filtra por la sucursal activa.
- **Precios congelados** en la estancia al hacer check-in.
- **Auditoría** de acciones de escritura (RRHH › Historial de Actividades).
- **Recomendaciones:** cobrar frigobar antes del check-out, cargar fotos de habitaciones, y poner HTTPS+dominio en producción.

---

## 16. Consejos de registro y buenas prácticas

- **Sigue el orden de la sección 3** al dar de alta una sucursal nueva; si saltas pasos (ej. crear habitaciones sin tipos), no podrás continuar.
- **Documentos únicos:** el documento del huésped y el correo del usuario no se repiten.
- **Punto de reposición:** define uno realista por producto para que las alertas de "reponer" sean útiles.
- **Tarifas:** registra las duraciones que realmente vendes (3h, 12h, 24h); la landing y el check-in las usan.
- **Antes de vender:** asegúrate de tener **turno de caja abierto** y **stock** en el almacén por defecto.
- **Antes de emitir comprobantes:** ten creadas las **series de folios** (B001/F001).
- **Backups:** programa el respaldo de la base de datos (`scripts/backup-db.sh`).
- **Seguridad:** cambia la contraseña del admin en producción y usa contraseñas fuertes para los usuarios.
