/**
 * Generadores de tickets de cierre de caja (impresión térmica 80mm), compartidos entre
 * Finanzas › Cajas y Operaciones › Caja para no duplicar la lógica del cuadre.
 *
 *  - buildCuadreTicket:  cuadre detallado (modo administrador / supervisado).
 *  - buildBlindTicket:   recibo estilizado de caja ciega (conteo por denominaciones, base y bolsa,
 *                        SIN esperado ni diferencia).
 */
import type { CashDetail } from './finance.models';

// ── Formato de ticket térmico monospace (ancho fijo 80mm) ──
const TW = 42;
const line = (ch: string): string => ch.repeat(TW);
const center = (s: string): string => { s = s.slice(0, TW); const l = Math.max(0, Math.floor((TW - s.length) / 2)); return ' '.repeat(l) + s; };
const kv = (label: string, value: string): string => label.slice(0, 26).padEnd(27) + ': ' + value;
const sec = (title: string): string => center(`--- ${title} ---`);
const moneyRow = (label: string, amt: number): string => label.slice(0, 14).padEnd(14) + 'S/ ' + amt.toFixed(2).padStart(6);
const hhmm = (v: string | Date): string => { const t = new Date(v); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
const esc = (v: unknown): string => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

const DAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

const ticketMethod = (m: string): string =>
  ({ CASH: 'EFECTIVO', CARD: 'TARJETA DE C', TRANSFER: 'TRANSFERENC.', YAPE: 'YAPE', PLIN: 'PLIN', WALLET: 'BILLETERA' } as Record<string, string>)[m] ?? m;
const ticketMedio = (m: string): string =>
  ({ CASH: 'EFEC', CARD: 'TARJ', TRANSFER: 'TRAN', YAPE: 'YAPE', PLIN: 'PLIN', WALLET: 'BILL' } as Record<string, string>)[m] ?? m.slice(0, 4);
const renCode = (desc: string): string => {
  if (/upgrade|mejora|\bupg\b/i.test(desc)) return 'UPG';
  if (/extra|extensi/i.test(desc)) return 'EXT';
  return 'REN';
};

/**
 * Turno según el horario operativo. NOCHE: 22:30 → 06:30 del día siguiente; MAÑANA: 06:30 → 14:00;
 * TARDE: 14:00 → 22:30. El día del ticket corresponde SIEMPRE a la hora de apertura del turno.
 */
export function shiftOf(openedAt: string | Date): 'MAÑANA' | 'TARDE' | 'NOCHE' {
  const d = new Date(openedAt);
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins >= 22 * 60 + 30 || mins < 6 * 60 + 30) return 'NOCHE';
  if (mins < 14 * 60) return 'MAÑANA';
  return 'TARDE';
}
export function dayOf(openedAt: string | Date): string { return DAYS[new Date(openedAt).getDay()]; }

interface HeaderSession { number: number | null; openedAt: string; closedAt: string | null; openedByName: string; closedByName: string | null }

function ticketHeader(titlePrefix: string, s: HeaderSession, brand: string): string[] {
  const open = new Date(s.openedAt);
  const close = s.closedAt ? new Date(s.closedAt) : null;
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const user = (s.closedByName ?? s.openedByName ?? 'USUARIO').toUpperCase();
  // Día y turno se derivan de la APERTURA (regla de turno noche 22:30–06:30).
  return [
    line('='),
    center(`${titlePrefix} - ${brand.toUpperCase()}`),
    line('='),
    `${dm(open)} ${hhmm(open)} - CAJA #${s.number ?? '—'} - ${close ? hhmm(close) : '--:--'}`,
    line('-'),
    `${dm(open)}/${open.getFullYear()} - ${dayOf(open)} - ${shiftOf(open)} - ${user}`,
    line('-'),
    '',
  ];
}

