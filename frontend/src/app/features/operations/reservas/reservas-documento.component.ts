import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { OperationsApiService } from '../services/operations-api.service';
import { habitacionesResumen, type Reserva } from './reservas.model';

/** Normaliza un teléfono a formato internacional para wa.me (solo dígitos; Perú +51 por defecto). */
function normalizeWaPhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('9')) d = '51' + d; // móvil peruano local → +51
  return d;
}

/** Identidad del hotel para el membrete (del snapshot de un documento definitivo, o de la sucursal). */
export interface DocHotel {
  nombre?: string;
  logoUrl?: string | null;
  legalName?: string | null;
  ruc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
}

/** Estilos de impresión autocontenidos del documento (el iframe no tiene el .scss del componente). */
const DOC_PRINT_STYLES = `
  * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #1a1a2e; }
  body { margin: 0; }
  .doc-sheet { max-width: 720px; margin: 0 auto; font-size: 13px; line-height: 1.45; }
  .doc-sheet.ticket { max-width: 280px; font-size: 12px; }
  .doc-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .brand .logo { max-height: 56px; max-width: 120px; object-fit: contain; }
  .brand h2 { margin: 0 0 2px; font-size: 17px; }
  .doc-meta { text-align: right; }
  .badge { display: inline-block; border: 1px solid #1a1a2e; border-radius: 6px; padding: 2px 10px; font-size: 11px; font-weight: 700; letter-spacing: .04em; }
  .code { font-size: 18px; font-weight: 800; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .doc-title { font-size: 20px; margin: 14px 0 8px; }
  .callout { background: #f4f4fb; border-left: 3px solid #5b5bd6; padding: 8px 12px; border-radius: 6px; margin: 8px 0; font-size: 12px; }
  .muted { color: #666; } .small { font-size: 11px; } .right { text-align: right; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th, td { padding: 5px 8px; border-bottom: 1px solid #e2e2ee; text-align: left; font-size: 12px; }
  th { background: #f4f4fb; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  h3, h4 { margin: 12px 0 4px; font-size: 13px; }
  .doc-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .doc-sheet.ticket .doc-cols { grid-template-columns: 1fr; }
  .totals { margin-top: 8px; } .totals .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { font-weight: 800; border-top: 2px solid #1a1a2e; margin-top: 4px; padding-top: 6px; }
  .doc-foot { margin-top: 16px; border-top: 1px solid #e2e2ee; padding-top: 8px; font-size: 10px; color: #888; }
`;

