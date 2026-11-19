import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
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
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

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
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly section = signal<Section>('horarios');
  readonly saving = signal(false);
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
    this.load();
  }

  /** Carga la config real de la sucursal; si falla, cae a un borrador local previo (si lo hubiera). */
  private load(): void {
    this.http.get<ApiResponse<ReservasConfig>>(`${this.api}/reservations-config`).subscribe({
      next: (res) => { if (res.data) this.cfg = { ...defaultConfig(), ...res.data }; },
      error: () => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) this.cfg = { ...defaultConfig(), ...JSON.parse(raw) };
        } catch {
          /* draft local no disponible */
        }
      },
    });
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
    if (!this.canEdit) return;
    this.saving.set(true);
    this.http.put<ApiResponse<ReservasConfig>>(`${this.api}/reservations-config`, this.cfg).subscribe({
      next: (res) => {
        if (res.data) this.cfg = { ...defaultConfig(), ...res.data };
        this.saving.set(false);
        // Respaldo local best-effort (por si se quiere recuperar sin conexión).
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cfg)); } catch { /* ignore */ }
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Configuración de reservas actualizada. Las nuevas reservas tomarán estos valores por defecto.' });
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'No se pudo guardar', detail: e.error?.error?.message ?? 'Error al guardar la configuración.' });
      },
    });
  }
}