function ticketPage(title: string, text: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; color: #000; font-family: 'Courier New', ui-monospace, monospace; }
  .toolbar { position: sticky; top: 0; display: flex; gap: .5rem; justify-content: center; padding: .6rem; background: #0f172a; }
  .toolbar button { border: 0; border-radius: 7px; padding: .5rem 1.1rem; font-weight: 700; font-size: .85rem; cursor: pointer; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
  .toolbar .print { background: #10b981; color: #04130d; }
  .toolbar .close { background: #334155; color: #e2e8f0; }
  .sheet { width: 80mm; max-width: 96vw; margin: 12px auto; background: #fff; padding: 6mm 4mm; box-shadow: 0 2px 14px rgba(0,0,0,.18); }
  pre.ticket { margin: 0; font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; line-height: 1.28; white-space: pre; color: #000; font-weight: 700; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { box-shadow: none; margin: 0; width: auto; padding: 0; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="print" onclick="window.print()">Imprimir</button>
    <button class="close" onclick="window.close()">Cerrar</button>
  </div>
  <div class="sheet"><pre class="ticket">${esc(text)}</pre></div>
</body></html>`;
}

/** Cuadre detallado del turno (modo administrador / supervisado). Idéntico al de Finanzas › Cajas. */
export function buildCuadreTicket(d: CashDetail, brand: string): string {
  const s = d.session;
  const METHODS = ['CASH', 'CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET'];
  const normal = d.movements.filter((m) => m.status === 'NORMAL');
  const sumT = (types: string[]) => normal.filter((m) => types.includes(m.type)).reduce((a, m) => a + m.amount, 0);
  const sumBy = (types: string[], mth: string) => normal.filter((m) => types.includes(m.type) && m.method === mth).reduce((a, m) => a + m.amount, 0);

  const base = s.openingAmount;
  const efTurno = d.methodBar.byMethod['CASH'] || 0;
  const ing = d.methodBar.ingresos, egr = d.methodBar.egresos;
  const esperado = Math.round((base + efTurno + ing - egr) * 100) / 100;
  const contado = s.closingAmount;
  const diff = contado != null ? Math.round((contado - esperado) * 100) / 100 : null;

  const L: string[] = [];
  L.push(...ticketHeader('CIERRE DE CAJA', s, brand));

  L.push(kv('CAJA BASE CONFIGURADA', 'S/ ' + base.toFixed(2)));
  L.push(kv('EFECTIVO ESPERADO EN CAJON', 'S/ ' + esperado.toFixed(2)));
  L.push(kv('EFECTIVO CONTADO EN CAJON', 'S/ ' + (contado != null ? contado.toFixed(2) : '--')));
  L.push(line('='), '');

  const agg = (title: string, types: string[]) => {
    const tot = sumT(types);
    if (tot <= 0) return;
    L.push(sec(title));
    for (const mth of METHODS) { const v = sumBy(types, mth); if (v > 0) L.push(moneyRow(ticketMethod(mth), v)); }
    L.push(line('-'), moneyRow('TOTAL', tot), '');
  };
  agg('HOSPEDAJE / SERVICIOS', ['HOSPEDAJE', 'SERVICIO']);
  agg('PRODUCTOS', ['PRODUCTO']);

  const renov = normal.filter((m) => m.type === 'RENOVACION');
  if (renov.length) {
    const rtot = renov.reduce((a, m) => a + m.amount, 0);
    L.push(sec('RENOV / UPG / EXTRA'));
    for (const m of renov) L.push(ticketMethod(m.method).slice(0, 9).padEnd(9) + renCode(m.description).padEnd(6) + 'S/ ' + m.amount.toFixed(2).padStart(6));
    L.push(line('-'), 'TOTAL'.padEnd(15) + 'S/ ' + rtot.toFixed(2).padStart(6), '');
  }

  L.push(sec('RESUMEN POR METODO'));
  for (const mth of METHODS) { const v = d.methodBar.byMethod[mth] || 0; if (v > 0) L.push(ticketMethod(mth).slice(0, 14).padEnd(14) + 'TOTAL TURNO : S/ ' + v.toFixed(2).padStart(6)); }
  L.push(line('-'), kv('TOTAL GENERAL', 'S/ ' + d.methodBar.total.toFixed(2)), line('='), '');

  L.push(sec('AJUSTES'));
  if (ing === 0 && egr === 0) L.push('(Sin ajustes operativos)');
  else { if (ing > 0) L.push(kv('Ingresos', '+S/ ' + ing.toFixed(2))); if (egr > 0) L.push(kv('Egresos', '-S/ ' + egr.toFixed(2))); }
  L.push(line('-'), kv('TOTAL AJUSTES', 'S/ ' + (ing - egr).toFixed(2)), line('='), '');

  const cuadreTxt = diff == null ? '--' : diff === 0 ? 'OK' : diff > 0 ? 'SOBRA S/ ' + diff.toFixed(2) : 'FALTA S/ ' + (-diff).toFixed(2);
  L.push(sec('CUADRE DE EFECTIVO'));
  L.push(kv('EFECTIVO (SEGUN SISTEMA)', 'S/ ' + esperado.toFixed(2)));
  L.push(kv('CAJA BASE', '-S/ ' + base.toFixed(2)));
  L.push(line('-'), kv('TOTAL A ENTREGAR', 'S/ ' + (esperado - base).toFixed(2)), line('-'));
  L.push(kv('EFECTIVO REAL EN BOLSA', 'S/ ' + (contado != null ? contado.toFixed(2) : '--')));
  L.push(kv('CUADRE', cuadreTxt));
  L.push(line('='), '', 'FIRMA COLABORADOR', '', '____________________', '');

  const vps = d.virtualPayments ?? [];
  if (vps.length) {
    const vrow = (medio: string, hora: string, monto: string, cli: string, conc: string, cod: string) =>
      medio.padEnd(6) + hora.padEnd(6) + monto.padStart(7) + '  ' + cli.padEnd(4) + ' ' + conc.padEnd(4) + ' ' + cod;
    L.push(sec('PAGOS VIRTUALES'));
    L.push(vrow('MEDIO', 'HORA', 'MONTO', 'CLI', 'CONC', 'COD'));
    L.push(line('-'));
    for (const p of vps) L.push(vrow(ticketMedio(p.method), hhmm(p.time), p.amount.toFixed(2) + (p.mixed ? '*' : ''), (p.client || '').slice(0, 4).toUpperCase(), p.concept, p.code));
    L.push(line('-'));
    if (vps.some((p) => p.mixed)) L.push('* = Pago mixto (Hospedaje + Productos)');
    L.push(line('='));
  }

  return ticketPage(`Cierre de Caja #${s.number ?? ''}`, L.join('\n'));
}

// ── Ticket de CAJA CIEGA (recibo estilizado, conteo por denominaciones) ──
export interface DenominationCount { value: number; qty: number }
export interface BlindTicketData {
  brand: string;
  sessionNumber: number | null;
  openedAt: string;
  closedAt: string;
  closedByName: string;
  base: number;                 // caja base que debe quedar (= apertura del turno)
  denominations: DenominationCount[];
  ingresos: number;
  egresos: number;
  bagRef: string;               // N° de bolsa / referencia (solo se imprime)
}

const denomLabel = (v: number): string => (v >= 1 ? `S/ ${v.toFixed(2)}` : `MON. S/ ${v.toFixed(2)}`);

/** Recibo de cierre en modo caja ciega: no muestra esperado ni diferencias. */
export function buildBlindTicket(t: BlindTicketData): string {
  const total = Math.round(t.denominations.reduce((a, d) => a + d.value * d.qty, 0) * 100) / 100;
  const toBag = Math.round((total - t.base) * 100) / 100;
  const open = new Date(t.openedAt);
  const close = new Date(t.closedAt);
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const money = (n: number) => 'S/ ' + n.toFixed(2);

  // Dos columnas de denominaciones como en el ticket físico.
  const half = Math.ceil(t.denominations.length / 2);
  const colA = t.denominations.slice(0, half);
  const colB = t.denominations.slice(half);
  const denomCell = (d: DenominationCount) => `
    <td class="dn">${esc(denomLabel(d.value))}</td>
    <td class="dq">x ${d.qty}</td>
    <td class="ds">${esc(money(d.value * d.qty))}</td>`;
  const rows: string[] = [];
  for (let i = 0; i < half; i++) {
    rows.push(`<tr>${denomCell(colA[i])}<td class="gap"></td>${colB[i] ? denomCell(colB[i]) : '<td></td><td></td><td></td>'}</tr>`);
  }

  const leader = (label: string, value: string, strong = false) =>
    `<div class="lead${strong ? ' strong' : ''}"><span>${esc(label)}</span><b class="dots"></b><span class="val">${esc(value)}</span></div>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cierre de Caja — Caja Ciega</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; color: #111; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
  .toolbar { position: sticky; top: 0; display: flex; gap: .5rem; justify-content: center; padding: .6rem; background: #0f172a; }
  .toolbar button { border: 0; border-radius: 7px; padding: .5rem 1.1rem; font-weight: 700; font-size: .85rem; cursor: pointer; }
  .toolbar .print { background: #10b981; color: #04130d; }
  .toolbar .close { background: #334155; color: #e2e8f0; }
  .sheet { width: 80mm; max-width: 96vw; margin: 12px auto; background: #fff; padding: 7mm 5mm; box-shadow: 0 2px 14px rgba(0,0,0,.18); }
  .brand { text-align: center; font-size: 13px; font-weight: 700; letter-spacing: .04em; }
  .title { text-align: center; font-size: 22px; font-weight: 800; margin: 2px 0 6px; letter-spacing: .02em; }
  .badge { display: block; width: max-content; margin: 0 auto 8px; background: #111; color: #fff; font-weight: 700; font-size: 12px; padding: 3px 12px; border-radius: 3px; letter-spacing: .05em; }
  .hr { border-top: 1.5px dashed #9ca3af; margin: 8px 0; }
  .split { display: grid; grid-template-columns: 1fr 1px 1fr; gap: 8px; text-align: center; margin: 6px 0; }
  .split .sp { background: #d1d5db; }
  .split .lb { font-size: 11px; color: #6b7280; font-weight: 700; }
  .split .vv { font-size: 18px; font-weight: 800; }
  .kv { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 2px 0; }
  .kv .k { font-weight: 700; }
  .kv .v { text-align: right; }
  h4 { margin: 10px 0 4px; font-size: 12px; background: #f3f4f6; padding: 3px 6px; border-radius: 3px; letter-spacing: .03em; }
  .lead { display: flex; align-items: baseline; gap: 4px; font-size: 12px; padding: 2px 0; }
  .lead .dots { flex: 1; border-bottom: 1.5px dotted #9ca3af; transform: translateY(-3px); }
  .lead .val { font-weight: 700; white-space: nowrap; }
  .lead.strong { font-size: 13px; } .lead.strong .val { font-weight: 800; }
  table.denom { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 2px; }
  table.denom td { padding: 1px 0; vertical-align: baseline; }
  table.denom .dn { color: #374151; } table.denom .dq { text-align: center; color: #6b7280; width: 32px; }
  table.denom .ds { text-align: right; font-weight: 700; } table.denom .gap { width: 10px; }
  .dtot { display: flex; justify-content: space-between; font-size: 13px; font-weight: 800; border-top: 1.5px solid #111; margin-top: 4px; padding-top: 3px; }
  .io { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .io .up { color: #059669; } .io .dn2 { color: #dc2626; }
  .bag { font-size: 12px; font-weight: 700; padding: 2px 0; }
  .foot { text-align: center; font-size: 10px; color: #6b7280; margin-top: 10px; line-height: 1.35; }
  .foot b { display: block; color: #111; font-size: 11px; margin-top: 3px; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { box-shadow: none; margin: 0; width: auto; padding: 0; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="print" onclick="window.print()">Imprimir</button>
    <button class="close" onclick="window.close()">Cerrar</button>
  </div>
  <div class="sheet">
    <div class="brand">${esc(t.brand.toUpperCase())}</div>
    <div class="title">CIERRE DE CAJA</div>
    <span class="badge">MODO CAJA CIEGA</span>
    <div class="hr"></div>
    <div class="split">
      <div><div class="lb">DÍA:</div><div class="vv">${esc(dayOf(open))}</div></div>
      <div class="sp"></div>
      <div><div class="lb">TURNO:</div><div class="vv">${esc(shiftOf(open))}</div></div>
    </div>
    <div class="hr"></div>
    <div class="kv"><span class="k">FECHA DE CIERRE:</span><span class="v">${esc(dm(close))}</span></div>
    <div class="kv"><span class="k">HORA DE CIERRE:</span><span class="v">${esc(hhmm(close))}</span></div>
    <div class="kv"><span class="k">CERRADO POR:</span><span class="v">${esc(t.closedByName)}</span></div>
    <div class="kv"><span class="k">INICIO DE TURNO:</span><span class="v">${esc(dm(open))} ${esc(hhmm(open))}</span></div>
    <div class="kv"><span class="k">N° DE TURNO:</span><span class="v">${esc(shiftOf(open))}</span></div>
    <div class="hr"></div>
    <h4>RESUMEN DEL CONTEO</h4>
    ${leader('Total efectivo contado', money(total))}
    ${leader('Caja base que debe quedar', money(t.base))}
    ${leader('Efectivo que va a la bolsa', money(toBag), true)}
    <h4>CONTEO POR DENOMINACIONES</h4>
    <table class="denom"><tbody>${rows.join('')}</tbody></table>
    <div class="dtot"><span>TOTAL</span><span>${esc(money(total))}</span></div>
    <h4>INGRESOS Y EGRESOS REGISTRADOS</h4>
    <div class="io"><span class="up">⬆ Ingresos de caja</span><span class="up">+ ${esc(money(t.ingresos))}</span></div>
    <div class="io"><span class="dn2">⬇ Egresos de caja</span><span class="dn2">- ${esc(money(t.egresos))}</span></div>
    <h4>N° DE BOLSA / REFERENCIA</h4>
    <div class="bag">${esc(t.bagRef || '—')}</div>
    <div class="foot">Este ticket se imprime sin mostrar diferencias<br>por modo caja ciega.<b>Documento sin valor tributario</b></div>
  </div>
</body></html>`;
}
