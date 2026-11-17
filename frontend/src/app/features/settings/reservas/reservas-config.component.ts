import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';

type Section = 'horarios' | 'tentativas' | 'pagos' | 'cancelacion' | 'promociones' | 'politicas' | 'documentos';

interface Promo {
  id: string;
  nombre: string;
  tipo: 'FIJO' | 'PORCENTAJE' | 'TIEMPO';
  valor: number;
  desde: string;
  hasta: string;
  tarifas: string;
  condicionPago: string;
  compatible: boolean;
}
interface Policy {
  id: string;
  nombre: string;
  version: string;
  ambito: 'RESERVA' | 'ESTADIA';
  vigenciaDesde: string;
  vigenciaHasta: string;
  textoCliente: string;
  reglas: string;
}
interface ReservasConfig {
  horarios: { checkinHora: string; checkoutHora: string; preparacionMin: number; margenMin: number };
  tentativas: { vigenciaHoras: number; recordarHoras: number; autoVencer: boolean };
  pagos: { adelantoPct: number; plazoPagoHoras: number; permitirParcial: boolean; mediosPermitidos: string[] };
  cancelacion: { textoCancelacion: string; penalidadPct: number; ventanaSinPenalidadHoras: number; noShowPenalidadPct: number; textoNoShow: string };
  documentos: { mostrarLogo: boolean; formatoDefecto: 'A4' | 'TICKET'; textoLegal: string; pie: string };
  promociones: Promo[];
  politicas: Policy[];
}

const STORAGE_KEY = 'rizzos.reservas.config';
const uid = () => Math.random().toString(36).slice(2, 10);

function defaultConfig(): ReservasConfig {
  return {
    horarios: { checkinHora: '14:00', checkoutHora: '12:00', preparacionMin: 60, margenMin: 0 },
    tentativas: { vigenciaHoras: 24, recordarHoras: 3, autoVencer: false },
    pagos: { adelantoPct: 0, plazoPagoHoras: 48, permitirParcial: true, mediosPermitidos: ['CASH', 'CARD', 'TRANSFER'] },
    cancelacion: { textoCancelacion: '', penalidadPct: 0, ventanaSinPenalidadHoras: 24, noShowPenalidadPct: 0, textoNoShow: '' },
    documentos: { mostrarLogo: true, formatoDefecto: 'A4', textoLegal: '', pie: '' },
    promociones: [],
    politicas: [],
  };
}

@Component({
  selector: 'app-reservas-config',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, MultiSelectModule, ToggleSwitchModule, TagModule],
  templateUrl: './reservas-config.component.html',
  styleUrls: ['./reservas-config.component.scss'],
})
export class ReservasConfigComponent implements OnInit {
  private readonly messages = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly section = signal<Section>('horarios');
  cfg: ReservasConfig = defaultConfig();

  readonly canEdit = this.auth.can('settings', 'edit');

  readonly sections: { key: Section; label: string; icon: string }[] = [
    { key: 'horarios', label: 'Horarios y preparación', icon: 'pi pi-clock' },
    { key: 'tentativas', label: 'Tentativas y vencimientos', icon: 'pi pi-hourglass' },
    { key: 'pagos', label: 'Adelantos y pagos', icon: 'pi pi-wallet' },
    { key: 'cancelacion', label: 'Cancelaciones y no presentación', icon: 'pi pi-times-circle' },
    { key: 'promociones', label: 'Promociones', icon: 'pi pi-percentage' },
    { key: 'politicas', label: 'Políticas', icon: 'pi pi-book' },
    { key: 'documentos', label: 'Documentos', icon: 'pi pi-file' },
  ];

  readonly medioOpts = [
    { label: 'Efectivo', value: 'CASH' },
    { label: 'Tarjeta', value: 'CARD' },
    { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Billetera', value: 'WALLET' },
  ];
  readonly formatoOpts = [
    { label: 'A4', value: 'A4' },
    { label: 'Ticket 80 mm', value: 'TICKET' },
  ];
  readonly tipoPromoOpts = [
    { label: 'Descuento fijo', value: 'FIJO' },
    { label: 'Descuento porcentual', value: 'PORCENTAJE' },
    { label: 'Tiempo adicional', value: 'TIEMPO' },
  ];
  readonly ambitoOpts = [
    { label: 'Reserva', value: 'RESERVA' },
    { label: 'Estadía', value: 'ESTADIA' },
  ];

  // Editores
  promoDialog = false;
  promoForm: Promo = this.emptyPromo();
  policyDialog = false;
  policyForm: Policy = this.emptyPolicy();
  policyPreview = false;

  ngOnInit(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.cfg = { ...defaultConfig(), ...JSON.parse(raw) };
    } catch {
      /* draft local no disponible */
    }
  }

  emptyPromo(): Promo {
    return { id: uid(), nombre: '', tipo: 'PORCENTAJE', valor: 0, desde: '', hasta: '', tarifas: '', condicionPago: '', compatible: false };
  }
  emptyPolicy(): Policy {
    return { id: uid(), nombre: '', version: 'v1', ambito: 'RESERVA', vigenciaDesde: '', vigenciaHasta: '', textoCliente: '', reglas: '' };
  }

  // Promociones
  openPromo(p?: Promo): void {
    this.promoForm = p ? { ...p } : this.emptyPromo();
    this.promoDialog = true;
  }
  savePromo(): void {
    if (!this.promoForm.nombre.trim()) { this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Indica el nombre de la promoción.' }); return; }
    const i = this.cfg.promociones.findIndex((x) => x.id === this.promoForm.id);
    if (i >= 0) this.cfg.promociones[i] = { ...this.promoForm };
    else this.cfg.promociones = [...this.cfg.promociones, { ...this.promoForm }];
    this.promoDialog = false;
  }
  removePromo(p: Promo): void {
    this.cfg.promociones = this.cfg.promociones.filter((x) => x.id !== p.id);
  }

  // Políticas
  openPolicy(p?: Policy): void {
    this.policyForm = p ? { ...p } : this.emptyPolicy();
    this.policyDialog = true;
  }
  savePolicy(): void {
    if (!this.policyForm.nombre.trim()) { this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Indica el nombre de la política.' }); return; }
    const i = this.cfg.politicas.findIndex((x) => x.id === this.policyForm.id);
    if (i >= 0) this.cfg.politicas[i] = { ...this.policyForm };
    else this.cfg.politicas = [...this.cfg.politicas, { ...this.policyForm }];
    this.policyDialog = false;
  }
  removePolicy(p: Policy): void {
    this.cfg.politicas = this.cfg.politicas.filter((x) => x.id !== p.id);
  }

  guardar(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cfg));
      this.messages.add({ severity: 'success', summary: 'Borrador guardado', detail: 'Guardado como borrador local. La persistencia en el sistema y la activación de reglas se conectan en una etapa posterior.' });
    } catch {
      this.messages.add({ severity: 'warn', summary: 'No se pudo guardar', detail: 'El almacenamiento local no está disponible en este navegador.' });
    }
  }
}
