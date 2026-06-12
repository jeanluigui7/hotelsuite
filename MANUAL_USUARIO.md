# HotelSuite — Manual de procesos por rol

Guía funcional: qué puede hacer cada rol, los procesos del sistema y un ejemplo
paso a paso de cada uno. Pensada para que cualquier usuario nuevo entienda cómo
opera HotelSuite.

---

## 1. Conceptos generales

- **Multi-sucursal:** todo dato operativo (habitaciones, ventas, caja, inventario…) pertenece a una **sucursal**. La sucursal activa se elige en el **selector de la barra superior**; al cambiarla, toda la pantalla muestra los datos de esa sucursal.
- **Inicio de sesión:** cada usuario entra con su correo y contraseña. Según su **rol**, ve solo los módulos y acciones que le corresponden (el menú lateral se arma automáticamente con sus permisos).
- **Permisos:** cada permiso es la combinación **módulo × acción** (`ver`, `crear`, `editar`, `eliminar`, `aprobar`). Ej.: *finanzas × crear* permite registrar ventas.
- **Compartido entre sucursales (por diseño):** los **Clientes (huéspedes)**, los **Usuarios** y los **Roles/Permisos** son globales; el resto es por sucursal.

---

## 2. Roles y a qué módulos accede cada uno

| Rol | Módulos a los que accede |
|-----|--------------------------|
| **Super Admin** | Todo (todas las sucursales y configuraciones) |
| **Gerente** | Tablero, Operaciones, Finanzas, Inventario, Logística, RRHH, Reportes |
| **Recepcionista** | Tablero, Operaciones, Finanzas |
| **Caja** | Tablero, Finanzas |
| **Supervisor de Limpieza** | Tablero, Operaciones, Inventario |
| **Personal de Limpieza** | Operaciones |
| **Logística** | Tablero, Inventario, Logística, Reportes |

> Los roles se gestionan en **Configuraciones › Autenticación por Roles** (matriz de permisos) y el catálogo se ve en **Configuraciones › Permisos por Categoría**.

---

## 3. Procesos por rol (con ejemplo)

### 3.1 Recepcionista
Es quien atiende al huésped: check-in, check-out, ventas de mostrador/frigobar y su caja.

- **Check-in (registrar una llegada)**
  *Ejemplo:* Operaciones › Habitaciones → clic en una habitación **Libre** (verde) → "Check-in" → elige tarifa (ej. *Noche 24h*), registra al huésped (documento, nombre) y, si aplica, su tier → Confirmar. La habitación pasa a **Ocupada** y se crea la **Estancia** con el precio congelado.
- **Check-out (registrar la salida)**
  *Ejemplo:* Operaciones › Check-Outs → ubica la estancia (las vencidas salen en naranja) → "Check-out" → la habitación pasa a **Limpieza** y la estancia queda **Cerrada**.
- **Frigobar (cargar consumo a la habitación)**
  *Ejemplo:* Operaciones › Frigobar → selecciona la habitación ocupada → agrega "Agua mineral x2" → "Registrar consumo". Se crea una venta atada a la estancia y **descuenta stock**.
- **Venta de mostrador (POS)**
  *Ejemplo:* Finanzas › Pagos → agrega productos → elige método (Efectivo/Tarjeta/…) → Cobrar. Debe haber un **turno de caja abierto**.
- **Abrir/cerrar turno de caja**
  *Ejemplo:* Finanzas › Cajas → "Abrir turno" con monto inicial. Al final del día → "Cerrar turno", ingresa el efectivo contado y el sistema calcula la **diferencia**.
- **Reservas**
  *Ejemplo:* Operaciones › Reservas → "Nueva" → tipo de habitación, fecha esperada, huésped → al llegar, "Convertir a check-in".
- **Conserjería / Observaciones**
  *Ejemplo:* Operaciones › Conserjería → "Nueva" → "Taxi al aeropuerto 6am" para la habitación 101 → marca **En progreso/Hecho** cuando se atiende.

### 3.2 Caja
Enfocado en el dinero: cobros, comprobantes y arqueo.

