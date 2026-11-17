import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { ReservasStore } from './reservas-store.service';
import { ReservasListaComponent, type ReservaAction } from './views/reservas-lista.component';
import { ReservasCalendarioComponent } from './views/reservas-calendario.component';
import {
  ASIGNACION_META,
  MODALIDAD_LABEL,
  ORIGEN_LABEL,
  PAGO_ESTADO_META,
  RESERVA_ESTADO_META,
  habitacionesResumen,
  type Reserva,
} from './reservas.model';

type Vista = 'calendario' | 'lista' | 'proformas' | 'anticipos';

@Component({
  selector: 'app-reservas-shell',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    ReservasListaComponent,
    ReservasCalendarioComponent,
  ],
  template: `
    <section>
      <header class="rv-head">
        <div>
          <h1>Reservas</h1>
          <p class="muted">Gestiona reservas sin iniciar la estadía. Reservar no equivale a ocupar; cobrar no equivale a check-in.</p>
        </div>
        <div class="actions">
          <div class="demo-toggle">
            <p-toggleswitch [(ngModel)]="demo" (onChange)="toggleDemo()" inputId="demoSw" />
            <label for="demoSw" class="small muted">Modo demostración</label>
          </div>
          @if (canCreate) {
            <p-button label="Nueva proforma" icon="pi pi-file-edit" severity="secondary" (onClick)="nueva('proforma')" />
            <p-button label="Nueva reserva" icon="pi pi-plus" (onClick)="nueva('reserva')" />
          }
          <p-button label="Configuración" icon="pi pi-cog" severity="secondary" [text]="true" (onClick)="goConfig()" />
        </div>
      </header>

      @if (store.isDemo()) {
        <div class="rv-demo-banner">
          <i class="pi pi-exclamation-triangle"></i>
          <span><strong>Modo demostración.</strong> Datos de ejemplo aislados (sello DEMO). Nada se guarda ni mueve caja. Desactívalo para ver las reservas reales.</span>
        </div>
      }

      <div class="rv-cards">
        @for (ind of store.indicadores(); track ind.key) {
          <div class="rv-card">
            <div class="lbl">{{ ind.label }}</div>
            @if (ind.pendiente) {
              <div class="val">—</div>
              <span class="pend" [title]="ind.hint"><i class="pi pi-link"></i> Pendiente de conexión</span>
            } @else {
              <div class="val">{{ ind.value }}</div>
            }
          </div>
        }
      </div>

      <nav class="rv-tabs">
        <button class="rv-tab" [class.active]="vista() === 'calendario'" (click)="setVista('calendario')"><i class="pi pi-calendar"></i> Calendario</button>
        <button class="rv-tab" [class.active]="vista() === 'lista'" (click)="setVista('lista')"><i class="pi pi-list"></i> Lista</button>
        <button class="rv-tab" [class.active]="vista() === 'proformas'" (click)="setVista('proformas')"><i class="pi pi-file"></i> Proformas</button>
        <button class="rv-tab" [class.active]="vista() === 'anticipos'" (click)="setVista('anticipos')"><i class="pi pi-wallet"></i> Anticipos</button>
      </nav>

      @switch (vista()) {
        @case ('calendario') {
          <app-reservas-calendario [escalaInput]="escala()" (escalaChange)="onEscala($event)" (select)="openDetail($event)" />
        }
        @case ('lista') {
          <app-reservas-lista (action)="onAction($event)" />
        }
        @case ('proformas') {
          @if (store.proformas().length === 0) {
            <div class="rv-empty"><i class="pi pi-file"></i><p>Sin proformas.{{ store.isDemo() ? '' : ' Las proformas se conectan en una tanda posterior.' }}</p></div>
          } @else {
            <p-table [value]="store.proformas()" styleClass="p-datatable-sm">
              <ng-template pTemplate="header"><tr><th>Código</th><th>Cliente</th><th>Fecha</th><th>Validez</th><th>Hab.</th><th>Total</th><th>Estado</th><th></th></tr></ng-template>
              <ng-template pTemplate="body" let-p>
                <tr>
                  <td><span class="code">{{ p.codigo }}</span> <span class="demo-chip">DEMO</span></td>
                  <td>{{ p.cliente }}</td>
                  <td>{{ p.fecha | date: 'dd/MM/yy' }}</td>
                  <td>{{ p.validezAt | date: 'dd/MM/yy' }}</td>
                  <td>{{ p.habitaciones }}</td>
                  <td>S/ {{ p.total | number: '1.2-2' }}</td>
                  <td><p-tag [value]="p.estado" [severity]="p.estado === 'VIGENTE' ? 'success' : p.estado === 'CONVERTIDA' ? 'secondary' : 'danger'" /></td>
                  <td><p-button label="Crear reserva" size="small" [text]="true" (onClick)="pendiente('Convertir proforma')" /></td>
                </tr>
              </ng-template>
            </p-table>
          }
        }
        @case ('anticipos') {
          @if (store.anticipos().length === 0) {
            <div class="rv-empty"><i class="pi pi-wallet"></i><p>Sin anticipos.{{ store.isDemo() ? '' : ' Los anticipos se conectan en una tanda posterior.' }}</p></div>
          } @else {
            <p-table [value]="store.anticipos()" styleClass="p-datatable-sm">
              <ng-template pTemplate="header"><tr><th>Código</th><th>Cliente</th><th>Fecha</th><th>Recibido</th><th>Aplicado</th><th>Disponible</th><th>Estado</th><th></th></tr></ng-template>
              <ng-template pTemplate="body" let-a>
                <tr>
                  <td><span class="code">{{ a.codigo }}</span> <span class="demo-chip">DEMO</span></td>
                  <td>{{ a.cliente }}<div class="muted small">{{ a.telefono }}</div></td>
                  <td>{{ a.fecha | date: 'dd/MM/yy' }}</td>
                  <td>S/ {{ a.recibido | number: '1.2-2' }}</td>
                  <td>S/ {{ a.aplicado | number: '1.2-2' }}</td>
                  <td>S/ {{ a.disponible | number: '1.2-2' }}</td>
                  <td><p-tag [value]="a.estado === 'POR_APLICAR' ? 'Por aplicar' : a.estado === 'PARCIAL' ? 'Parcial' : 'Aplicado'" [severity]="a.estado === 'APLICADO' ? 'secondary' : 'info'" /></td>
                  <td><p-button label="Aplicar" size="small" [text]="true" (onClick)="pendiente('Aplicar anticipo')" /></td>
                </tr>
              </ng-template>
            </p-table>
          }
        }
      }
    </section>

    <!-- Resumen rápido de la reserva (el detalle completo con pestañas llega en la siguiente tanda) -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" position="right" [style]="{ width: '440px', height: '100%' }" [header]="selected()?.codigo ?? 'Reserva'">
      @if (selected(); as r) {
        <div class="detail">
          @if (r.origin === 'DEMO') { <span class="demo-chip">DEMO</span> }
          <div class="tags">
            <p-tag [value]="estadoMeta[r.estadoReserva].label" [severity]="estadoMeta[r.estadoReserva].severity" />
            <p-tag [value]="pagoMeta[r.estadoPago].label" [severity]="pagoMeta[r.estadoPago].severity" />
            <p-tag [value]="asignMeta[r.estadoAsignacion].label" [severity]="asignMeta[r.estadoAsignacion].severity" />
          </div>
          <h3>{{ r.contacto.nombre }}</h3>
          <p class="muted small">{{ r.contacto.telefono }} · {{ origenLabel[r.origen] }} · {{ modalidadLabel[r.modalidad] }}</p>
          <div class="kv"><span>Entrada</span><b>{{ r.entradaAt | date: 'dd/MM/yy HH:mm' }}</b></div>
          <div class="kv"><span>Salida</span><b>{{ r.salidaAt | date: 'dd/MM/yy HH:mm' }}</b></div>
          <div class="kv"><span>Habitaciones</span><b>{{ resumen(r).total }} · {{ resumen(r).tipos }}</b></div>

          <h4>Habitaciones</h4>
          @for (h of r.habitaciones; track h.uid) {
            <div class="room">
              <b>{{ h.roomTypeName }}</b> — {{ h.roomNumber ? ('Hab. ' + h.roomNumber) : 'Por asignar' }}
              @if (h.requisitos.length) { <div class="muted small">Obligatorio: {{ h.requisitos.join(', ') }}</div> }
              @if (h.preferencias.length) { <div class="muted small">Preferencia: {{ h.preferencias.join(', ') }}</div> }
            </div>
          }

          <h4>Importes</h4>
          @if (r.total === null) {
            <p class="pend-pill"><i class="pi pi-link"></i> Pagos y saldo pendientes de conexión.</p>
          } @else {
            <div class="kv"><span>Total</span><b>S/ {{ r.total | number: '1.2-2' }}</b></div>
            <div class="kv"><span>Pagado</span><b>S/ {{ r.pagado | number: '1.2-2' }}</b></div>
            <div class="kv"><span>Saldo</span><b>S/ {{ r.saldo | number: '1.2-2' }}</b></div>
          }

          <p class="muted small note"><i class="pi pi-info-circle"></i> El detalle completo (pestañas Resumen/Habitaciones/Pagos/Documentos/Historial) llega en la siguiente tanda.</p>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="detailVisible = false" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .demo-toggle { display: inline-flex; align-items: center; gap: 0.4rem; margin-right: 0.3rem; }
      .detail .tags { display: flex; gap: 0.3rem; flex-wrap: wrap; margin: 0.4rem 0; }
      .detail h3 { margin: 0.5rem 0 0; }
      .detail h4 { margin: 1rem 0 0.4rem; font-size: 0.9rem; color: var(--p-text-muted-color, #94a3b8); }
      .detail .kv { display: flex; justify-content: space-between; padding: 0.2rem 0; border-bottom: 1px dashed var(--p-content-border-color, #334155); font-size: 0.88rem; }
      .detail .room { padding: 0.35rem 0; border-bottom: 1px solid var(--p-content-border-color, #334155); font-size: 0.86rem; }
      .detail .note { margin-top: 1rem; display: flex; gap: 0.35rem; }
    `,
  ],
  styleUrls: ['./reservas.styles.scss'],
})
export class ReservasShellComponent implements OnInit {
  readonly store = inject(ReservasStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly vista = signal<Vista>('calendario');
  readonly escala = signal<'mes' | 'semana' | 'dia'>('mes');
  readonly selected = signal<Reserva | null>(null);
  detailVisible = false;
  demo = false;

  readonly canCreate = this.auth.can('operations', 'create');

  readonly estadoMeta = RESERVA_ESTADO_META;
  readonly pagoMeta = PAGO_ESTADO_META;
  readonly asignMeta = ASIGNACION_META;
  readonly origenLabel = ORIGEN_LABEL;
  readonly modalidadLabel = MODALIDAD_LABEL;
  resumen = habitacionesResumen;

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((q) => {
      const v = q.get('vista') as Vista | null;
      if (v && ['calendario', 'lista', 'proformas', 'anticipos'].includes(v)) this.vista.set(v);
      const e = q.get('escala') as 'mes' | 'semana' | 'dia' | null;
      if (e && ['mes', 'semana', 'dia'].includes(e)) this.escala.set(e);
    });
    this.store.load();
  }

