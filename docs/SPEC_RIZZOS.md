# RIZZOS — Interpretación del spec del cliente y plan de construcción

> Interpretación del documento **SISTEMA RIZZOS.docx** (lógica de negocio + 140 imágenes de
> formularios), organizada para guiar la adaptación del sistema a medida. Fuente: el Word del
> cliente (no se versiona; está en `.gitignore`). Este documento sí se versiona.

---

## 1. Sistema de diseño (basado en las imágenes)

- **Tema oscuro** (fondo navy/negro ~`#0b1018`–`#0e1420`), tarjetas con esquinas redondeadas.
- **Acentos por perfil/sección:** Limpieza usa **verde/teal** (`#10b981`); marca RIZZOS combina **verde** y **magenta/rosa** (`#ec4899`, visto en login).
- **Estados de habitación con color semántico (tarjetas tipo "card" con degradado):**
  - **Disponible** → verde
  - **Inspeccionando / Limpieza en curso** → gris / amarillo
  - **Limpieza en espera / Limpieza** → naranja
  - **Requieren repaso** (falló inspección) → rojo
  - **Ocupada** → (color propio), **Reservada**, **Mantenimiento** (bloqueada si crítica)
- **Tablas de ropa:** encabezados de color por tipo (TOALLAS rosa, SÁBANAS púrpura, EDREDONES naranja), filas **REM** (rojo, remanente) y **SUM** (verde, suministrado).
- **Vistas de habitaciones:** conmutador **Normal / Compacta / Real**.
- **Botones de acción** redondeados, modales oscuros, tooltips con nombre+stock.

> Decisión: el área operativa adopta este **tema oscuro RIZZOS** (hoy la app está en claro). Es un cambio visual transversal.

---

## 2. Estados de habitación (máquina de estados)

`Disponible → Reservada → Ocupada → (check-out) Limpieza en espera → Limpieza solicitada → Limpieza en curso → (inspección OK) Disponible`
- **Requiere repaso:** si la inspección falla, vuelve a rojo "Requieren Repaso".
- **Mantenimiento:** el admin/recepción la manda; habitaciones críticas quedan **bloqueadas** hasta resolver.
- **En revisión de mantenimiento / revisión periódica:** estado durante revisiones del personal de limpieza.

> Hoy `Room.status` solo tiene FREE|OCCUPIED|CLEANING|MAINTENANCE → hay que **ampliar a ~8 estados**.

---

## 3. Perfil LIMPIEZA

**Menú:** Inicio, Habitaciones, Historial, Inventario Limpieza, Revisiones, Movimientos, Reporte Turno. Usuario abajo. Acento verde.

- **Turno:** "Finalizar turno" **bloqueado** si hay limpiezas en progreso o si no se ha enviado toda la ropa a lavandería. Al cerrar turno (o por horario) la ropa "sube" y el siguiente personal la cuenta en almacén.
- **Gestión de Habitaciones:**
  - **Requieren Repaso** (rojo) → Iniciar Repaso.
  - **Iniciar Limpieza** → modal "FASE 1: Recoger Ropa y Amenities" con los ítems de la habitación: cada ítem con **Estado OK / ROBADA / DETERIORADA** (OK verde por defecto; si ROBADA se deshabilita el checkbox) y checkbox **Recoger**. Reglas: RECOGER (sábanas/toallas → lavandería y se reponen; edredones a lavandería pero NO se reponen), DEJAR (permanece, sin reposición), ROBADA/AUSENTE ("—", se reponen automáticamente), DETERIORADA (fuera + RECOGER).
  - **SIGUIENTE** → modal detalle → **CONFIRMAR RECOJO** → la habitación queda amarilla "EN CURSO" → al terminar **Finalizar Limpieza**.
  - **Revisión Periódica:** Finalizar Revisión Periódica → modal con **acciones** (mobiliario, baño, limpieza de paredes…), **tipo de falla**, **foto** y observaciones → Finalizar (Todo OK ⇒ habitación Disponible).
  - **Estado:** botón para cambiar estado de la habitación (modal).
  - **Mantenimiento** (admin/recepción también): modal con secciones (ej. BAÑO) → Confirmar Mantenimiento.
- **Prenda manchada:** seleccionar prenda → "Manchada/Deteriorada" → modal → "Enviar a lavandería" (disminuye cantidad).
- **Reporte Turno:** ropa contada de todas las habitaciones + limpiezas/mantenimientos; Ver detalle por artículo → **Exportar PDF**; botón **Lavandería** → Confirmar Envío → **imprimir ticket**.
- **Movimientos de inventario:** artículo, tipo, cantidad, habitación, áreas (origen→destino), estado, fecha, ver detalle.
- **Revisiones:** play para iniciar (no en ocupadas), historial de mantenimiento (ojito), cronómetro.
- **Inventario de Limpieza:** "Inventario de Ropa por Pisos" — por **PISO**, columnas **TOALLAS/SÁBANAS/EDREDONES**, filas **REM** (remanente, rojo) y **SUM** (suministrado, verde), botón **Solicitar ropa** y **Manchada/Deteriorada**; sección **Amenities y Productos por Áreas** (SIN PISO). Conmutador **Tiempo Real / Por Turnos**. Solicitar ropa → **WhatsApp al administrador**.