- **Registrar pagos / cobros** (igual que POS del recepcionista).
- **Emitir comprobante**
  *Ejemplo:* Finanzas › Comprobantes → "Emitir" → tipo **Boleta/Factura**, cliente y total → el sistema asigna folio y calcula **IGV 18% incluido**.
- **Imprimir ticket/comprobante**
  *Ejemplo:* Finanzas › Tickets → ícono de impresora o de **vista previa** → si hay QZ Tray imprime directo; si no, abre la **vista previa** e imprime por el navegador.
- **Panel Fiscal**
  *Ejemplo:* Finanzas › Panel Fiscal → revisa el estado de los comprobantes emitidos/anulados.
- **Cuadro de turno**
  *Ejemplo:* Reportes › Cuadro de Turno → selecciona el turno → ve cobros por método, esperado vs contado y diferencia.

### 3.3 Supervisor de Limpieza
Coordina y aprueba la limpieza de habitaciones.

- **Crear/asignar tarea de limpieza**
  *Ejemplo:* Operaciones › Historial de Limpiezas → "Nueva tarea" para la habitación 102, asignada a un colaborador.
- **Inspeccionar y aprobar (libera la habitación)**
  *Ejemplo:* cuando la tarea está **Terminada**, "Inspeccionar" → marca cada ítem del checklist (sábanas, baño, amenities) como aprobado/falló → al **aprobar**, la habitación queda **Libre**.
- **Configurar el checklist**
  *Ejemplo:* Configuraciones › Inspección de Limpieza → agrega los ítems a revisar.
- **Ver inventario/movimientos de limpieza**
  *Ejemplo:* Inventario › Inventario de Limpieza → revisa stock de amenities (lo que esté bajo el punto de reposición sale marcado "Reponer").

### 3.4 Personal de Limpieza
Ejecuta las tareas asignadas.

- **Iniciar y completar una tarea (con consumo de amenities)**
  *Ejemplo:* Operaciones › Historial de Limpiezas → su tarea **Pendiente** → "Iniciar" → al terminar, "Completar" registrando los amenities usados (ej. 1 shampoo, 1 jabón). El consumo **descuenta del almacén** (Kardex) y la tarea queda lista para inspección.

### 3.5 Logística
Maneja inventario, compras y reposición.

- **Registrar proveedores**
  *Ejemplo:* Logística › Proveedores → "Nuevo" → razón social, RUC, contacto.
- **Ingreso de mercadería con factura**
  *Ejemplo:* Logística › Ingresos con Factura → proveedor + almacén + productos y costos → Guardar. Esto **suma stock**, actualiza el **último costo** y genera un movimiento de Kardex.
- **Kardex**
  *Ejemplo:* Logística › Kardex → selecciona "Agua mineral" → ve cada entrada/salida con **saldo corrido**; exporta a CSV.
- **Valorización / Ganancias / Reponer**
  *Ejemplo:* Logística › Valorización de Stock → ve el valor total del inventario (cantidad × último costo). En "Productos a Reponer", los que están en o bajo su punto de reposición.
- **Movimientos manuales / transferencias**
  *Ejemplo:* Inventario › Movimientos → "Ajuste" o "Transferencia" entre almacenes.

### 3.6 Gerente
Visión operativa y financiera de la sucursal (no configura el sistema).

- **Revisar el Tablero**
  *Ejemplo:* Tablero › Resumen de Recepción/Caja/Limpieza/Turno → ocupación, ventas del turno, tareas pendientes.
- **Consultar reportes**
  *Ejemplo:* Reportes › Ventas Detalladas (por rango), Reporte de Habitaciones, Rendimiento General del personal.
- **Supervisar operaciones, finanzas, inventario y logística** (lectura y edición según permisos).
- **Mantenimientos y revisiones**
  *Ejemplo:* Operaciones › Mantenimientos → "Nuevo" → "Aire acondicionado no enfría" en la 201 → seguimiento Abierto → En progreso → Hecho.

### 3.7 Super Admin
Configura todo el sistema y administra todas las sucursales.

