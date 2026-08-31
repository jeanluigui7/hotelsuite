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
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
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
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Impresión</title></head><body>${html}</body></html>`);
    doc.close();
  }
}
