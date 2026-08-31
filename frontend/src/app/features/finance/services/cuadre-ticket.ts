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

function ticketHeader(s: HeaderSession): string[] {
  const open = new Date(s.openedAt);
  const close = s.closedAt ? new Date(s.closedAt) : null;
  const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const user = (s.closedByName ?? s.openedByName ?? 'USUARIO').toUpperCase();
  // Título con el ID de la caja (sin marca). Día/turno/colaborador y horarios compactos.
  return [
    line('='),
    center(`CIERRE DE CAJA - CAJA #${s.number ?? ''}`),
    line('='),
    `${dayOf(open)} - ${shiftOf(open)} - ${user}`,
    '',
    'INICIO:'.padEnd(8) + `${dmy(open)} ${hhmm(open)}`,
    'FIN:'.padEnd(8) + (close ? `${dmy(close)} ${hhmm(close)}` : '--'),
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

/** Cuadre detallado del turno (modo administrador / auditoría). Idéntico al de Finanzas › Cajas. */
export function buildCuadreTicket(d: CashDetail): string {
  const s = d.session;
  const METHODS = ['CASH', 'CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET'];
  const normal = d.movements.filter((m) => m.status === 'NORMAL');
  const sumT = (types: string[]) => normal.filter((m) => types.includes(m.type)).reduce((a, m) => a + m.amount, 0);
  const sumBy = (types: string[], mth: string) => normal.filter((m) => types.includes(m.type) && m.method === mth).reduce((a, m) => a + m.amount, 0);

  const base = s.openingAmount;
  const efTurno = d.methodBar.byMethod['CASH'] || 0;
  const ing = d.methodBar.ingresos, egr = d.methodBar.egresos;
  // Efectivo esperado EN EL CAJÓN (incluye la caja base). Los ajustes (ing/egr) ya se cuentan aquí una sola vez.
  const esperado = Math.round((base + efTurno + ing - egr) * 100) / 100;
  // Esperado A ENTREGAR = efectivo del cajón − caja base (la base se queda para el siguiente turno).
  const esperadoEntregar = Math.round((esperado - base) * 100) / 100;
  // El contado proviene del MISMO conteo por denominaciones del ticket de caja ciega (closingAmount, ya sin la base).
  const contado = s.closingAmount;
  // Cuadre = contado − esperado a entregar (NO contra el esperado del cajón, que incluye la base).
  const diff = contado != null ? Math.round((contado - esperadoEntregar) * 100) / 100 : null;

  const L: string[] = [];
  L.push(...ticketHeader(s));

  L.push(kv('CAJA BASE CONFIGURADA', 'S/ ' + base.toFixed(2)));
  L.push(kv('EFECTIVO ESPERADO SISTEMA', 'S/ ' + esperado.toFixed(2)));
  L.push(kv('EFECTIVO CONTADO DENOMIN.', 'S/ ' + (contado != null ? contado.toFixed(2) : '--')));
  L.push(line('='), '');

  const agg = (title: string, types: string[]) => {
    const tot = sumT(types);
    if (tot <= 0) return;
    L.push(sec(title));
    // Solo se imprimen los métodos con movimientos (dinámico, sin líneas en cero).
    for (const mth of METHODS) { const v = sumBy(types, mth); if (v > 0) L.push(moneyRow(ticketMethod(mth), v)); }
    L.push(line('-'), moneyRow('TOTAL', tot), '');
  };
  // Categorías reales: HOSPEDAJE agrupa hospedaje + renovaciones/upgrades/extras de la estancia.
  agg('HOSPEDAJE', ['HOSPEDAJE', 'RENOVACION']);
  agg('PRODUCTOS', ['PRODUCTO']);
  agg('SERVICIOS / PENALIDADES', ['SERVICIO']);

  L.push(sec('RESUMEN POR METODO'));
  for (const mth of METHODS) { const v = d.methodBar.byMethod[mth] || 0; if (v > 0) L.push(ticketMethod(mth).slice(0, 14).padEnd(14) + 'TOTAL TURNO : S/ ' + v.toFixed(2).padStart(6)); }
  L.push(line('-'), kv('TOTAL GENERAL', 'S/ ' + d.methodBar.total.toFixed(2)), line('='), '');

  L.push(sec('AJUSTES'));
  if (ing === 0 && egr === 0) L.push('(Sin ajustes operativos)');
  else { if (ing > 0) L.push(kv('Ingresos', '+S/ ' + ing.toFixed(2))); if (egr > 0) L.push(kv('Egresos', '-S/ ' + egr.toFixed(2))); }
  L.push(line('-'), kv('TOTAL AJUSTES', 'S/ ' + (ing - egr).toFixed(2)), line('='), '');

  const cuadreTxt = diff == null ? '--' : diff === 0 ? 'CUADRADO' : diff > 0 ? 'SOBRA S/ ' + diff.toFixed(2) : 'FALTA S/ ' + (-diff).toFixed(2);
  L.push(sec('CUADRE DE EFECTIVO'));
  L.push(kv('EFECTIVO SEGUN SISTEMA', 'S/ ' + esperado.toFixed(2)));
  L.push(kv('CAJA BASE', '-S/ ' + base.toFixed(2)));
  L.push(line('-'), kv('ESPERADO A ENTREGAR', 'S/ ' + esperadoEntregar.toFixed(2)), line('-'));
  L.push(kv('EFECTIVO CONTADO', 'S/ ' + (contado != null ? contado.toFixed(2) : '--')));
  L.push(kv('CUADRE', cuadreTxt));
  L.push(line('='), '', 'FIRMA COLABORADOR', '', '____________________', '');

  const vps = d.virtualPayments ?? [];
  if (vps.length) {
    // Ancho disponible para COD = TW − (columnas previas). El código se recorta a ese ancho
    // para que ninguna fila desborde el ticket (antes "NO REGISTRADO" se salía del ancho).
    const COD_W = TW - 31; // medio6+hora6+monto7+2+cli4+1+conc4+1 = 31
    const vrow = (medio: string, hora: string, monto: string, cli: string, conc: string, cod: string) =>
      medio.padEnd(6) + hora.padEnd(6) + monto.padStart(7) + '  ' + cli.padEnd(4) + ' ' + conc.padEnd(4) + ' ' + cod.slice(0, COD_W);
    L.push(sec('PAGOS VIRTUALES'));
    L.push(vrow('MEDIO', 'HORA', 'MONTO', 'CLI', 'CONC', 'COD'));
    L.push(line('-'));
    // Código real desde la venta; si la venta no lo registró (legado), se indica de forma breve.
    for (const p of vps) L.push(vrow(ticketMedio(p.method), hhmm(p.time), p.amount.toFixed(2) + (p.mixed ? '*' : ''), (p.client || '').slice(0, 4).toUpperCase(), p.concept, p.code?.trim() || 'SIN CODIGO'));
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

/**
 * Recibo de cierre en modo caja ciega (formato térmico monoespaciado, 1 columna). Es el comprobante
 * FÍSICO de lo que el recepcionista entrega en la bolsa: el conteo por denominaciones ES el efectivo
 * entregado (NO incluye la caja base, que se queda en el cajón). No se resta la base ni se compara
 * contra el sistema; sin bloques de auditoría, pagos virtuales ni resumen por método.
 */
export function buildBlindTicket(t: BlindTicketData): string {
  const total = Math.round(t.denominations.reduce((a, d) => a + d.value * d.qty, 0) * 100) / 100;
  const ajusteNeto = Math.round((t.ingresos - t.egresos) * 100) / 100;
  const open = new Date(t.openedAt);
  const close = new Date(t.closedAt);
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const money = (n: number) => 'S/ ' + n.toFixed(2);
  const titleId = t.sessionNumber != null ? ` - ${t.sessionNumber}` : '';
  // Etiqueta/valor a lo ancho del ticket (valor alineado a la derecha).
  const lr = (l: string, r: string) => l + ' '.repeat(Math.max(1, TW - l.length - r.length)) + r;
  const kv2 = (label: string, value: string) => (label + ':').padEnd(17) + value;
  const denomLbl = (v: number) => (v < 5 ? 'MON. S/ ' : 'S/ ') + v.toFixed(2);

  const L: string[] = [];
  L.push(center(`CIERRE DE CAJA${titleId}`), '');
  L.push(lr('DÍA:', 'TURNO:'));
  L.push(lr(dayOf(open), shiftOf(open)));
  L.push(line('='));
  L.push(kv2('INICIO DE TURNO', `${dm(open)} ${hhmm(open)}`));
  L.push(kv2('FIN DE TURNO', `${dm(close)} ${hhmm(close)}`));
  L.push(kv2('CERRADO POR', t.closedByName));
  L.push(line('='), '');
  L.push('RESUMEN DEL CONTEO', '-'.repeat(20), '');
  L.push(lr('Caja base que debe quedar', money(t.base)));
  L.push(lr('Ingresos registrados', money(t.ingresos)));
  L.push(lr('Egresos registrados', money(t.egresos)));
  L.push(lr('Ajuste neto', money(ajusteNeto)));
  L.push(lr('Efectivo contado para entregar', money(total)));
  L.push(line('='), '');
  L.push('CONTEO POR DENOMINACIONES', '-'.repeat(26), '');
  for (const d of t.denominations) {
    const left = denomLbl(d.value).padEnd(13) + 'x ' + String(d.qty).padStart(2);
    L.push(left + '   = ' + ('S/ ' + (d.value * d.qty).toFixed(2)).padStart(9));
  }
  L.push(line('-'));
  L.push(lr('TOTAL', money(total)), '');
  L.push(center('Documento sin valor tributario'));
  return ticketPage(`Cierre de Caja${titleId}`, L.join('\n'));
}
