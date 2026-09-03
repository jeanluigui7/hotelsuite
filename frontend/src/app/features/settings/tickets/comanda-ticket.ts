/**
 * Plantilla FIJA de comanda RIZZOS (ticketera térmica 80 mm).
 *
 * Genera el HTML autocontenido de una comanda informativa (no tributaria) entregada al huésped.
 * Reutilizable por la vista previa de Configuración → Tickets y, más adelante, por el flujo de
 * impresión (navegador / QZ Tray). NO decide cuándo se imprime — eso es la capa Automatizaciones.
 *
 * Bienvenida y Renovación comparten este formato completo; la Renovación añade la marca de
 * renovación y usa la NUEVA hora límite y el NUEVO voucher. El Voucher Wi-Fi es una variante
 * reducida (solo el bloque de red/código).
 */

export type ComandaKind = 'BIENVENIDA' | 'RENOVACION' | 'TIEMPO_EXTRA' | 'VOUCHER_WIFI';

export interface ComandaIdentity {
  tradeName: string; // p. ej. "RIZZOS"
  subtitle?: string; // p. ej. "HOSPEDAJE"
  address: string; // dirección completa
  cityLine?: string; // "TRUJILLO - TRUJILLO - LA LIBERTAD"
  landline?: string; // "(044) 278045"
  mobile?: string; // "991 139 349"
  logoUrl?: string | null; // data URL o URL del logo (opcional)
}

