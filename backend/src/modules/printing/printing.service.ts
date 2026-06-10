import crypto from 'node:crypto';
import fs from 'node:fs';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors';

/**
 * QZ Tray signing. The PRIVATE KEY never leaves the backend: the browser asks
 * this endpoint to sign each print request, and QZ Tray verifies the signature
 * with the matching public certificate. Algorithm: RSA-SHA512 (QZ Tray ≥ 2.1).
 *
 * Configure QZ_PRIVATE_KEY_PATH and QZ_CERT_PATH (see README). If unset, the
 * endpoints respond 503 so the UI can show "QZ no configurado".
 */
class PrintingService {
  private privateKey: string | null = null;
  private certificate: string | null = null;
  private loaded = false;

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (env.QZ_PRIVATE_KEY_PATH && fs.existsSync(env.QZ_PRIVATE_KEY_PATH)) {
      this.privateKey = fs.readFileSync(env.QZ_PRIVATE_KEY_PATH, 'utf8');
    }
    if (env.QZ_CERT_PATH && fs.existsSync(env.QZ_CERT_PATH)) {
      this.certificate = fs.readFileSync(env.QZ_CERT_PATH, 'utf8');
    }
  }

  isConfigured(): boolean {
    this.load();
    return Boolean(this.privateKey);
  }

  /** Public certificate QZ Tray uses to verify signatures (empty string if none). */
  getCertificate(): string {
    this.load();
    return this.certificate ?? '';
  }

  /** Signs the data QZ Tray sends, returning a base64 signature. */
  sign(toSign: string): string {
    this.load();
    if (!this.privateKey) {
      throw new AppError('QZ_NOT_CONFIGURED', 'QZ Tray no está configurado en el servidor', 503);
    }
    const signer = crypto.createSign('RSA-SHA512');
    signer.update(toSign);
    signer.end();
    return signer.sign(this.privateKey, 'base64');
  }
}

export const printingService = new PrintingService();
