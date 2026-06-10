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

  /** Prints an HTML document to the default printer (auto-connects if needed). */
  async printHtml(html: string): Promise<void> {
    if (!qz.websocket.isActive()) await this.connect();
    const printer = await qz.printers.getDefault();
    const config = qz.configs.create(printer);
    await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
  }
}