export interface ComandaData {
  room: string; // "202"
  stayLabel: string; // "DIA HOTELERO"
  persons?: number; // 2
  checkinAt: string; // "01/09/2026 20:38" (ya formateado)
  checkoutNote: string; // "TARIFA DÍA HOTELERO CULMINA A LAS 12:00 P.M."
  wifiSsid: string; // "RIZZOS HOSPEDAJE"
  wifiCode: string; // "f6FWMw"
  wifiValidity?: string; // "Vigencia: 12h" (usado sobre todo en renovación/voucher)
  services?: boolean; // mostrar bloque Netflix/Prime/Room Service (default true)
  renewalNote?: string; // mensaje específico de renovación
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Marco/estilos comunes de la ticketera de 80 mm. */
function frame(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .t { width: 302px; margin: 0 auto; padding: 10px 12px 16px; color: #111;
         font-family: "Consolas", "Menlo", "Courier New", monospace; font-size: 12px; line-height: 1.35; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .sep { border: 0; border-top: 1px dashed #444; margin: 8px 0; }
    .sep-dot { border: 0; border-top: 2px dotted #333; margin: 8px 0; }
    .brand { text-align: center; margin-bottom: 6px; }
    .brand .logo { max-width: 120px; max-height: 60px; display: block; margin: 0 auto 4px; }
    .brand .name { font-weight: 800; font-size: 20px; letter-spacing: 2px; }
    .brand .sub { font-weight: 600; font-size: 12px; letter-spacing: 6px; color: #333; }
    .hl { text-align: center; font-weight: 700; }
    .muted { color: #333; }
    .big { font-size: 14px; font-weight: 800; text-align: center; letter-spacing: 1px; }
    .row { text-align: center; }
    .code { font-family: "Consolas", monospace; font-weight: 800; font-size: 15px; letter-spacing: 1px; }
    .services { display: flex; justify-content: center; gap: 18px; font-weight: 600; }
    .legal { text-align: center; font-size: 11px; color: #333; }
    .badge { text-align: center; font-weight: 800; letter-spacing: 2px; border: 1px solid #111; border-radius: 4px; padding: 3px 0; margin: 0 0 6px; }
    .small { font-size: 11px; }
  </style></head><body><div class="t">${inner}</div></body></html>`;
}

function brand(id: ComandaIdentity): string {
  // Si hay logo cargado (data URL desde Configuración → Hotel), es el wordmark: se muestra solo el
  // logo. Sin logo (p. ej. la vista de muestra) se usa el nombre + subtítulo en texto.
  if (id.logoUrl) return `<div class="brand"><img class="logo" src="${esc(id.logoUrl)}" alt=""></div>`;
  return `<div class="brand"><div class="name">${esc(id.tradeName)}</div>${
    id.subtitle ? `<div class="sub">${esc(id.subtitle)}</div>` : ''
  }</div>`;
}

/** Bloque de identidad del pie: dirección + ciudad + teléfonos. */
function footerIdentity(id: ComandaIdentity): string {
  const phones = [
    id.landline ? `&#9743; ${esc(id.landline)}` : '',
    id.mobile ? `&#128241; ${esc(id.mobile)}` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  return `
    <div class="legal">${esc(id.address)}</div>
    ${id.cityLine ? `<div class="legal">${esc(id.cityLine)}</div>` : ''}
    ${phones ? `<div class="legal" style="margin-top:4px">${phones}</div>` : ''}`;
}

/** Aviso legal (no tributario). */
function legalLine(): string {
  return `
    <div class="legal bold" style="margin-top:8px">ESTE TICKET NO ES BOLETA NI FACTURA</div>
    <div class="legal">Solicítela en recepción.</div>`;
}

/** Pie completo de bienvenida: no-devolución + identidad + legal. */
function footer(id: ComandaIdentity): string {
  return `
    <div class="center bold small">Servicios y productos no sujetos a devolución.</div>
    <hr class="sep-dot">
    ${footerIdentity(id)}
    ${legalLine()}`;
}

function servicesBlock(): string {
  return `
    <hr class="sep">
    <div class="services"><span>&#128250; Netflix</span><span>&#9654; Amazon Prime</span></div>
    <hr class="sep">
    <div class="center bold">&#9743; ROOM SERVICE 24 HORAS</div>
    <div class="center">Levante el INTERCOMUNICADOR</div>
    <div class="center muted small">Para consultas, productos y ayuda</div>`;
}

function wifiBlock(d: ComandaData, gratis = true): string {
  return `
    <div class="big">${gratis ? 'WIFI GRATIS' : 'WIFI'}</div>
    <div class="row" style="margin-top:6px">Red: <span class="bold">${esc(d.wifiSsid)}</span></div>
    <div class="row" style="margin-top:4px">Código: <span class="code">${esc(d.wifiCode)}</span></div>
    ${d.wifiValidity ? `<div class="row muted small" style="margin-top:4px">${esc(d.wifiValidity)}</div>` : ''}`;
}

/** Construye el HTML de una comanda según su tipo. */
export function buildComandaTicket(kind: ComandaKind, id: ComandaIdentity, d: ComandaData): string {
  // Voucher Wi-Fi: comanda reducida = marca + WIFI GRATIS (Red/Código/Tiempo) + identidad del pie.
  if (kind === 'VOUCHER_WIFI') {
    return frame(`
      ${brand(id)}
      <hr class="sep">
      <div class="big">WIFI GRATIS</div>
      <div class="row" style="margin-top:10px">Red: <span class="bold">${esc(d.wifiSsid)}</span></div>
      <div class="row" style="margin-top:8px">Código: <span class="code">${esc(d.wifiCode)}</span></div>
      ${d.wifiValidity ? `<div class="row" style="margin-top:8px">Tiempo: <span class="bold">${esc(d.wifiValidity)}</span></div>` : ''}
      <hr class="sep">
      ${footerIdentity(id)}
      ${legalLine()}`);
  }

  // Renovación y Tiempo extra: comanda COMPACTA = marca + badge + habitación + nueva hora límite +
  // BLOQUE WIFI, sin el bloque de servicios (Netflix/Prime/Room Service). El WiFi de renovación sale
  // del voucher asignado (pernocta); el de tiempo extra, de un voucher PERSONALIZADO.
  if (kind === 'RENOVACION' || kind === 'TIEMPO_EXTRA') {
    const badge = kind === 'RENOVACION' ? 'RENOVACIÓN' : 'TIEMPO EXTRA';
    return frame(`
      ${brand(id)}
      <div class="badge">${badge}</div>
      <hr class="sep">
      <div class="hl">HABITACIÓN: ${esc(d.room)}</div>
      ${d.renewalNote ? `<div class="center small bold" style="margin-top:4px">${esc(d.renewalNote)}</div>` : ''}
      <hr class="sep">
      ${wifiBlock(d, true)}
      <hr class="sep">
      ${footer(id)}`);
  }

  const personsTxt = d.persons ? ` - ${d.persons} PERSONA${d.persons === 1 ? '' : 'S'}` : '';
  const showServices = d.services !== false;

  const head = `
    ${brand(id)}
    <hr class="sep">
    <div class="hl">HABITACIÓN: ${esc(d.room)} - ${esc(d.stayLabel)}${personsTxt}</div>
    <div class="center" style="margin-top:4px">${esc(d.checkinAt)}</div>
    <div class="center small muted" style="margin-top:2px">${esc(d.checkoutNote)}</div>
    <hr class="sep">
    ${wifiBlock(d, true)}`;

  return frame(`${head}${showServices ? servicesBlock() : ''}<hr class="sep">${footer(id)}`);
}

/** Datos de muestra fieles a la imagen de referencia (para la vista previa). */
export const SAMPLE_IDENTITY: ComandaIdentity = {
  tradeName: 'RIZZOS',
  subtitle: 'HOSPEDAJE',
  address: 'CAL. MANUEL SEOANE 119 URB. ALTO MOCHICA SC. 2',
  cityLine: 'TRUJILLO - TRUJILLO - LA LIBERTAD',
  landline: '(044) 278045',
  mobile: '991 139 349',
};

/** Mapea la identidad de la sucursal (Configuración → Hotel) al formato de la comanda. */
export function identityFromBranch(b: {
  name?: string; landline?: string; phone?: string; mobile?: string; address?: string; logoUrl?: string;
} | null | undefined): ComandaIdentity {
  if (!b || (!b.name && !b.logoUrl && !b.address)) return SAMPLE_IDENTITY;
  return {
    tradeName: b.name || SAMPLE_IDENTITY.tradeName,
    subtitle: undefined,
    address: b.address || '',
    landline: b.landline || b.phone || '',
    mobile: b.mobile || '',
    logoUrl: b.logoUrl || null,
  };
}

export function sampleComandaData(kind: ComandaKind): ComandaData {
  const base: ComandaData = {
    room: '202',
    stayLabel: 'DIA HOTELERO',
    persons: 2,
    checkinAt: '01/09/2026 20:38',
    checkoutNote: 'TARIFA DÍA HOTELERO CULMINA A LAS 12:00 P.M.',
    wifiSsid: 'RIZZOS HOSPEDAJE',
    wifiCode: 'f6FWMw',
  };
  if (kind === 'RENOVACION') {
    return {
      ...base,
      renewalNote: 'Estadía renovada - nueva hora límite 12:00 P.M.',
      wifiCode: 'K9pLm2',
      wifiValidity: 'Vigencia del nuevo voucher: 24 h',
    };
  }
  if (kind === 'TIEMPO_EXTRA') {
    // WiFi tomado de un voucher PERSONALIZADO (tiempo/precio editable).
    return {
      ...base,
      renewalNote: 'Tiempo extra - nueva hora límite 02:00 P.M.',
      wifiCode: 'X7pQ2a',
      wifiValidity: 'Tiempo del voucher: 3 h',
    };
  }
  if (kind === 'VOUCHER_WIFI') {
    return { ...base, wifiSsid: 'RIZZOS', wifiCode: '123456', wifiValidity: '5 minutos' };
  }
  return base;
}