- **Crear/editar sucursales**
  *Ejemplo:* Configuraciones › Sucursales → "Nueva sucursal" → datos del hotel. Luego, cambiándose a ella, configura sus catálogos.
- **Usuarios y roles**
  *Ejemplo:* RRHH › Usuarios → "Nuevo" → nombre, correo, rol y sucursales asignadas. Configuraciones › Autenticación por Roles → ajusta la matriz de permisos.
- **Catálogos maestros**
  *Ejemplo:* Tipos de Habitación, Atributos, Tarifas, Tiers, Clientes, Items/Servicios, Pool WiFi, Horarios, Máquinas de Lavandería, Landing Page.
- **WhatsApp y recordatorios**
  *Ejemplo:* WhatsApp › Instancias y Configuración de Mensajes; Configuraciones › Recordatorios.
- **Huella digital (asistencias biométricas)**
  *Ejemplo:* Configuraciones › Huella Digital → registra el dispositivo ZKTeco y enrola al personal.

---

## 4. Procesos transversales (resumen del flujo de datos)

1. **Ciclo de habitación:** Libre → (check-in) Ocupada → (check-out) Limpieza → (inspección aprobada) Libre.
2. **Ciclo de venta:** turno de caja abierto → venta (descuenta stock + Kardex + pago) → comprobante (folio + IGV) → impresión.
3. **Ciclo de inventario:** compra con factura (entra stock + costo + Kardex) → consumo/venta (sale stock + Kardex) → valorización/ganancias.
4. **Ciclo de limpieza:** tarea creada → iniciada → completada (consume amenities) → inspeccionada → habitación liberada.

---

## 5. Integridad de la información (auditoría)

Se revisó que los procesos mantengan la consistencia de los datos:

- **Operaciones atómicas (transacciones):** los procesos que tocan varias tablas a la vez se ejecutan en **una sola transacción** (todo o nada). Aplica a: ventas, compras, movimientos de inventario, limpieza (consumo), comprobantes, notas, check-in/out, usuarios, roles y tipos de habitación. Si algo falla, **nada queda a medias**.
- **Stock y Kardex siempre juntos:** cualquier cambio de stock (venta, compra, ajuste, transferencia, consumo de limpieza) escribe **a la vez** el movimiento de Kardex, por lo que el saldo del Kardex y el stock real **nunca se desincronizan**.
- **Relaciones protegidas:** toda entidad operativa referencia su **sucursal** y sus catálogos. Al eliminar una sucursal, sus datos dependientes se eliminan en cascada de forma controlada; las relaciones secundarias usan borrado controlado para evitar inconsistencias.
- **Multi-sucursal estricto:** cada consulta se filtra por la sucursal activa del usuario; un usuario nunca ve ni modifica datos de una sucursal a la que no pertenece (salvo Super Admin).
- **Precios congelados:** al hacer check-in, el precio acordado (tarifa − descuento del tier) se **guarda en la estancia**, de modo que un cambio posterior de tarifas no altera estancias ya registradas.
- **Auditoría de acciones:** las operaciones de escritura quedan registradas (RRHH › Historial de Actividades).

### Recomendaciones (mejoras sugeridas, no urgentes)
- **Consumos de frigobar al check-out:** hoy una estancia puede cerrarse aunque tenga consumos de frigobar sin cobrar. Sugerencia: avisar/forzar el cobro de ventas abiertas atadas a la estancia antes del check-out.
- **Fotos de habitaciones:** la landing muestra "fotografía próximamente"; conviene cargar imágenes reales.
- **HTTPS + dominio:** para producción, poner un dominio con certificado (hoy corre por HTTP).

---

## 6. Cómo el cliente ve la página pública (landing)

Cada sucursal tiene una página pública (sin login) para que los huéspedes vean habitaciones, tarifas, disponibilidad y contacten por WhatsApp:

```
http://<servidor>/landing/<id-de-sucursal>
```

Desde ahí el huésped puede filtrar por tipo, ver "solo disponibles", revisar tarifas y pulsar **Reservar**, que abre un WhatsApp prellenado al número del hotel (configurable en Configuraciones › Sucursales).
