import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MenuModule } from 'primeng/menu';
import type { MenuItem } from 'primeng/api';
import { ReservasStore } from '../reservas-store.service';
import {
  ASIGNACION_META,
  ORIGEN_LABEL,
  PAGO_ESTADO_META,
  RESERVA_ESTADO_META,
  habitacionesResumen,
  type Reserva,
  type ReservaEstado,
} from '../reservas.model';

export interface ReservaAction {
  type: 'ver' | 'documentos' | 'pago' | 'modificar' | 'confirmar' | 'checkin' | 'cancelar' | 'noshow';
  reserva: Reserva;
}

@Component({
  selector: 'app-reservas-lista',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, InputTextModule, SelectModule, TableModule, TagModule, MenuModule],
  template: `
    <div class="rv-toolbar">
      <input pInputText placeholder="Nombre, documento, teléfono o código…" [(ngModel)]="search" />
      <p-select [options]="estadoOpts" optionLabel="label" optionValue="value" [(ngModel)]="estadoF" placeholder="Estado reserva" [showClear]="true" />
      <p-select [options]="pagoOpts" optionLabel="label" optionValue="value" [(ngModel)]="pagoF" placeholder="Estado pago" [showClear]="true" />
      <p-select [options]="origenOpts" optionLabel="label" optionValue="value" [(ngModel)]="origenF" placeholder="Origen" [showClear]="true" />
      <p-select [options]="asignOpts" optionLabel="label" optionValue="value" [(ngModel)]="asignF" placeholder="Asignación" [showClear]="true" />
    </div>

    @if (filtered().length === 0) {
      <div class="rv-empty">
        <i class="pi pi-calendar-times"></i>
        <p>No hay reservas que coincidan con los filtros.</p>
      </div>
    } @else {
      <p-table [value]="filtered()" [paginator]="filtered().length > 12" [rows]="12" styleClass="p-datatable-sm" [scrollable]="true">
        <ng-template pTemplate="header">
          <tr>
            <th>Código / Cliente</th>
            <th>Entrada</th>
            <th>Salida</th>
            <th>Habitaciones</th>
            <th>Reserva</th>
            <th>Pago</th>
            <th class="center">Saldo</th>
            <th>Origen</th>
            <th style="width:3rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr style="cursor:pointer" (click)="emit('ver', r)">
            <td>
              <span class="code">{{ r.codigo }}</span>
              @if (r.origin === 'DEMO') { <span class="demo-chip">DEMO</span> }
              <div>{{ r.contacto.nombre }}</div>
              @if (r.contacto.telefono) { <div class="muted small">{{ r.contacto.telefono }}</div> }
            </td>
            <td>{{ r.entradaAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td>{{ r.salidaAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td>
              {{ resumen(r).total }} hab · {{ resumen(r).tipos }}
              <div class="muted small">
                <p-tag [value]="asign(r).label" [severity]="asign(r).severity" styleClass="mini" />
                @if (resumen(r).total > 1) { · {{ resumen(r).asignadas }}/{{ resumen(r).total }} asignadas }
              </div>
            </td>
            <td><p-tag [value]="estado(r).label" [severity]="estado(r).severity" /></td>
            <td><p-tag [value]="pago(r).label" [severity]="pago(r).severity" /></td>
            <td class="center">
              @if (r.saldo === null) {
                <span class="pend-pill"><i class="pi pi-link"></i>—</span>
              } @else {
                <span [class.muted]="r.saldo === 0">S/ {{ r.saldo | number: '1.2-2' }}</span>
              }
            </td>
            <td class="muted small">{{ origen(r.origen) }}</td>
            <td (click)="$event.stopPropagation()">
              <p-button icon="pi pi-ellipsis-v" [text]="true" size="small" (onClick)="openMenu($event, r, menu)" />
            </td>
          </tr>
        </ng-template>
      </p-table>
      <p-menu #menu [popup]="true" [model]="menuItems()" appendTo="body" />
    }
  `,
  styles: [
    `
      :host ::ng-deep .mini .p-tag { font-size: 0.68rem; padding: 0.05rem 0.3rem; }
    `,
  ],
  styleUrls: ['../reservas.styles.scss'],
})
export class ReservasListaComponent {
  private readonly store = inject(ReservasStore);
  @Output() action = new EventEmitter<ReservaAction>();

