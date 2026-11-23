/* eslint-disable no-console */
// HotelSuite · Agente local del huellero ZKTeco
// -------------------------------------------------------------
// El backend de HotelSuite corre en la nube (VPS) y NO alcanza la IP LAN del
// huellero. Este agente se ejecuta en una PC del hotel (misma red del equipo),
// lee las marcas del ZKTeco por TCP/UDP 4370 y las empuja al backend por HTTPS.
//
// - Marca en tiempo real  -> POST /biometrics/ingest
// - Respaldo periódico    -> lee getAttendances() y envía lo nuevo (idempotente)
// - Latido                -> POST /biometrics/heartbeat (el panel muestra "en línea")
//
// Config: biometric-agent/config.json (ver config.example.json). Node 20+ (fetch nativo).

const fs = require('fs');
const path = require('path');

// zkteco-js está instalado en el monorepo (node_modules de la raíz) o en este folder.
function loadZK() {
  const candidates = [
    path.join(__dirname, 'node_modules', 'zkteco-js'),
    path.join(__dirname, '..', 'node_modules', 'zkteco-js'),
    'zkteco-js',
  ];
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* try next */ }
  }
  console.error('No se encontró zkteco-js. Ejecuta "npm install" dentro de biometric-agent/.');
  process.exit(1);
}
const ZKLib = loadZK();

// ── Config ──
const CONFIG_PATH = process.env.AGENT_CONFIG || path.join(__dirname, 'config.json');
function loadConfig() {
  let fileCfg = {};
  try { fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) { /* usa env */ }
  const cfg = {
    deviceIp: process.env.DEVICE_IP || fileCfg.deviceIp,
    devicePort: Number(process.env.DEVICE_PORT || fileCfg.devicePort || 4370),
    inport: Number(process.env.INPORT || fileCfg.inport || 5200),
    apiUrl: (process.env.API_URL || fileCfg.apiUrl || '').replace(/\/+$/, ''),
    deviceId: process.env.DEVICE_ID || fileCfg.deviceId,
    agentToken: process.env.AGENT_TOKEN || fileCfg.agentToken,
    syncIntervalSec: Number(process.env.SYNC_INTERVAL_SEC || fileCfg.syncIntervalSec || 60),
    heartbeatSec: Number(process.env.HEARTBEAT_SEC || fileCfg.heartbeatSec || 30),
  };
  const missing = ['deviceIp', 'apiUrl', 'deviceId', 'agentToken'].filter((k) => !cfg[k]);
  if (missing.length) {
    console.error(`Config incompleta, faltan: ${missing.join(', ')}. Revisa ${CONFIG_PATH}.`);
    process.exit(1);
  }
  return cfg;
}
const cfg = loadConfig();

// ── Estado local (última marca sincronizada) ──
const STATE_PATH = path.join(__dirname, 'state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (_) { return {}; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); } catch (e) { log('warn', `No se pudo guardar state.json: ${e.message}`); }
}
const state = loadState();
// Por defecto solo captura marcas NUEVAS (desde ahora); no importa el histórico de pruebas del equipo.
if (!state.lastSyncAt) { state.lastSyncAt = new Date().toISOString(); saveState(state); }

