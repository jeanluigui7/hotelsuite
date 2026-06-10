import type { Invoice, Sale } from '../services/finance.models';

const STYLE = `
  <style>
    * { font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
    .r { width: 280px; }
    h2 { text-align: center; font-size: 14px; margin: 0 0 6px; }
    .muted { color: #444; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    td { padding: 1px 0; vertical-align: top; }
    .right { text-align: right; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .tot { font-weight: bold; font-size: 13px; }
    .center { text-align: center; }
  </style>
`;

function money(v: string | number): string {
  return Number(v).toFixed(2);
}

export function buildSaleReceipt(sale: Sale, branchName: string): string {
  const rows = sale.items
    .map(
      (i) =>
        `<tr><td>${i.quantity} x ${i.description}</td><td class="right">${money(i.subtotal)}</td></tr>`,
    )
    .join('');
  const pays = sale.payments
    .map((p) => `<tr><td>${p.method}</td><td class="right">${money(p.amount)}</td></tr>`)
    .join('');
  return `
    ${STYLE}
    <div class="r">
      <h2>${branchName}</h2>
      <div class="center muted">TICKET DE VENTA</div>
      <div class="muted">${sale.customerName ?? 'Cliente'}</div>
      <div class="line"></div>
      <table>${rows}</table>
      <div class="line"></div>
      <table><tr class="tot"><td>TOTAL</td><td class="right">${money(sale.total)}</td></tr></table>
      <table>${pays}</table>
      <div class="line"></div>
      <div class="center muted">¡Gracias por su compra!</div>
    </div>
  `;
}

export function buildInvoiceReceipt(inv: Invoice, branchName: string): string {
  return `
    ${STYLE}
    <div class="r">
      <h2>${branchName}</h2>
      <div class="center muted">${inv.type} ELECTRÓNICA</div>
      <div class="center">${inv.folio}</div>
      <div class="line"></div>
      <div>Cliente: ${inv.customerName}</div>
      ${inv.customerDoc ? `<div>Doc: ${inv.customerDoc}</div>` : ''}
      <div class="line"></div>
      <table>
        <tr><td>Op. Gravada</td><td class="right">${money(inv.subtotal)}</td></tr>
        <tr><td>IGV (18%)</td><td class="right">${money(inv.taxAmount)}</td></tr>
        <tr class="tot"><td>TOTAL</td><td class="right">${money(inv.total)}</td></tr>
      </table>
      <div class="line"></div>
      <div class="center muted">Representación impresa</div>
    </div>
  `;
}
