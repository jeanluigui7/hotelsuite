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

/** Columna para la exportación a tabla de Excel. */
export interface XlsxColumn {
  header: string;
  width?: number;
  numFmt?: string; // ej. '#,##0.00' para montos
  align?: 'left' | 'right' | 'center';
}

/**
 * Exporta a un .xlsx REAL con una TABLA de Excel (ListObject): encabezado con filtros,
 * filas con bandas y estilo. ExcelJS se carga de forma diferida (solo al exportar) para no
 * engordar el bundle principal.
 */
export async function downloadXlsxTable(
  filename: string,
  sheetName: string,
  columns: XlsxColumn[],
  rows: (string | number | null | undefined)[][],
  tableName = 'Datos',
): Promise<void> {
  // ExcelJS es CommonJS: según el interop, el constructor puede venir en la raíz o en `.default`.
  const mod = (await import('exceljs')) as unknown as { Workbook?: new () => ExcelWorkbook; default?: { Workbook: new () => ExcelWorkbook } };
  const WorkbookCtor = mod.Workbook ?? mod.default?.Workbook;
  if (!WorkbookCtor) throw new Error('ExcelJS no disponible');
  const wb = new WorkbookCtor();
  const ws = wb.addWorksheet(sheetName.slice(0, 31) || 'Datos');
  const safeName = (tableName.replace(/[^A-Za-z0-9_]/g, '_') || 'Datos').replace(/^(\d)/, '_$1');
  ws.addTable({
    name: safeName,
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium9', showRowStripes: true },
    columns: columns.map((c) => ({ name: c.header, filterButton: true })),
    rows: rows.map((r) => r.map((v) => (v == null ? '' : v))),
  });
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.width) col.width = c.width;
    if (c.numFmt) col.numFmt = c.numFmt;
    if (c.align) col.alignment = { horizontal: c.align };
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Tipos mínimos de ExcelJS que usamos (evita depender del tipado completo en tiempo de compilación).
interface ExcelWorkbook {
  addWorksheet(name: string): ExcelWorksheet;
  xlsx: { writeBuffer(): Promise<ArrayBuffer> };
}
interface ExcelWorksheet {
  addTable(opts: {
    name: string; ref: string; headerRow: boolean;
    style: { theme: string; showRowStripes: boolean };
    columns: { name: string; filterButton: boolean }[];
    rows: (string | number)[][];
  }): void;
  getColumn(i: number): { width?: number; numFmt?: string; alignment?: { horizontal: string } };
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