---

## 4. Perfil RECEPCIONISTA

**Menú:** Inicio, Habitaciones, Venta de productos, Cajas, Inventario Recepción, Cola de impresión, Historial de productos y servicios.

- **Habitaciones (board):** vistas Normal/Compacta/Real; botones **Vehículos, CHECK IN, Venta Productos, Servicios y Penalidades**; búsqueda por número/placa; filtros por piso/estado/tipo/estancia. Tarjetas con estado de color.
- **Cambiar de habitación** (si el admin lo habilita): seleccionar destino → CONFIRMAR CAMBIO → modal "¿Cómo debe quedar la habitación origen?" (Sucia para limpieza / Disponible).
- **Check-in:** tabs **Datos del huésped / Venta de productos (opcional) / Método de pago** (pagos mixtos) → CONFIRMAR CHECK-IN → si hay **vuelto**, modal de confirmación. Aplica **día hotelero** (ver §6).
- **Venta de productos:** modal; Tipo de cliente → "Asociar a habitación ocupada"; método de pago (Añadir) → **Procesar Venta** → ticket.
- **Cajas:** VER (según permiso) → CERRAR CAJA → **vista previa para imprimir** con montos cuadrando.
- **Inventario Recepción:** stock act/min, ingresos, salidas. **Dar de Baja Seleccionados** (motivo, cantidad; requiere permiso admin). **Solicitar Seleccionados** → Enviar Solicitudes. Cuando el admin envía: botón **Recepcionar Productos** (con cantidad) → Confirmar Recepción → ¿imprimir ticket? → stock actualizado.
- **Cola de impresión:** despachos en cards.
- **Check-out:** Ver historial; **Hacer Check-out** → si hay pagos pendientes, modal → Continuar Checkout → Confirmar Check-out → habitación **Limpieza en espera (naranja)**; recepción ya no la pasa a Disponible. Editar habitación en espera (solo limpieza/admin).
- **Inventario de limpieza (REM/SUM)** y solicitar ropa (igual que limpieza) → WhatsApp admin.

---

## 5. Perfil ADMINISTRADOR

- **Dashboard:** función rápida **ROPA** → tipo (Toallas…) → seleccionar → **TRANSFERIR** → modal: piso destino, detalle de stock, cantidad, stock restante/total → **CONFIRMAR TRANSFERENCIA** (refleja en inventario de limpieza).
- **Enviar Ropa Solicitada:** botón en dashboard con cantidad → modal detalle → **Enviar Ropa** → aparece como **SUM** en el inventario del almacén/limpieza.
- **Servicios y penalidades:** cliente pide ropa → botón en Habitaciones → modal → **SubCategoría** → **Servicio** → modal con habitaciones ocupadas → seleccionar habitación (muestra cliente) → artículos (precio, color, stock, cantidad) → agregar → total + método de pago (Pago Total/Parcial/Adeudo) → **Procesar Cobro** → ticket. Soporta **pagos parciales y adeudos**; lo cobrado se registra como **Adicionales** en la tarjeta de la habitación. El de **limpieza** ve "Suministrar Habitación" (suministro pendiente) → Confirmar Entrega → descuenta inventario.
- **Historial de Limpieza:** filtros, turnos, detalle por fila; click en monto total → modal resumen; **Folios** en otro tab.
- **Configuraciones / Hotel:** panel; **Permisos de recepción** (habilitar cambiar habitación, dar de baja, ver caja…); **Pernoctación** (día hotelero).
- **Almacén de productos:** botón **Enviar Productos** (con cantidad) → modal → enviar al **inventario de recepción**.
- **Caja administrador:** VER.
- **Horarios de limpieza:** turno mañana 7am–3pm, turno tarde 3pm–11pm.
- **Mantenimiento:** habitaciones críticas bloqueadas hasta resolver.

---

## 6. Regla de negocio: DÍA HOTELERO, Early check-in, Late check-out

- **Día hotelero NO es 24h.** Horario fijo: **check-in 1:00 p.m. → check-out 12:00 p.m. del día siguiente**. (Ej.: ingresa viernes 5 p.m. → sale sábado 12 p.m., no sábado 5 p.m.)
- **Early check-in:** si entra antes de la 1 p.m., se **cobra adicional** por las horas previas (ej. llega 6 a.m. → 7 horas anticipadas).
- **Late check-out:** salir después de las 12 p.m. genera cargo (regla análoga; el texto del Word quedó cortado — confirmar tarifa por hora/fracción).

---

## 7. Modelo de datos — cambios necesarios (alto nivel)

