import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import qz from 'qz-tray';
import { PrintingApiService } from './printing-api.service';

export type QzStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * QZ Tray integration. The private key stays on the backend: the certificate
 * and signature promises delegate to /printing endpoints. Used to print
 * tickets/comprobantes silently to a local printer.
 */
@Injectable({ providedIn: 'root' })
export class PrintingService {
  private readonly api = inject(PrintingApiService);

  readonly status = signal<QzStatus>('disconnected');
  private securityReady = false;

  private setupSecurity(): void {
    if (this.securityReady) return;
    this.securityReady = true;

    qz.security.setCertificatePromise((resolve: (c?: string) => void) => {
      firstValueFrom(this.api.certificate())
        .then((res) => resolve(res.data.certificate || undefined))
        .catch(() => resolve(undefined));
    });

    qz.security.setSignatureAlgorithm('SHA512');
    qz.security.setSignaturePromise((toSign: string) => {
      return (resolve: (s: string) => void, reject: (e: unknown) => void) => {
        firstValueFrom(this.api.sign(toSign))
          .then((res) => resolve(res.data.signature))
          .catch(reject);
      };
    });
  }

  async connect(): Promise<void> {
    this.setupSecurity();
    if (qz.websocket.isActive()) {
      this.status.set('connected');
      return;
    }
    this.status.set('connecting');
    try {
      await qz.websocket.connect();
      this.status.set('connected');
    } catch (err) {
      this.status.set('disconnected');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (qz.websocket.isActive()) await qz.websocket.disconnect();
    this.status.set('disconnected');
  }

  /** Lista las impresoras instaladas (requiere QZ conectado; auto-conecta). */
  async listPrinters(): Promise<string[]> {
    if (!qz.websocket.isActive()) await this.connect();
    const res = (await qz.printers.find()) as string | string[];
    return Array.isArray(res) ? res : [res];
  }

  /**
   * Imprime un HTML. Si se indica `printer` usa esa impresora; si no, la predeterminada.
   * `copies` repite el trabajo (QZ no expone copies para HTML de forma uniforme).
   */
  async printHtml(html: string, opts?: { printer?: string; copies?: number }): Promise<void> {
    if (!qz.websocket.isActive()) await this.connect();
    const printer = opts?.printer && opts.printer.trim() ? opts.printer : await qz.printers.getDefault();
    const config = qz.configs.create(printer);
    const copies = Math.max(1, opts?.copies ?? 1);
    for (let i = 0; i < copies; i++) {
      await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
    }
  }

  /** Imprime un ticket de prueba en la impresora indicada (o la predeterminada). */
  async printTest(printer?: string): Promise<void> {
    const html = `<div style="font-family:monospace;width:260px;text-align:center">
      <div style="font-weight:bold">PRUEBA DE IMPRESION</div>
      <div>HotelSuite · QZ Tray</div>
      <div>${new Date().toLocaleString('es-PE')}</div>
      <div>--------------------------------</div>
      <div>Si lees esto, la impresora funciona.</div>
    </div>`;
    await this.printHtml(html, { printer });
  }

  /**
   * Fallback printing without QZ Tray: renders the receipt in an isolated
   * off-screen iframe and opens the browser's native print dialog (which lets
   * the user pick any installed printer and shows a print preview).
   */
  printViaBrowser(html: string): void {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // Fuera de pantalla PERO con ancho real, para que el contenido tome su tamaño natural y podamos
    // medir su altura (con width:0 no se puede medir bien).
    iframe.style.cssText = 'position:fixed; left:-10000px; top:0; width:420px; height:1200px; border:0;';
    document.body.appendChild(iframe);

    const cleanup = (): void => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    iframe.onload = (): void => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      // Ticketera térmica de 80 mm: fijamos el tamaño de PÁGINA a 80 mm de ancho × la ALTURA REAL del
      // contenido, para que el papel se corte al final del ticket y no salga una hoja A4 con espacio en
      // blanco. (Chrome no encoge la altura con `size: 80mm auto`, por eso se calcula en px.)
      try {
        const doc2 = win.document;
        const h = Math.ceil((doc2.body?.scrollHeight ?? 0)) + 6;
        if (h > 6) {
          const st = doc2.createElement('style');
          st.textContent = `@page { size: 80mm ${h}px; margin: 0; }`;
          (doc2.head ?? doc2.body ?? doc2.documentElement).appendChild(st);
        }
      } catch { /* si no se puede medir, se imprime con el @page del propio documento */ }
      // Remove the iframe shortly after the print dialog is dismissed.
      win.onafterprint = (): void => {
        setTimeout(cleanup, 100);
      };
      win.focus();
      win.print();
      // Safety net in case onafterprint never fires (some browsers).
      setTimeout(cleanup, 60_000);
    };

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      cleanup();
      return;
    }
    doc.open();
    // Si el html ya es un documento completo (con su propio <head>/<style>/@page), se imprime tal cual
    // para respetar el tamaño de papel térmico; si es un fragmento, se envuelve en un documento mínimo.
    const isFullDoc = /^\s*<!doctype|^\s*<html/i.test(html);
    doc.write(isFullDoc ? html : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Impresión</title></head><body>${html}</body></html>`);
    doc.close();
  }
}