  search = '';
  estadoF: ReservaEstado | null = null;
  pagoF: string | null = null;
  origenF: string | null = null;
  asignF: string | null = null;

  private readonly current = signal<Reserva | null>(null);

  readonly estadoOpts = (Object.keys(RESERVA_ESTADO_META) as ReservaEstado[]).map((v) => ({ label: RESERVA_ESTADO_META[v].label, value: v }));
  readonly pagoOpts = ['SIN_PAGO', 'PARCIAL', 'PAGADO'].map((v) => ({ label: PAGO_ESTADO_META[v as 'SIN_PAGO'].label, value: v }));
  readonly asignOpts = Object.keys(ASIGNACION_META).map((v) => ({ label: ASIGNACION_META[v as 'SIN_ASIGNAR'].label, value: v }));
  readonly origenOpts = Object.entries(ORIGEN_LABEL).map(([value, label]) => ({ label, value }));

  readonly filtered = computed<Reserva[]>(() => {
    const q = this.search.trim().toLowerCase();
    return this.store.reservas().filter((r) => {
      if (this.estadoF && r.estadoReserva !== this.estadoF) return false;
      if (this.pagoF && r.estadoPago !== this.pagoF) return false;
      if (this.origenF && r.origen !== this.origenF) return false;
      if (this.asignF && r.estadoAsignacion !== this.asignF) return false;
      if (q) {
        const hay = [r.codigo, r.contacto.nombre, r.contacto.telefono, r.contacto.documentNumber].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  resumen = habitacionesResumen;
  estado = (r: Reserva) => RESERVA_ESTADO_META[r.estadoReserva];
  pago = (r: Reserva) => PAGO_ESTADO_META[r.estadoPago];
  asign = (r: Reserva) => ASIGNACION_META[r.estadoAsignacion];
  origen = (o: Reserva['origen']) => ORIGEN_LABEL[o];

  emit(type: ReservaAction['type'], reserva: Reserva): void {
    this.action.emit({ type, reserva });
  }

  openMenu(event: Event, r: Reserva, menu: { toggle: (e: Event) => void }): void {
    this.current.set(r);
    menu.toggle(event);
  }

  menuItems(): MenuItem[] {
    const r = this.current();
    if (!r) return [];
    const items: MenuItem[] = [
      { label: 'Ver reserva', icon: 'pi pi-eye', command: () => this.emit('ver', r) },
      { label: 'Documentos', icon: 'pi pi-file', command: () => this.emit('documentos', r) },
      { label: 'Registrar pago', icon: 'pi pi-wallet', command: () => this.emit('pago', r) },
      { label: 'Modificar', icon: 'pi pi-pencil', command: () => this.emit('modificar', r) },
      { separator: true },
    ];
    if (r.estadoReserva === 'TENTATIVA') items.push({ label: 'Confirmar tentativa', icon: 'pi pi-check-circle', command: () => this.emit('confirmar', r) });
    if (r.estadoReserva === 'CONFIRMADA') items.push({ label: 'Preparar check-in', icon: 'pi pi-sign-in', command: () => this.emit('checkin', r) });
    if (r.estadoReserva === 'TENTATIVA' || r.estadoReserva === 'CONFIRMADA') {
      items.push({ label: 'Cancelar reserva', icon: 'pi pi-times-circle', command: () => this.emit('cancelar', r) });
      items.push({ label: 'Registrar no presentación', icon: 'pi pi-user-minus', command: () => this.emit('noshow', r) });
    }
    return items;
  }
}