@Component({
  selector: 'app-reservas-documento',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule],
  templateUrl: './reservas-documento.component.html',
  styleUrls: ['./reservas-documento.component.scss'],
})
export class ReservasDocumentoComponent {
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly ops = inject(OperationsApiService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() reserva: Reserva | null = null;
  /** TENTATIVA = "Constancia de reserva tentativa"; CONFIRMACION = "Confirmación de reserva". */
  @Input() tipo: 'TENTATIVA' | 'CONFIRMACION' = 'TENTATIVA';
  /** ETAPA 4C · documento definitivo (emitido al confirmar): quita el sello "Vista previa de diseño". */
  @Input() definitivo = false;
  /** Identidad del hotel congelada en el snapshot; si no se pasa, se usa la sucursal activa. */
  @Input() hotelOverride: DocHotel | null = null;
  @Input() docVersion: number | null = null;
  @Output() verReserva = new EventEmitter<string>();

  @ViewChild('sheet') sheet?: ElementRef<HTMLElement>;

  readonly formato = signal<'A4' | 'TICKET'>('A4');
  readonly formatoOpts = [
    { label: 'A4', value: 'A4' },
    { label: 'Ticket 80 mm', value: 'TICKET' },
  ];

  enviarDialog = false;
  canal: 'WHATSAPP' | 'CORREO' = 'WHATSAPP';
  mensaje = '';
  readonly canalOpts = [
    { label: 'WhatsApp', value: 'WHATSAPP' },
    { label: 'Correo', value: 'CORREO' },
  ];

  readonly branch = computed(() => this.auth.activeBranch());
  readonly today = new Date();
  resumen = habitacionesResumen;

  /** Membrete: identidad congelada del snapshot (documento definitivo) o la de la sucursal activa. */
  readonly hotel = computed<DocHotel>(() => {
    if (this.hotelOverride) return this.hotelOverride;
    const b = this.branch();
    return b
      ? { nombre: b.name, logoUrl: b.logoUrl, legalName: b.legalName, ruc: b.taxId, direccion: b.address, telefono: b.landline || b.mobile || b.phone, email: b.email }
      : { nombre: 'Hospedaje' };
  });

  titulo(): string {
    return this.tipo === 'CONFIRMACION' ? 'Confirmación de reserva' : 'Constancia de reserva tentativa';
  }
  moneda(): string {
    const c = this.branch()?.currency;
    return c === 'USD' ? '$' : 'S/';
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  /** Descargar PDF = imprimir y elegir "Guardar como PDF" en el diálogo del navegador (sin dependencias). */
  descargarPdf(): void {
    this.messages.add({ severity: 'info', summary: 'Guardar como PDF', detail: 'En el diálogo de impresión, elige "Guardar como PDF" como destino.' });
    this.imprimir();
  }

  /**
   * Imprime el documento vía un iframe aislado (no popup, no se bloquea) y abre el diálogo del navegador,
   * donde el usuario puede imprimir o Guardar como PDF. @page según el formato (A4 o ticket 80 mm).
   */
  imprimir(): void {
    const el = this.sheet?.nativeElement;
    if (!el) return;
    const page = this.formato() === 'TICKET' ? '@page { size: 80mm auto; margin: 4mm; }' : '@page { size: A4; margin: 14mm; }';
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
    const doc = iframe.contentWindow?.document;
    if (!doc) { cleanup(); return; }
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${this.reserva?.codigo ?? 'Documento'}</title><style>${DOC_PRINT_STYLES}${page}</style></head><body>${el.outerHTML}</body></html>`);
    doc.close();
  }

  openEnviar(): void {
    this.mensaje = this.mensajeDefault();
    this.enviarDialog = true;
  }

  /** Mensaje pre-armado con el resumen de la reserva (editable antes de enviar). */
  private mensajeDefault(): string {
    const r = this.reserva;
    if (!r) return '';
    const fmt = (iso?: string | null): string => (iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '');
    const m = this.moneda();
    const lines = [
      `Hola ${r.contacto.nombre},`,
      `Le compartimos su ${this.titulo().toLowerCase()} (${r.codigo})${this.hotel().nombre ? ` de ${this.hotel().nombre}` : ''}.`,
      `Ingreso: ${fmt(r.entradaAt)} · Salida: ${fmt(r.salidaAt)}`,
      `Total: ${m} ${(r.total ?? 0).toFixed(2)} · Pagado: ${m} ${(r.pagado ?? 0).toFixed(2)} · Saldo: ${m} ${(r.saldo ?? 0).toFixed(2)}`,
      r.condiciones?.venceTentativaAt ? `Cupo mantenido hasta ${fmt(r.condiciones.venceTentativaAt)}.` : '',
      'Adjuntamos el documento en PDF.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  destinatario(): string {
    const r = this.reserva;
    if (!r) return '';
    return this.canal === 'CORREO' ? r.contacto.email ?? '' : r.contacto.telefono ?? '';
  }

  /**
   * ETAPA 5 · envío por enlace (click-to-send): abre el WhatsApp/correo del usuario con el destinatario
   * y el mensaje listos. No es un envío automático: el usuario adjunta el PDF y envía desde su app.
   * Registra la intención en la bitácora (honesto: "enlace abierto", no entrega confirmada).
   */
  enviarAhora(): void {
    const r = this.reserva;
    if (!r) return;
    const to = this.destinatario().trim();
    if (!to) {
      this.messages.add({ severity: 'warn', summary: 'Sin destinatario', detail: this.canal === 'CORREO' ? 'El contacto no tiene correo registrado.' : 'El contacto no tiene teléfono registrado.' });
      return;
    }
    // Bitácora (best-effort; no bloquea el envío si falla).
    this.ops.reservationShare(r.id, { canal: this.canal, to, docTipo: this.tipo }).subscribe({ next: () => undefined, error: () => undefined });
    if (this.canal === 'WHATSAPP') {
      const phone = normalizeWaPhone(to);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(this.mensaje)}`, '_blank');
    } else {
      const subject = `${this.titulo()} · ${r.codigo}`;
      window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(this.mensaje)}`;
    }
    this.enviarDialog = false;
    this.messages.add({ severity: 'success', summary: `Abriendo ${this.canal === 'CORREO' ? 'correo' : 'WhatsApp'}`, detail: 'Adjunta el PDF descargado y envía desde la app. El intento quedó registrado en la bitácora.' });
  }
}