function log(level, msg) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`;
  if (level === 'error') console.error(line); else console.log(line);
}

// ── Envío al backend ──
async function post(pathname, body) {
  const res = await fetch(`${cfg.apiUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent-token': cfg.agentToken },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { raw: text }; }
  if (!res.ok) {
    const err = json && json.error && json.error.message ? json.error.message : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return json.data ?? json;
}

async function sendMarks(marks) {
  if (!marks.length) return { recorded: 0, skipped: 0 };
  const out = await post('/biometrics/ingest', { deviceId: cfg.deviceId, marks });
  log('info', `Ingesta: ${out.recorded ?? 0} registrada(s), ${out.skipped ?? 0} omitida(s).`);
  return out;
}

// ── Conexión al huellero ──
function makeClient() {
  return new ZKLib(cfg.deviceIp, cfg.devicePort, 5500, cfg.inport);
}

function extractUserId(data) {
  return String(
    (data && (data.user_id ?? data.userId ?? data.deviceUserId ?? data.uid ?? data.userSn)) ?? '',
  ).trim();
}
function extractTime(data) {
  const t = data && (data.timestamp ?? data.recordTime ?? data.time ?? data.attTime);
  const d = t ? new Date(t) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

let zk = null;
let stopping = false;

/** Respaldo: lee las asistencias del equipo y envía las posteriores a lastSyncAt. */
async function syncBackfill(client) {
  let res;
  try { res = await client.getAttendances(); } catch (e) { log('warn', `getAttendances falló: ${e.message}`); return; }
  const rows = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
  const since = new Date(state.lastSyncAt).getTime();
  const marks = [];
  let maxTime = since;
  for (const r of rows) {
    const deviceUserId = extractUserId(r);
    if (!deviceUserId) continue;
    const at = extractTime(r);
    const ms = at.getTime();
    if (ms <= since) continue;
    marks.push({ deviceUserId, at: at.toISOString() });
    if (ms > maxTime) maxTime = ms;
  }
  if (marks.length) {
    await sendMarks(marks);
    state.lastSyncAt = new Date(maxTime).toISOString();
    saveState(state);
  }
}

async function heartbeat() {
  try { await post('/biometrics/heartbeat', { deviceId: cfg.deviceId }); }
  catch (e) { log('warn', `Heartbeat falló: ${e.message}`); }
}

async function connectLoop() {
  let backoff = 2000;
  while (!stopping) {
    try {
      zk = makeClient();
      await zk.createSocket();
      log('info', `Conectado al huellero ${cfg.deviceIp}:${cfg.devicePort}.`);
      try { log('info', `Equipo: ${await zk.getDeviceName()} · serie ${await zk.getSerialNumber()}`); } catch (_) {}
      backoff = 2000;

      // Respaldo inicial + tiempo real.
      await syncBackfill(zk);
      await zk.getRealTimeLogs(async (data) => {
        const deviceUserId = extractUserId(data);
        if (!deviceUserId) return;
        const at = extractTime(data).toISOString();
        try { await sendMarks([{ deviceUserId, at }]); }
        catch (e) { log('error', `No se pudo enviar la marca (user ${deviceUserId}): ${e.message}`); }
      });

      // Timers de respaldo + latido mientras la conexión viva.
      const syncTimer = setInterval(() => { syncBackfill(zk).catch((e) => log('warn', `Backfill: ${e.message}`)); }, cfg.syncIntervalSec * 1000);
      const hbTimer = setInterval(heartbeat, cfg.heartbeatSec * 1000);
      await heartbeat();

      // Espera hasta que el socket se caiga.
      await new Promise((resolve) => {
        const iv = setInterval(() => {
          const alive = zk && (zk.ztcp?.socket || zk.zudp?.socket);
          if (!alive || stopping) { clearInterval(iv); resolve(); }
        }, 3000);
      });
      clearInterval(syncTimer);
      clearInterval(hbTimer);
      log('warn', 'Conexión con el huellero perdida; reintentando…');
    } catch (e) {
      log('error', `No se pudo conectar al huellero (${cfg.deviceIp}:${cfg.devicePort}): ${e && e.message ? e.message : e}`);
    }
    try { if (zk) await zk.disconnect(); } catch (_) {}
    if (stopping) break;
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 30000);
  }
}

async function shutdown() {
  stopping = true;
  log('info', 'Deteniendo agente…');
  try { if (zk) await zk.disconnect(); } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log('info', `Agente HotelSuite iniciado · huellero ${cfg.deviceIp}:${cfg.devicePort} · API ${cfg.apiUrl} · device ${cfg.deviceId}`);
connectLoop();
