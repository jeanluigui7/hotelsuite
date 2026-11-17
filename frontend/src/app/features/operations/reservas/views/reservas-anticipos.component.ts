import { Component, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ReservasStore } from '../reservas-store.service';
import type { Anticipo, Reserva } from '../reservas.model';

const PAY_METHODS = [
  { label: 'Efectivo', value: 'CASH' },
  { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' },
  { label: 'Billetera', value: 'WALLET' },
];
const uid = () => Math.random().toString(36).slice(2, 10);

@Component({
  selector: 'app-reservas-anticipos',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  templateUrl: './reservas-anticipos.component.html',
  styleUrls: ['../reservas.styles.scss', '../reservas-wizard.component.scss', '../reservas-detalle.component.scss'],
})
export class ReservasAnticiposComponent {
  readonly store = inject(ReservasStore);
  private readonly messages = inject(MessageService);
  readonly payMethods = PAY_METHODS;

  regDialog = false;
  regForm = { cliente: '', telefono: '', importe: 0, medio: 'CASH', destino: '', fecha: '', operacion: '', referencia: '', condiciones: '', observacion: '' };

  applyDialog = false;
  applyAnticipo: Anticipo | null = null;
  applyReservaId: string | null = null;
  applyImporte = 0;

  nowLocal(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  estadoLabel(e: Anticipo['estado']): string {
    return e === 'POR_APLICAR' ? 'Por aplicar' : e === 'PARCIAL' ? 'Parcialmente aplicado' : 'Aplicado';
  }

  openReg(): void {
    this.regForm = { cliente: '', telefono: '', importe: 0, medio: 'CASH', destino: '', fecha: this.nowLocal(), operacion: '', referencia: '', condiciones: '', observacion: '' };
    this.regDialog = true;
  }
  saveReg(): void {
    if (!this.regForm.cliente.trim() || this.regForm.importe <= 0) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Indica cliente e importe.' });
      return;
    }
    const n = this.store.anticipos().length + 1;
    const a: Anticipo = {
      id: 'an-' + uid(),
      codigo: `A-${String(n).padStart(4, '0')}`,
      cliente: this.regForm.cliente,
      telefono: this.regForm.telefono,
      fecha: new Date(this.regForm.fecha).toISOString(),
      recibido: this.regForm.importe,
      aplicado: 0,
      disponible: this.regForm.importe,
      estado: 'POR_APLICAR',
      origin: 'DEMO',
    };
    this.store.addDemoAnticipo(a);
    this.regDialog = false;
    this.messages.add({ severity: 'info', summary: 'Anticipo registrado', detail: 'Guardado en Demostración (no toca caja). No garantiza habitaciones ni fechas.' });
  }

  openApply(a: Anticipo): void {
    this.applyAnticipo = a;
    this.applyReservaId = null;
    this.applyImporte = 0;
    this.applyDialog = true;
  }
  reservaOpts(): Reserva[] {
    return this.store.reservas().filter((r) => r.estadoReserva !== 'CANCELADA');
  }
  selectedReserva(): Reserva | undefined {
    return this.store.reservas().find((r) => r.id === this.applyReservaId);
  }
  get restanteAnticipo(): number {
    return (this.applyAnticipo?.disponible ?? 0) - (this.applyImporte || 0);
  }
  get saldoResultanteReserva(): number {
    const r = this.selectedReserva();
    return (r?.saldo ?? 0) - (this.applyImporte || 0);
  }
  confirmApply(): void {
    const a = this.applyAnticipo;
    if (!a || !this.applyReservaId) { this.messages.add({ severity: 'warn', summary: 'Falta reserva', detail: 'Elige la reserva de destino.' }); return; }
    if (this.applyImporte <= 0) { this.messages.add({ severity: 'warn', summary: 'Importe inválido', detail: 'Indica cuánto aplicar.' }); return; }
    if (this.applyImporte > a.disponible) { this.messages.add({ severity: 'warn', summary: 'Anticipo insuficiente', detail: `Disponible S/ ${a.disponible.toFixed(2)}.` }); return; }
    this.store.applyDemoAnticipo(a.id, this.applyReservaId, this.applyImporte);
    this.applyDialog = false;
    this.messages.add({ severity: 'info', summary: 'Anticipo aplicado', detail: 'Aplicado a la reserva (no genera un segundo ingreso en caja).' });
  }
}