Nuevos/ampliados respecto al sistema actual:
1. **Room.status** → ampliar a: `DISPONIBLE, RESERVADA, OCUPADA, LIMPIEZA_SOLICITADA, LIMPIEZA_EN_ESPERA, LIMPIEZA_EN_CURSO, REQUIERE_REPASO, MANTENIMIENTO` (+ bloqueo si crítica).
2. **Inventario de ropa (linen):** `LinenType` (TOALLA/SÁBANA/EDREDÓN), `LinenItem` (color/variante: "VERDE MARGARITA", "INCAICA ROJA"…), `LinenStockByFloor` (piso, tipo/ítem, REM, SUM), `LinenMovement` (transferencia admin→piso, suministro, envío a lavandería, recojo de habitación).
3. **Lavandería:** registro de envíos, conteo por turno, "sube" al cierre.
4. **Turnos (shifts):** apertura/cierre por usuario de limpieza, reglas de bloqueo, horarios (mañana/tarde).
5. **Limpieza:** `HousekeepingTask` con estados ampliados; `RoomLinenInspection` (ítem, estado OK/ROBADA/DETERIORADA, recoger sí/no); `RevisionPeriodica` (acciones, tipo de falla, foto, observaciones).
6. **Servicios y penalidades:** catálogo de servicios/subcategorías; cargo a habitación como **Adicional**; suministro pendiente; pagos parciales/adeudos.
7. **Día hotelero:** config de pernoctación (hora check-in/out fija), tarifas de early check-in / late check-out.
8. **Inventario recepción:** stock act/min, ingresos/salidas, dar de baja (motivo), solicitudes (recepción↔almacén admin), recepción de productos, cola de impresión.
9. **Permisos de recepción** configurables por el admin (flags).
10. **Vehículos:** placa asociada a estancia/habitación (búsqueda por placa).
11. **Adeudos/pagos parciales** en estancia (saldo pendiente visible en la tarjeta).

---

## 8. Análisis de brechas (qué hay vs qué falta)

| Área | Hoy | Spec RIZZOS | Acción |
|------|-----|-------------|--------|
| Estados habitación | 4 | ~8 + bloqueo | Ampliar enum + máquina de estados |
| UI operativa | tema claro | tema oscuro con cards por estado | Re-tematizar + rediseñar boards/modales |
| Inventario ropa por pisos (REM/SUM) | no existe | central | Modelos + pantallas nuevas |
| Limpieza (inspección de prendas, repaso, revisión periódica) | básico | detallado | Reconstruir flujo |
| Lavandería / turnos limpieza | parcial | reglas estrictas | Construir |
| Servicios y penalidades | no | sí | Construir |
| Día hotelero / early / late | tarifa por duración | horario fijo + cargos | Cambiar lógica de pricing |
| Inventario recepción (solicitar/recepcionar/dar de baja/cola impresión) | parcial | completo | Construir |
| Permisos de recepción configurables | RBAC genérico | flags específicos | Agregar settings |
| Vehículos (placa) | no | sí | Agregar |

---

## 9. Plan por fases (ejecución incremental)

> Es un proyecto grande; se construye por fases verificables. Diseño y colores **idénticos** a las imágenes en cada pantalla.

- **FASE R0 — Sistema de diseño oscuro RIZZOS:** tokens de color, tema oscuro operativo, componentes base (card de habitación por estado, tablas de ropa, modales).
- **FASE R1 — Modelo de datos + estados:** ampliar Room.status, modelos de ropa/lavandería/turnos/servicios/día hotelero/inventario recepción + migración + seed.
- **FASE R2 — Recepción:** board de habitaciones (Normal/Compacta/Real), Check-in con día hotelero/early/late, Venta de productos, Servicios y Penalidades, Cajas (cierre+impresión), Inventario Recepción (solicitar/recepcionar/dar de baja/cola), Check-out con adeudos, cambiar habitación.
- **FASE R3 — Limpieza:** Gestión de Habitaciones (iniciar/finalizar, recoger ropa, repaso, revisión periódica), Inventario de Ropa por Pisos (REM/SUM, solicitar), Lavandería, Reporte de Turno (PDF/ticket), Movimientos, Revisiones, reglas de cierre de turno.
- **FASE R4 — Administrador:** Dashboard (función ROPA + transferencias, enviar ropa solicitada), Servicios y Penalidades (suministro), Historial de Limpieza + resumen + folios, Almacén de productos (enviar a recepción), Caja admin, Configuraciones/Permisos/Pernoctación, horarios.
- **FASE R5 — Integraciones:** WhatsApp (aviso al admin por solicitudes), impresión de tickets (QZ/navegador), exportes PDF, vehículos.

Cada fase: propuesta breve → construcción → verificación (build + endpoints) → commit.

---

## 10. Puntos a confirmar con el cliente (no bloqueantes)
- Tarifa exacta de **early check-in / late check-out** (por hora/fracción) — el Word quedó cortado.
- Si el tema oscuro aplica a **toda** la app o solo al área operativa (recepción/limpieza) dejando configuraciones en claro.
- Lista cerrada de **tipos de ropa** y **colores/variantes** y a qué **pisos/tipos de habitación** aplican.
- Catálogo de **servicios y penalidades** y sus precios.
