import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { OperationsApiService } from '../services/operations-api.service';
import type { ActiveStay, CheckoutSummary, RoomMapItem } from '../services/operations.models';
import { CheckInDialogComponent } from '../habitaciones/check-in-dialog.component';
import { VentaProductosComponent } from './venta-productos.component';
import { ServiciosPenalidadesComponent } from './servicios-penalidades.component';
import { FolioEstanciaComponent } from './folio-estancia.component';
import { roomState } from './room-states';
import type { RoomStatus } from '../services/operations.models';

type ViewMode = 'normal' | 'compacta' | 'real';

@Component({
  selector: 'app-habitaciones-board',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, SelectModule, InputTextModule, TooltipModule, DialogModule, CheckInDialogComponent, VentaProductosComponent, ServiciosPenalidadesComponent, FolioEstanciaComponent],
  template: `
    <section class="board">
      <header class="top">
        <div class="title-row">
          <h1>Habitaciones</h1>
          <div class="views">
            <button [class.active]="view() === 'normal'" (click)="view.set('normal')"><i class="pi pi-th-large"></i> Normal</button>
            <button [class.active]="view() === 'compacta'" (click)="view.set('compacta')"><i class="pi pi-bars"></i> Compacta</button>
            <button [class.active]="view() === 'real'" (click)="view.set('real')"><i class="pi pi-image"></i> Real</button>
          </div>
          <div class="actions">
            <button class="act" (click)="vehiculosVisible = true"><i class="pi pi-car"></i> Vehículos</button>
            <button class="act" (click)="checkInHint()"><i class="pi pi-sign-in"></i> Check-in</button>
            <button class="act" (click)="ventaVisible = true"><i class="pi pi-shopping-cart"></i> Venta Productos</button>
            <button class="act primary" (click)="serviciosVisible = true"><i class="pi pi-tags"></i> Servicios y Penalidades</button>
          </div>
        </div>

        <div class="filters">
          <span class="f"><i class="pi pi-search"></i><input pInputText placeholder="Buscar por número…" [(ngModel)]="search" /></span>
          <p-select [options]="floorOptions()" [(ngModel)]="floorFilter" placeholder="Todos los pisos" [showClear]="true" styleClass="dk" />
          <p-select [options]="stateOptions" [(ngModel)]="stateFilter" optionLabel="label" optionValue="value" placeholder="Todos los estados" [showClear]="true" styleClass="dk" />
          <p-select [options]="typeOptions()" [(ngModel)]="typeFilter" placeholder="Todos los tipos" [showClear]="true" styleClass="dk" />
          <button class="refresh" (click)="reload()" pTooltip="Actualizar"><i class="pi pi-refresh"></i></button>
        </div>
      </header>

      <div class="grid" [class.compacta]="view() === 'compacta'" [class.real]="view() === 'real'">
        @for (r of filtered(); track r.id) {
          @if (r.status === 'OCCUPIED' && r.activeStay) {
            <!-- Tarjeta de habitación ocupada / pernoctando -->
            <article class="ocard" [class.exp]="isExpired(r.activeStay)">
              <div class="oc-head">
                <span class="oc-num"># {{ r.number }} <span class="oc-tag">{{ isPernocta(r.activeStay) ? '🌙 PERNOCTANDO' : 'HOSPEDAJE' }}</span></span>
                <span class="oc-piso"><i class="pi pi-building"></i> {{ r.floor || '-' }}º piso</span>
              </div>
              <div class="oc-badges">
                <span class="ob type">{{ r.roomType.name }}</span>
                <span class="ob occ">● Ocupada</span>
              </div>
              <div class="oc-timer">
                <span class="t" [class.red]="isExpired(r.activeStay)"><i class="pi pi-clock"></i> {{ remainingLabel(r.activeStay) }}</span>
                @if (isExpired(r.activeStay)) { <span class="exp-badge">Tiempo Expirado</span> }
                <span class="spacer"></span>
                <button class="mini" (click)="renew(r)" [disabled]="busyStay() === r.activeStay.id"><i class="pi pi-refresh"></i> Renovar</button>
                <button class="mini" (click)="ticket(r)"><i class="pi pi-dollar"></i> Ticket</button>
                <button class="mini" (click)="openChange(r)"><i class="pi pi-arrow-right-arrow-left"></i> Cambiar</button>
              </div>
              <div class="oc-guest">
                <div class="g-top"><span class="g-name">{{ r.activeStay.guestName }}</span><span class="g-count"><i class="pi pi-users"></i> {{ r.activeStay.guestCount || 1 }}</span></div>
                <div class="g-meta"><span><i class="pi pi-id-card"></i> {{ r.activeStay.documentNumber || '—' }}</span><span><i class="pi pi-phone"></i> {{ r.activeStay.phone || '—' }}</span></div>
                <div class="g-dates">
                  <div><span>Entrada</span><strong>{{ r.activeStay.checkInAt | date: 'dd/MM HH:mm' }}</strong></div>
                  <div><span>Salida</span><strong>{{ r.activeStay.plannedCheckoutAt | date: 'dd/MM HH:mm' }}</strong></div>
                </div>
              </div>
              <div class="oc-money">
                <span class="chip room"><i class="pi pi-home"></i> S/ {{ +r.activeStay.priceAgreed | number: '1.2-2' }}</span>
                <span class="chip cons"><i class="pi pi-shopping-bag"></i> S/ {{ (r.activeStay.consumosTotal || 0) | number: '1.2-2' }}</span>
                @if ((r.activeStay.pending || 0) > 0) { <span class="chip debe">Debe S/ {{ r.activeStay.pending || 0 | number: '1.2-2' }}</span> }
                @if (r.activeStay.vehiclePlate) { <span class="chip plate"><i class="pi pi-car"></i> {{ r.activeStay.vehiclePlate }}</span> }
                <button class="chip total clickable" (click)="openFolio(r)" pTooltip="Ver folio de estancia"><i class="pi pi-search"></i> Total S/ {{ stayTotal(r.activeStay) | number: '1.2-2' }}</button>
              </div>
              <div class="oc-foot">
                <button class="cta out" (click)="confirmCheckout(r)"><i class="pi pi-sign-out"></i> Pre Checkout</button>
                <button class="cta out ghost2" (click)="openFolio(r)"><i class="pi pi-pencil"></i> Editar</button>
              </div>
            </article>
          } @else {
            <article class="card" [style.background]="st(r).gradient">
              <div class="card-head">
                <span class="num"># {{ r.number }}</span>
                <span class="piso"><i class="pi pi-building"></i> {{ r.floor || '-' }}° piso</span>
              </div>
              <div class="type">{{ r.roomType.name }}</div>
              <div class="state"><i [class]="st(r).icon"></i> {{ st(r).label }}</div>
              <div class="body"><div class="caption">{{ st(r).caption }}</div></div>
              <div class="foot">
                @if (r.status === 'FREE') {
                  <div class="foot-row">
                    <button class="cta" (click)="openCheckIn(r)"><i class="pi pi-sign-in"></i> Check-in</button>
                    <button class="cta ghost sm" (click)="openEstado(r)" pTooltip="Cambiar estado"><i class="pi pi-pencil"></i></button>
                  </div>
                } @else {
                  <button class="cta ghost" (click)="openEstado(r)"><i class="pi pi-pencil"></i> Editar</button>
                }
              </div>
            </article>
          }
        } @empty {
          <p class="muted empty">No hay habitaciones que coincidan con el filtro.</p>
        }
      </div>
    </section>

    <app-check-in-dialog [(visible)]="checkInVisible" [room]="selectedRoom" (done)="reload()" />
    <app-venta-productos [(visible)]="ventaVisible" (done)="reload()" />
    <app-servicios-penalidades [(visible)]="serviciosVisible" (done)="reload()" />

    <p-dialog [(visible)]="checkoutVisible" [modal]="true" [header]="'Check-out · Hab. ' + (checkoutRoom?.number || '')" [style]="{ width: '28rem' }" styleClass="dk-dialog">
      @if (checkoutData(); as d) {
        @if (d.totalWithLate > 0) {
          <div class="co-pend">
            <h3><i class="pi pi-exclamation-triangle"></i> Pagos Pendientes</h3>
            <p>La habitación tiene pagos pendientes por un total de <strong class="amt">S/ {{ d.totalWithLate | number: '1.2-2' }}</strong>.</p>
          </div>
        }
        <div class="co-guest">
          <span class="lbl">Detalles del huésped</span>
          <strong>{{ checkoutRoom?.activeStay?.guestName }}</strong>
          @if (checkoutRoom?.activeStay?.vehiclePlate) { <span class="muted">Placa: {{ checkoutRoom?.activeStay?.vehiclePlate }}</span> }
        </div>
        @if (d.lateCharge > 0) {
          <div class="co-late"><i class="pi pi-clock"></i> Late check-out: {{ d.lateHours }}h = {{ d.lateCharge | number: '1.2-2' }} (se agrega al adeudo)</div>
        }
        <div class="co-kv"><span>Recargos (early/late)</span><strong>{{ d.balanceDue + d.lateCharge | number: '1.2-2' }}</strong></div>
        <div class="co-kv"><span>Consumos sin pagar</span><strong>{{ d.salesPending | number: '1.2-2' }}</strong></div>
        <div class="co-kv total" [class.debt]="d.totalWithLate > 0"><span>Total pendiente</span><strong>{{ d.totalWithLate | number: '1.2-2' }}</strong></div>
        @if (d.totalWithLate > 0) {
          <div class="co-opts">
            <strong>Opciones:</strong>
            <p><b>Procesar Pago:</b> abre la caja para registrar el pago.</p>
            <p><b>Continuar Checkout:</b> el monto pendiente se registra como deuda del cliente.</p>
          </div>
        }
      } @else {
        <p class="muted">Calculando…</p>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="checkoutVisible = false" />
        @if ((checkoutData()?.totalWithLate || 0) > 0) {
          <p-button label="Procesar Pago" icon="pi pi-wallet" severity="secondary" (onClick)="goProcesarPago()" />
        }
        <p-button label="Continuar Checkout" icon="pi pi-sign-out" [loading]="checkingOut()" (onClick)="doCheckout()" />
      </ng-template>
    </p-dialog>

    <p-dialog [(visible)]="vehiculosVisible" [modal]="true" header="Vehículos en estancia" [style]="{ width: '32rem' }" styleClass="dk-dialog">
      @if (vehiculos().length) {
        <table class="veh">
          <thead><tr><th>Placa</th><th>Hab.</th><th>Huésped</th><th>Salida</th></tr></thead>
          <tbody>
            @for (v of vehiculos(); track v.plate + v.room) {
              <tr><td class="pl">{{ v.plate }}</td><td>{{ v.room }}</td><td>{{ v.guest }}</td><td class="muted">{{ v.out | date: 'dd/MM HH:mm' }}</td></tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="muted">No hay vehículos registrados en estancias activas.</p>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="vehiculosVisible = false" /></ng-template>
    </p-dialog>

    <p-dialog [(visible)]="changeVisible" [modal]="true" [header]="'Cambiar habitación · ' + (changeRoom?.number || '')" [style]="{ width: '26rem' }" styleClass="dk-dialog">
      <div class="ch-form">
        <label>Habitación de destino</label>
        <p-select [options]="freeRooms()" [(ngModel)]="destRoomId" optionValue="id" [filter]="true" filterBy="number" placeholder="Selecciona habitación disponible" styleClass="w">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }} · {{ r.roomType.name }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }} · {{ r.roomType.name }}</ng-template>
        </p-select>
        <label>¿Cómo debe quedar la habitación {{ changeRoom?.number }} (origen)?</label>
        <div class="ch-opts">
          <label class="radio"><input type="radio" name="os" value="CLEANING" [(ngModel)]="originStatus" /> Sucia para limpieza</label>
          <label class="radio"><input type="radio" name="os" value="FREE" [(ngModel)]="originStatus" /> Disponible</label>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="changeVisible = false" />
        <p-button label="Confirmar Cambio" icon="pi pi-arrow-right-arrow-left" [disabled]="!destRoomId" [loading]="changing()" (onClick)="doChange()" />
      </ng-template>
    </p-dialog>

    <!-- Cambiar estado de habitación (Editar) -->
    <p-dialog [(visible)]="estadoVisible" [modal]="true" [header]="'Cambiar Estado · Hab. ' + (estadoRoom?.number || '')" [style]="{ width: '24rem' }" styleClass="dk-dialog">
      <p class="muted" style="margin:0 0 0.6rem">Selecciona el nuevo estado para la habitación.</p>
      <div class="est-opts">
        <button [class.on]="estadoValue === 'FREE'" (click)="estadoValue = 'FREE'"><i class="pi pi-check-circle"></i> Disponible</button>
        <button [class.on]="estadoValue === 'CLEANING'" (click)="estadoValue = 'CLEANING'"><i class="pi pi-sparkles"></i> Limpieza</button>
        <button [class.on]="estadoValue === 'MAINTENANCE'" (click)="estadoValue = 'MAINTENANCE'"><i class="pi pi-wrench"></i> Mantenimiento</button>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="estadoVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="savingEstado()" (onClick)="saveEstado()" />
      </ng-template>
    </p-dialog>

    <app-folio-estancia [(visible)]="folioVisible" [stayId]="folioStayId" />
  `,
  styles: [
    `
      :host { display: block; }
      .board { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; font-size: 1.7rem; color: #fff; }
      .top { margin-bottom: 1.25rem; }
      .title-row { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; justify-content: space-between; }
      .views { display: inline-flex; background: #131b27; border: 1px solid #1f2a3a; border-radius: 10px; padding: 3px; gap: 2px; }
      .views button { background: transparent; border: 0; color: #9fb0c3; padding: 0.45rem 0.85rem; border-radius: 8px; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .views button.active { background: #0f9b6c; color: #fff; }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .act { background: #131b27; border: 1px solid #243245; color: #cdd8e6; border-radius: 10px; padding: 0.55rem 0.95rem; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.45rem; }
      .act:hover { border-color: #10b981; }
      .act.primary { background: #7c2d4d; border-color: #b03a68; color: #ffd9e7; }
      .filters { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 1rem; }
      .f { position: relative; display: inline-flex; align-items: center; }
      .f i { position: absolute; left: 0.7rem; color: #6b7a90; }
      .f input { background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.55rem 0.7rem 0.55rem 2rem; width: 240px; }
      :host ::ng-deep .dk .p-select { background: #131b27; border-color: #243245; }
      :host ::ng-deep .dk .p-select-label { color: #cdd8e6; }
      .refresh { background: #131b27; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.55rem 0.7rem; cursor: pointer; }

      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.1rem; }
      .grid.compacta { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
      .grid.real { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
      .card { border-radius: 16px; padding: 1.1rem; color: #fff; display: flex; flex-direction: column; gap: 0.5rem; min-height: 200px; box-shadow: 0 8px 22px rgba(0,0,0,0.35); }
      .grid.compacta .card { min-height: 150px; padding: 0.85rem; gap: 0.35rem; }
      .grid.real .card { min-height: 260px; }
      .card-head { display: flex; align-items: center; justify-content: space-between; }
      .num { font-size: 1.25rem; font-weight: 800; }
      .piso { font-size: 0.78rem; background: rgba(0,0,0,0.25); padding: 0.2rem 0.6rem; border-radius: 999px; }
      .type { font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; opacity: 0.95; text-transform: uppercase; }
      .state { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; background: rgba(0,0,0,0.22); width: fit-content; padding: 0.25rem 0.7rem; border-radius: 999px; }
      .body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 0.2rem; text-align: center; }
      .grid.compacta .body { display: none; }
      .caption { opacity: 0.85; font-size: 0.9rem; }
      .guest { font-weight: 700; }
      .cap { font-size: 0.8rem; }
      .debe { margin-top: 0.3rem; background: rgba(0,0,0,0.3); color: #fde68a; border: 1px solid rgba(251,191,36,0.5); padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; }
      .muted { opacity: 0.8; }
      .foot { margin-top: auto; }
      .cta { width: 100%; background: rgba(255,255,255,0.92); color: #0b1018; border: 0; border-radius: 10px; padding: 0.6rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; justify-content: center; }
      .cta.ghost { background: rgba(0,0,0,0.28); color: #fff; }
      .cta:disabled { opacity: 0.6; cursor: default; }
      .foot-row { display: flex; gap: 0.4rem; }
      .foot-row .cta { flex: 1; }
      .cta.sm { flex: 0 0 auto; width: auto; padding: 0.6rem 0.7rem; }
      .ch-form { display: flex; flex-direction: column; gap: 0.4rem; }
      .ch-form label { font-size: 0.82rem; color: #9fb0c3; margin-top: 0.3rem; }
      :host ::ng-deep .ch-form .w .p-select { width: 100%; }
      .ch-opts { display: flex; flex-direction: column; gap: 0.4rem; }
      .ch-opts .radio { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; cursor: pointer; }
      .empty { grid-column: 1/-1; text-align: center; padding: 2rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      .co-pend { background: #2a1410; border: 1px solid #7f1d1d; border-radius: 10px; padding: 0.8rem 0.9rem; margin-bottom: 0.8rem; }
      .co-pend h3 { margin: 0 0 0.3rem; color: #fca5a5; font-size: 1rem; display: flex; align-items: center; gap: 0.4rem; }
      .co-pend p { margin: 0; font-size: 0.85rem; color: #e6e9ef; } .co-pend .amt { color: #f87171; }
      .co-guest { display: flex; flex-direction: column; gap: 0.15rem; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.7rem; }
      .co-guest .lbl { font-size: 0.72rem; color: #8b97a8; text-transform: uppercase; letter-spacing: 0.04em; }
      .co-opts { background: #2a1d12; border: 1px solid #6b4f2a; border-radius: 8px; padding: 0.6rem 0.8rem; margin-top: 0.7rem; font-size: 0.78rem; color: #fcd9a8; }
      .co-opts p { margin: 0.2rem 0 0; } .co-opts b { color: #fbbf24; }
      .co-late { background: #2a1d12; border: 1px solid #6b4f2a; color: #fbbf24; padding: 0.5rem 0.7rem; border-radius: 8px; font-size: 0.82rem; margin-bottom: 0.6rem; }
      .co-kv { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.95rem; }
      .co-kv.total { border-top: 1px solid #243245; margin-top: 0.4rem; padding-top: 0.55rem; }
      .co-kv.total.debt strong { color: #fbbf24; }
      .co-warn { color: #fbbf24; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; }
      .plate { background: rgba(0,0,0,0.28); border-radius: 999px; padding: 0.15rem 0.6rem; width: fit-content; margin: 0.15rem auto 0; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; }
      .veh { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .veh th, .veh td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #1f2a3a; }
      .veh th { color: #9fb0c3; font-weight: 600; }
      .veh .pl { font-weight: 700; color: #34d399; }

      /* Tarjeta de habitación ocupada / pernoctando */
      .ocard { border-radius: 16px; padding: 1rem; color: #eaf0ff; display: flex; flex-direction: column; gap: 0.7rem;
        background: linear-gradient(160deg, #1e3a8a 0%, #1e40af 55%, #2563eb 100%); border: 2px solid transparent; box-shadow: 0 8px 22px rgba(0,0,0,0.35); }
      .grid.real .ocard { grid-column: span 1; }
      .ocard.exp { border-color: #ef4444; }
      .oc-head { display: flex; align-items: center; justify-content: space-between; }
      .oc-num { font-size: 1.3rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.5rem; }
      .oc-tag { font-size: 0.72rem; font-weight: 800; color: #fbbf24; background: rgba(0,0,0,0.25); padding: 0.15rem 0.55rem; border-radius: 999px; }
      .oc-piso { font-size: 0.75rem; background: rgba(0,0,0,0.28); padding: 0.2rem 0.6rem; border-radius: 999px; }
      .oc-badges { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .ob { font-size: 0.72rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 999px; background: rgba(0,0,0,0.25); }
      .ob.type { background: rgba(124,58,237,0.55); }
      .oc-timer { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; background: rgba(0,0,0,0.22); border-radius: 10px; padding: 0.5rem 0.7rem; }
      .oc-timer .t { font-weight: 800; font-size: 1rem; display: inline-flex; align-items: center; gap: 0.35rem; } .oc-timer .t.red { color: #fca5a5; }
      .exp-badge { background: #dc2626; color: #fff; font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 6px; }
      .oc-timer .spacer { flex: 1; }
      .mini { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); color: #eaf0ff; border-radius: 8px; padding: 0.3rem 0.55rem; cursor: pointer; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 0.3rem; }
      .mini:hover:not(:disabled) { background: rgba(0,0,0,0.45); } .mini:disabled { opacity: 0.5; }
      .oc-guest { background: rgba(0,0,0,0.2); border-radius: 12px; padding: 0.8rem; }
      .g-top { display: flex; align-items: center; justify-content: space-between; }
      .g-name { font-size: 1.05rem; font-weight: 800; }
      .g-count { background: rgba(124,58,237,0.6); border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.75rem; font-weight: 700; }
      .g-meta { display: flex; gap: 1rem; font-size: 0.8rem; opacity: 0.9; margin-top: 0.3rem; flex-wrap: wrap; }
      .g-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.6rem; }
      .g-dates > div { background: rgba(0,0,0,0.25); border-radius: 8px; padding: 0.45rem 0.6rem; }
      .g-dates span { font-size: 0.68rem; opacity: 0.75; display: block; } .g-dates strong { font-size: 0.85rem; }
      .oc-money { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
      .chip { font-size: 0.78rem; font-weight: 700; padding: 0.3rem 0.6rem; border-radius: 8px; background: rgba(0,0,0,0.28); display: inline-flex; align-items: center; gap: 0.3rem; }
      .chip.cons { color: #6ee7b7; } .chip.debe { background: rgba(251,191,36,0.2); color: #fde68a; border: 1px solid rgba(251,191,36,0.5); }
      .chip.total { margin-left: auto; background: rgba(0,0,0,0.4); }
      .oc-foot { display: flex; gap: 0.5rem; }
      .oc-foot .cta.out { flex: 1; background: rgba(255,255,255,0.92); color: #0b1018; border: 0; border-radius: 10px; padding: 0.65rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }
      .oc-foot .cta.out.ghost2 { flex: 0 0 auto; background: rgba(0,0,0,0.3); color: #fff; }
      .chip.total.clickable { cursor: pointer; border: 0; }
      .chip.total.clickable:hover { background: rgba(0,0,0,0.55); }
      .est-opts { display: flex; flex-direction: column; gap: 0.5rem; }
      .est-opts button { display: flex; align-items: center; gap: 0.5rem; background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 10px; padding: 0.7rem 0.9rem; cursor: pointer; font-size: 0.9rem; }
      .est-opts button.on { border-color: #10b981; color: #34d399; }
    `,
  ],
})
export class HabitacionesBoardComponent implements OnInit, OnDestroy {
  private readonly ops = inject(OperationsApiService);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);
  private readonly printing = inject(PrintingService);
  private readonly auth = inject(AuthService);
  readonly nowTick = signal(Date.now());
  readonly busyStay = signal<string | null>(null);
  private clock?: ReturnType<typeof setInterval>;

  readonly rooms = signal<RoomMapItem[]>([]);
  readonly view = signal<ViewMode>('normal');
  search = '';
  floorFilter: string | null = null;
  stateFilter: string | null = null;
  typeFilter: string | null = null;

  checkInVisible = false;
  ventaVisible = false;
  serviciosVisible = false;
  checkoutVisible = false;
  vehiculosVisible = false;
  readonly checkingOut = signal(false);
  checkoutRoom: RoomMapItem | null = null;
  readonly checkoutData = signal<CheckoutSummary | null>(null);
  selectedRoom: RoomMapItem | null = null;
  changeVisible = false;
  changeRoom: RoomMapItem | null = null;
  destRoomId: string | null = null;
  originStatus: 'CLEANING' | 'FREE' = 'CLEANING';
  readonly changing = signal(false);
  folioVisible = false;
  folioStayId: string | null = null;
  estadoVisible = false;
  estadoRoom: RoomMapItem | null = null;
  estadoValue: RoomStatus = 'FREE';
  readonly savingEstado = signal(false);
  private timer?: ReturnType<typeof setInterval>;

  readonly stateOptions = [
    { label: 'Disponible', value: 'FREE' },
    { label: 'Ocupada', value: 'OCCUPIED' },
    { label: 'Limpieza en espera', value: 'CLEANING' },
    { label: 'Mantenimiento', value: 'MAINTENANCE' },
  ];

  readonly floorOptions = computed(() =>
    [...new Set(this.rooms().map((r) => r.floor).filter((f): f is string => !!f))].sort(),
  );
  readonly typeOptions = computed(() => [...new Set(this.rooms().map((r) => r.roomType.name))].sort());
  readonly freeRooms = computed(() => this.rooms().filter((r) => r.status === 'FREE'));

  readonly vehiculos = computed(() =>
    this.rooms()
      .filter((r) => r.activeStay?.vehiclePlate)
      .map((r) => ({
        plate: r.activeStay!.vehiclePlate as string,
        room: r.number,
        guest: r.activeStay!.guestName,
        out: r.activeStay!.plannedCheckoutAt,
      })),
  );

  // Método (no computed) para que reaccione a los filtros con ngModel (props no-signal).
  filtered(): RoomMapItem[] {
    let list = this.rooms();
    if (this.search) list = list.filter((r) => r.number.toLowerCase().includes(this.search.toLowerCase()));
    if (this.floorFilter) list = list.filter((r) => r.floor === this.floorFilter);
    if (this.stateFilter) list = list.filter((r) => r.status === this.stateFilter);
    if (this.typeFilter) list = list.filter((r) => r.roomType.name === this.typeFilter);
    return list;
  }

  ngOnInit(): void {
    this.reload();
    this.timer = setInterval(() => this.reload(), 15_000);
    this.clock = setInterval(() => this.nowTick.set(Date.now()), 1000);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.clock) clearInterval(this.clock);
  }

  st(r: RoomMapItem) {
    return roomState(r.status);
  }

  // --- Tarjeta de habitación ocupada ---
  isPernocta(s: ActiveStay): boolean {
    return (s.durationMinutes ?? 0) >= 1440;
  }
  isExpired(s: ActiveStay): boolean {
    return new Date(s.plannedCheckoutAt).getTime() - this.nowTick() < 0;
  }
  remainingLabel(s: ActiveStay): string {
    const ms = new Date(s.plannedCheckoutAt).getTime() - this.nowTick();
    const neg = ms < 0;
    const t = Math.abs(ms);
    const h = Math.floor(t / 3_600_000);
    const m = Math.floor((t % 3_600_000) / 60_000);
    const sec = Math.floor((t % 60_000) / 1000);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${neg ? '-' : ''}${p(h)}:${p(m)}:${p(sec)}`;
  }
  stayTotal(s: ActiveStay): number {
    return Math.round((Number(s.priceAgreed) + (s.consumosTotal ?? 0)) * 100) / 100;
  }

  renew(r: RoomMapItem): void {
    if (!r.activeStay) return;
    this.busyStay.set(r.activeStay.id);
    this.ops.renew(r.activeStay.id).subscribe({
      next: () => { this.busyStay.set(null); this.toast.add({ severity: 'success', summary: 'Renovado', detail: `Hab. ${r.number}: pernocta extendida.` }); this.reload(); },
      error: (err) => { this.busyStay.set(null); this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo renovar' }); },
    });
  }

  openFolio(r: RoomMapItem): void {
    if (!r.activeStay) return;
    this.folioStayId = r.activeStay.id;
    this.folioVisible = true;
  }

  openEstado(r: RoomMapItem): void {
    this.estadoRoom = r;
    this.estadoValue = (r.status === 'OCCUPIED' ? 'CLEANING' : (r.status as RoomStatus)) ?? 'FREE';
    this.estadoVisible = true;
  }

  saveEstado(): void {
    const r = this.estadoRoom;
    if (!r) return;
    this.savingEstado.set(true);
    this.ops.changeRoomStatus(r.id, this.estadoValue).subscribe({
      next: () => { this.savingEstado.set(false); this.estadoVisible = false; this.toast.add({ severity: 'success', summary: 'Estado actualizado', detail: `Hab. ${r.number}` }); this.reload(); },
      error: (err) => { this.savingEstado.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo cambiar el estado' }); },
    });
  }

  ticket(r: RoomMapItem): void {
    const s = r.activeStay;
    if (!s) return;
    const branch = this.auth.activeBranch()?.name ?? 'RIZZOS';
    const fmt = (n: number): string => n.toFixed(2);
    const html = `
      <div style="font-family:monospace;width:280px">
        <h3 style="text-align:center;margin:0 0 4px">${branch}</h3>
        <div style="text-align:center;font-size:12px">Ticket de estancia</div><hr>
        <div>Hab.: ${r.number} (${r.roomType.name})</div>
        <div>Huésped: ${s.guestName}</div>
        <div>Doc: ${s.documentNumber ?? '—'}</div>
        <div>Entrada: ${new Date(s.checkInAt).toLocaleString('es-PE')}</div>
        <div>Salida: ${new Date(s.plannedCheckoutAt).toLocaleString('es-PE')}</div><hr>
        <div>Habitación: S/ ${fmt(Number(s.priceAgreed))}</div>
        <div>Consumos: S/ ${fmt(s.consumosTotal ?? 0)}</div>
        ${(s.pending ?? 0) > 0 ? `<div>Pendiente: S/ ${fmt(s.pending ?? 0)}</div>` : ''}
        <div style="font-weight:bold">TOTAL: S/ ${fmt(this.stayTotal(s))}</div><hr>
        <div style="text-align:center;font-size:11px">¡Gracias por su preferencia!</div>
      </div>`;
    this.printing.printViaBrowser(html);
  }

  reload(): void {
    this.ops.map().subscribe((res) => this.rooms.set(res.data ?? []));
  }

  openCheckIn(r: RoomMapItem): void {
    this.selectedRoom = r;
    this.checkInVisible = true;
  }

  checkInHint(): void {
    this.toast.add({ severity: 'info', summary: 'Check-in', detail: 'Pulsa "Check-in" en una habitación disponible (verde).' });
  }

  goProcesarPago(): void {
    this.checkoutVisible = false;
    void this.router.navigateByUrl('/operations/caja');
  }

  openChange(r: RoomMapItem): void {
    if (!r.activeStay) return;
    this.changeRoom = r;
    this.destRoomId = null;
    this.originStatus = 'CLEANING';
    this.changeVisible = true;
  }

  doChange(): void {
    const r = this.changeRoom;
    if (!r?.activeStay || !this.destRoomId) return;
    this.changing.set(true);
    this.ops.changeRoom(r.activeStay.id, this.destRoomId, this.originStatus).subscribe({
      next: () => {
        this.changing.set(false);
        this.changeVisible = false;
        this.toast.add({ severity: 'success', summary: 'Cambio realizado', detail: `Hab. ${r.number} → cambio de habitación` });
        this.reload();
      },
      error: (err) => {
        this.changing.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo cambiar' });
      },
    });
  }

  confirmCheckout(r: RoomMapItem): void {
    if (!r.activeStay) return;
    this.checkoutRoom = r;
    this.checkoutData.set(null);
    this.checkoutVisible = true;
    this.ops.checkoutSummary(r.activeStay.id).subscribe((res) => this.checkoutData.set(res.data));
  }

  doCheckout(): void {
    const r = this.checkoutRoom;
    if (!r?.activeStay) return;
    this.checkingOut.set(true);
    this.ops.checkOut(r.activeStay.id, 'CLEANING').subscribe({
      next: () => {
        this.checkingOut.set(false);
        this.checkoutVisible = false;
        this.toast.add({ severity: 'success', summary: 'Check-out', detail: `Habitación ${r.number} → Limpieza en espera` });
        this.reload();
      },
      error: (err) => {
        this.checkingOut.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo cerrar' });
      },
    });
  }
}