  setVista(v: Vista): void {
    this.vista.set(v);
    this.router.navigate([], { relativeTo: this.route, queryParams: { vista: v }, queryParamsHandling: 'merge' });
  }
  onEscala(e: 'mes' | 'semana' | 'dia'): void {
    this.escala.set(e);
    this.router.navigate([], { relativeTo: this.route, queryParams: { escala: e }, queryParamsHandling: 'merge' });
  }

  toggleDemo(): void {
    this.store.setSource(this.demo ? 'DEMO' : 'REAL');
  }

  openDetail(r: Reserva): void {
    this.selected.set(r);
    this.detailVisible = true;
  }

  onAction(a: ReservaAction): void {
    if (a.type === 'ver') { this.openDetail(a.reserva); return; }
    if (a.type === 'modificar') { this.router.navigate(['/operations/reservas', a.reserva.id, 'editar']); return; }
    const labels: Record<ReservaAction['type'], string> = {
      ver: 'Ver', documentos: 'Documentos', pago: 'Registrar pago', modificar: 'Modificar',
      confirmar: 'Confirmar tentativa', checkin: 'Preparar check-in', cancelar: 'Cancelar reserva', noshow: 'No presentación',
    };
    this.pendiente(labels[a.type]);
  }

  nueva(k: 'reserva' | 'proforma'): void {
    if (k === 'reserva') { this.router.navigate(['/operations/reservas/nueva']); return; }
    this.pendiente('Nueva proforma (asistente)');
  }
  goConfig(): void {
    this.pendiente('Configuración de reservas');
  }

  /** Mensaje honesto: la acción aún no está conectada (no simula éxito). */
  pendiente(nombre: string): void {
    this.messages.add({ severity: 'info', summary: 'Pendiente de conexión', detail: `${nombre} llega en una tanda posterior de la ETAPA 1.`, life: 3500 });
  }
}
