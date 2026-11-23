# HotelSuite · Agente local del huellero ZKTeco

El backend de HotelSuite corre en la **nube** (VPS) y **no puede alcanzar** la IP
de red local del huellero. Este agente resuelve eso: se ejecuta en una **PC del
hotel** conectada a la **misma red que el huellero**, lee las marcas por TCP/UDP
`4370` y las envía al backend por HTTPS.

```
[ Huellero ZKTeco ] --LAN 4370--> [ Agente (PC del hotel) ] --HTTPS--> [ Backend HotelSuite (nube) ]
```

## Requisitos
- **Node.js 20 o superior** en la PC del hotel (`node -v`).
- La PC y el huellero en la **misma red** (que la PC haga `ping` a la IP del huellero).

## Instalación
```bash
cd biometric-agent
npm install
```

## Configuración
1. En el sistema web: **Configuraciones → Huella Digital** → registra el dispositivo
   (nombre + IP del huellero) y pulsa **Generar token de agente**. Copia el **token**
   y el **ID del dispositivo** (se muestran ahí).
2. Copia `config.example.json` a `config.json` y complétalo:
   ```json
   {
     "deviceIp": "192.168.0.201",
     "devicePort": 4370,
     "apiUrl": "https://rizzoshospedaje.com/api",
     "deviceId": "<ID del dispositivo del panel>",
     "agentToken": "<token del panel>"
   }
   ```
   > También se puede configurar por variables de entorno: `DEVICE_IP`, `DEVICE_PORT`,
   > `API_URL`, `DEVICE_ID`, `AGENT_TOKEN`.

## Ejecutar
```bash
npm start
```
Verás algo como:
```
... INFO Conectado al huellero 192.168.0.201:4370.
... INFO Equipo: ... · serie ...
```
Cada huella marcada se envía al sistema y aparece en **RRHH → Asistencias**.
El panel mostrará el dispositivo **en línea** (por el latido).

## Dejarlo corriendo 24/7 (Windows)
Opción simple: **Programador de tareas** → tarea que ejecuta `node agent.js` al
iniciar sesión (o al arrancar el equipo), con reinicio ante fallo. Alternativa:
instalarlo como servicio con [`nssm`](https://nssm.cc/) apuntando a `node.exe agent.js`.

## Cómo funciona
- **Tiempo real:** cada marca dispara `POST /biometrics/ingest`.
- **Respaldo:** cada `syncIntervalSec` (60 s) lee las asistencias del equipo y envía
  solo las posteriores a la última sincronizada (`state.json`). Cubre marcas ocurridas
  si el agente estuvo apagado. El backend **descarta duplicados** por (usuario+equipo+instante).
- **Latido:** cada `heartbeatSec` (30 s) marca el equipo "en línea" en el panel.
- Por defecto solo captura marcas **nuevas** (desde el primer arranque); no importa el
  histórico de pruebas del equipo. Borra `state.json` para re-capturar desde cero.

## Seguridad
- El `agentToken` autentica el agente ante el backend. Trátalo como una contraseña.
- Si se filtra, **rota** el token desde el panel (invalida el anterior) y actualiza `config.json`.
- `config.json` y `state.json` están en `.gitignore`: no se versionan.
