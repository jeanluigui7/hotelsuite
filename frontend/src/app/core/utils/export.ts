/** Minimal CSV export (Excel-compatible) — no extra dependencies. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const escape = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))];
  // BOM so Excel detects UTF-8.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta un reporte a PDF sin dependencias: renderiza un HTML imprimible en un
 * iframe aislado y abre el diálogo de impresión del navegador, donde el usuario
 * puede elegir "Guardar como PDF". `bodyHtml` es el contenido (tablas, tarjetas).
 */
export function printPdf(title: string, bodyHtml: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const cleanup = (): void => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };

  iframe.onload = (): void => {
    const win = iframe.contentWindow;
    if (!win) { cleanup(); return; }
    win.onafterprint = (): void => { setTimeout(cleanup, 100); };
    win.focus();
    win.print();
    setTimeout(cleanup, 60_000);
  };

  const styles = `
    * { font-family: Arial, Helvetica, sans-serif; color: #111; box-sizing: border-box; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
    h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; text-align: left; }
    th { background: #f2f2f2; }
    .num { text-align: right; }
    .cards { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px; min-width: 110px; }
    .kpi .l { font-size: 10px; color: #555; text-transform: uppercase; }
    .kpi .v { font-size: 18px; font-weight: 700; }
    @page { margin: 14mm; }`;

  const doc = iframe.contentWindow?.document;
  if (!doc) { cleanup(); return; }
  const now = new Date().toLocaleString('es-PE');
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${styles}</style></head><body><h1>${title}</h1><div class="meta">Generado: ${now}</div>${bodyHtml}</body></html>`);
  doc.close();
}
