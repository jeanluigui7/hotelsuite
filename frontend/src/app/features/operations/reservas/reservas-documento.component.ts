import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { habitacionesResumen, type Reserva } from './reservas.model';

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

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() reserva: Reserva | null = null;
  /** TENTATIVA = "Constancia de reserva tentativa"; CONFIRMACION = "Confirmación de reserva". */
  @Input() tipo: 'TENTATIVA' | 'CONFIRMACION' = 'TENTATIVA';
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

  descargarPdf(): void {
    this.messages.add({ severity: 'info', summary: 'Vista previa de diseño', detail: 'La generación de PDF oficial se habilita en la etapa 4. Por ahora puedes imprimir la vista.' });
  }

  imprimir(): void {
    const el = this.sheet?.nativeElement;
    if (!el) return;
    const w = window.open('', '_blank', 'width=820,height=1100');
    if (!w) {
      this.messages.add({ severity: 'warn', summary: 'Bloqueado', detail: 'Permite las ventanas emergentes para imprimir.' });
      return;
    }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${this.reserva?.codigo ?? 'Documento'}</title>
      <style>
        body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#1a1a1a;margin:24px;}
        .doc-sheet{max-width:720px;margin:0 auto;}
        h1,h2,h3{margin:.2rem 0;}
        table{width:100%;border-collapse:collapse;margin:.5rem 0;}
        td,th{padding:.3rem .4rem;border-bottom:1px solid #ddd;text-align:left;font-size:13px;}
        .muted{color:#666;} .right{text-align:right;} .hr{border-top:2px solid #111;margin:.6rem 0;}
        .badge{display:inline-block;border:1px solid #999;border-radius:6px;padding:2px 8px;font-size:12px;}
      </style></head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  }

  openEnviar(): void {
    const r = this.reserva;
    this.mensaje = r ? `Hola ${r.contacto.nombre}, adjuntamos su ${this.titulo().toLowerCase()} (${r.codigo}).` : '';
    this.enviarDialog = true;
  }
  destinatario(): string {
    const r = this.reserva;
    if (!r) return '';
    return this.canal === 'CORREO' ? r.contacto.email ?? '' : r.contacto.telefono ?? '';
  }
  // El envío real no está integrado: canal no conectado (no cambia estado ni simula envío).
}
