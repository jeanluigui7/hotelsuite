import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

/**
 * Escáner de códigos de barras por cámara (reutilizable).
 * Uso:
 *   <app-barcode-scanner [(visible)]="scanVisible" (code)="form.barcode = $event" />
 *   <button (click)="scanVisible = true">…</button>
 *
 * La cámara (getUserMedia) exige contexto seguro (HTTPS o localhost). En producción
 * el sitio ya va por HTTPS. En navegadores/entornos sin cámara muestra un aviso y el
 * usuario puede seguir usando la pistola o tecleando el código.
 */
@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [DialogModule],
  template: `
    <p-dialog
      [visible]="visible"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [dismissableMask]="true"
      header="Escanear código de barras"
      [style]="{ width: '30rem', maxWidth: '95vw' }"
      styleClass="bcs-dialog"
    >
      <div class="bcs">
        @if (error()) {
          <div class="bcs-err">
            <i class="pi pi-exclamation-triangle"></i>
            <div>
              <b>No se pudo abrir la cámara.</b>
              <p>{{ error() }}</p>
              <small>Puedes usar la pistola lectora o escribir el código a mano.</small>
            </div>
          </div>
        } @else {
          <div class="bcs-frame">
            <video #video class="bcs-video" playsinline muted></video>
            <div class="bcs-reticle"></div>
          </div>
          <p class="bcs-hint"><i class="pi pi-info-circle"></i> Apunta la cámara al código de barras. Se detecta automáticamente.</p>
        }
      </div>
    </p-dialog>
  `,
  styles: [
    `
      .bcs { display: flex; flex-direction: column; gap: 0.7rem; }
      .bcs-frame { position: relative; width: 100%; aspect-ratio: 4 / 3; background: #000; border-radius: 12px; overflow: hidden; }
      .bcs-video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .bcs-reticle { position: absolute; inset: 18% 10%; border: 3px solid rgba(0,168,59,0.9); border-radius: 12px; box-shadow: 0 0 0 100vmax rgba(0,0,0,0.25); pointer-events: none; }
      .bcs-hint { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-size: 0.8rem; color: #7fb0d8; }
      .bcs-hint .pi { color: #60a5fa; }
      .bcs-err { display: flex; align-items: flex-start; gap: 0.6rem; background: rgba(240,0,24,0.08); border: 1px solid rgba(240,0,24,0.3); border-radius: 12px; padding: 0.9rem; color: #f0c9c9; }
      .bcs-err .pi { color: #f87171; font-size: 1.3rem; margin-top: 0.1rem; }
      .bcs-err b { color: #fff; } .bcs-err p { margin: 0.2rem 0; font-size: 0.85rem; } .bcs-err small { color: #9aa; }
    `,
  ],
})
export class BarcodeScannerComponent {
  /** Control de visibilidad (two-way: [(visible)]). */
  private _visible = false;
  @Input()
  get visible(): boolean { return this._visible; }
  set visible(v: boolean) {
    if (v === this._visible) return;
    this._visible = v;
    if (v) queueMicrotask(() => this.start());
    else this.stop();
  }
  @Output() visibleChange = new EventEmitter<boolean>();
  /** Emite el código detectado. */
  @Output() code = new EventEmitter<string>();

  readonly error = signal<string | null>(null);
  private reader?: BrowserMultiFormatReader;
  private controls?: IScannerControls;

  onVisibleChange(v: boolean): void {
    this._visible = v;
    this.visibleChange.emit(v);
    if (!v) this.stop();
  }

  private async start(): Promise<void> {
    this.error.set(null);
    const video = document.querySelector<HTMLVideoElement>('app-barcode-scanner video.bcs-video');
    if (!video) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      this.error.set('Este dispositivo o navegador no permite acceso a la cámara (requiere HTTPS).');
      return;
    }
    try {
      this.reader = new BrowserMultiFormatReader();
      this.controls = await this.reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        video,
        (result) => {
          if (result) {
            const text = result.getText();
            this.code.emit(text);
            this.onVisibleChange(false);
          }
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      // NotAllowedError = el usuario negó el permiso; NotFoundError = sin cámara.
      this.error.set(/denied|NotAllowed/i.test(msg) ? 'Permiso de cámara denegado. Habilítalo en el navegador.' : msg);
    }
  }

  private stop(): void {
    try { this.controls?.stop(); } catch { /* noop */ }
    this.controls = undefined;
    this.reader = undefined;
  }
}
