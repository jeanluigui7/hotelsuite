import { Component, EventEmitter, Input, OnDestroy, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { docLabel, natLabel } from '../services/operations.models';

interface Folio {
  folio: { code: string; status: string };
  guest: { name: string; documentType?: string | null; documentNumber?: string | null; nationality?: string | null; phone?: string | null };
  room: { number: string; typeName: string };
  checkInAt: string; plannedCheckoutAt: string; durationMinutes: number; renewals: number;
  amounts: { habitacion: number; renovaciones: number; consumos: number; total: number; paid: number };
  cleaning: { done: number; allowed: number; possible: number; status: string; pernocta: boolean };
  cleaningLog: { at: string; action: string; by: string }[];
  movements: { at: string; type: string; description: string; method?: string; charge: number; payment: number; balance: number; by: string }[];
  products: { name: string; quantity: number; amount: number; at: string; paid: boolean }[];
  simulator: { hospedaje: number; productos: number; ratio: number; limit: number; exceeded: boolean; exceso: number; igvAdicional: number; suggested: number };
  frigobar?: {
    enabled: boolean;
    status: 'NO_APLICA' | 'SIN_REVISAR' | 'REVISADO' | 'CONSUMO_REGISTRADO' | 'PAGADO';
    reviewId?: string; reviewedBy?: string | null; reviewedAt?: string; repositionPending?: boolean;
    lines?: { name: string; quantity: number; amount: number }[]; consumido?: number; pagado?: number; pendiente?: number;
  };
}
interface ReviewLine { productId: string; name: string; imageUrl?: string | null; location: 'FRIGOBAR' | 'BANDEJA'; expectedQty: number; unitPrice: number; consumo: number; }
type Tab = 'resumen' | 'folio' | 'historial' | 'operacion';
interface AuditEvent { at: string; user: string; activity: string | null; area: string | null; reference: string | null; detail: string | null; shift: string | null; }
/** Etiquetas legibles de eventos para la Auditoría. */
const ACT_LABEL: Record<string, string> = {
  CHECK_IN: 'Registró el check-in', CHECK_OUT: 'Registró el check-out', RENEWAL: 'Registró una renovación',
  DEBT_PAYMENT: 'Registró un cobro', ROOM_CHANGE: 'Cambió de habitación',
  SALE: 'Registró una venta', SALE_VOID: 'Anuló una venta', SALE_CORRECTION: 'Corrigió una venta', FRIGOBAR: 'Registró consumo de frigobar',
  CLEANING: 'Limpieza', INSPECTION: 'Inspección de limpieza',
  CASH_IN: 'Ingreso de caja', CASH_OUT: 'Egreso de caja',
};
const AREA_ORIGIN: Record<string, string> = { HOSPEDAJE: 'Recepción', VENTAS: 'Recepción', CAJA: 'Recepción', LIMPIEZA: 'Housekeeping', INVENTARIO: 'Housekeeping' };
interface HistDay { key: string; label: string; renovaciones: { charge: number }[]; limpiezas: { action: string }[]; productos: { name: string; quantity: number; amount: number }[]; productosTotal: number; }

@Component({
  selector: 'app-folio-estancia',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, DialogModule, ButtonModule, InputNumberModule, SelectModule],
  template: `
    <p-dialog [visible]="visible" (visibleChange)="onVis($event)" [modal]="true" [style]="{ width: '96vw', maxWidth: '1400px', height: '94vh' }" [showHeader]="false" styleClass="fl-dialog" (onShow)="load()">
      @if (data(); as f) {
        <div class="fl">
          <header class="fl-head">
            <div class="fl-id"><span class="ico"><i class="pi pi-file"></i></span>
              <div><div class="ttl">Folio de Estancia <span class="rm">Habitación {{ f.room.number }}</span> · {{ f.guest.name }}</div>
                <div class="sub">Folio <strong>#{{ f.folio.code }}</strong> · Habitación {{ f.room.number }}</div></div>
            </div>
            <div class="fl-right"><span class="badge" [class.act]="f.folio.status === 'Activa'">● {{ f.folio.status }}</span>
              <button class="x" (click)="onVis(false)"><i class="pi pi-times"></i></button></div>
          </header>

          <div class="tabs">
            <button [class.on]="tab() === 'resumen'" (click)="tab.set('resumen')"><i class="pi pi-eye"></i> Resumen</button>
            <button [class.on]="tab() === 'folio'" (click)="tab.set('folio')"><i class="pi pi-chart-line"></i> Folio</button>
            <button [class.on]="tab() === 'historial'" (click)="tab.set('historial')"><i class="pi pi-list"></i> Historial</button>
            <button [class.on]="tab() === 'operacion'" (click)="tab.set('operacion')"><i class="pi pi-clock"></i> Auditoría</button>
          </div>

          <div class="fl-body">
            <!-- RESUMEN -->
            @if (tab() === 'resumen') {
              <div class="grid2">
                <div class="panel">
                  <h4><i class="pi pi-user"></i> HUÉSPED PRINCIPAL</h4>
                  <div class="g-name">{{ f.guest.name }}</div>
                  <div class="g-meta"><span><i class="pi pi-id-card"></i> {{ docLabel(f.guest.documentType, f.guest.documentNumber) }}</span><span><i class="pi pi-phone"></i> {{ f.guest.phone || '—' }}</span></div>
                  <div class="g-meta"><span><i class="pi pi-flag"></i> {{ natLabel(f.guest.documentType, f.guest.nationality) }}</span><span><i class="pi pi-users"></i> 1 / 3 personas</span></div>
                  <div class="bill"><div class="bh"><span>DATOS DE FACTURACIÓN</span></div>
                    <div>Nombre: {{ f.guest.name }}</div><div>{{ docLabel(f.guest.documentType, f.guest.documentNumber) }}</div><div>Nacionalidad: {{ natLabel(f.guest.documentType, f.guest.nationality) }}</div><div>Dir: Sin registrar</div></div>
                </div>
                <div class="panel">
                  <h4><i class="pi pi-calendar"></i> FECHAS Y TIEMPO</h4>
                  <div class="chips">
                    <span class="rchip"><i class="pi pi-refresh"></i> Renovación</span>
                    @if (f.renewals > 0) { <span class="rchip"><i class="pi pi-refresh"></i> {{ f.renewals }} renovación(es) previas</span> }
                  </div>
                  @if (showCleaning(f)) {
                    <div class="clean-box">
                      <div><i class="pi pi-bolt"></i> LIMPIEZA PROGRAMADA<br><small>Progreso: {{ f.cleaning.done }}/{{ f.cleaning.possible }}<span class="cl-av" [class.on]="f.cleaning.allowed > f.cleaning.done"> · {{ f.cleaning.allowed > f.cleaning.done ? (f.cleaning.allowed - f.cleaning.done) + ' disponible(s) hoy' : 'ninguna disponible aún' }}</span></small></div>
                      @if (f.cleaning.status === 'SOLICITADA') {
                        <span class="cl-badge sol"><i class="pi pi-clock"></i> Limpieza solicitada</span>
                      } @else if (f.cleaning.status === 'EN_CURSO') {
                        <span class="cl-badge cur"><i class="pi pi-spin pi-spinner"></i> Limpieza en curso</span>
                      } @else if (canRequestCleaning(f)) {
                        <button class="cl-btn" [disabled]="busy()" (click)="requestCleaning()"><i class="pi pi-send"></i> Solicitar limpieza</button>
                      }
                    </div>
                  }
                  <div class="dates2">
                    <div><span>CHECK-IN</span><strong>{{ f.checkInAt | date: 'dd/MM/yyyy, hh:mm a' }}</strong></div>
                    <div><span>CHECK-OUT PROGRAMADO</span><strong>{{ f.plannedCheckoutAt | date: 'dd/MM/yyyy, hh:mm a' }}</strong></div>
                  </div>
                  <div class="timer" [class.exp]="expired()"><i class="pi pi-clock"></i> {{ expired() ? 'TIEMPO EXPIRADO' : 'TIEMPO RESTANTE' }} <strong>{{ remaining() }}</strong></div>
                  <div class="dur"><i class="pi pi-hourglass"></i> Duración: {{ durationLabel(f.durationMinutes) }} (en curso)</div>
                </div>
              </div>

              <div class="money3">
                <div class="mc"><span class="l"><i class="pi pi-home"></i> HABITACIÓN</span><span class="v">S/ {{ f.amounts.habitacion | number: '1.2-2' }}</span><span class="s">{{ f.room.typeName }}</span></div>
                <div class="mc"><span class="l"><i class="pi pi-refresh"></i> RENOVACIONES</span><span class="v">S/ {{ f.amounts.renovaciones | number: '1.2-2' }}</span><span class="s">{{ f.renewals }} período(s)</span></div>
                <div class="mc"><span class="l"><i class="pi pi-shopping-bag"></i> CONSUMOS</span><span class="v">S/ {{ f.amounts.consumos | number: '1.2-2' }}</span><span class="s">{{ f.products.length }} ítem(s)</span></div>
              </div>
              @if (f.frigobar?.enabled) {
                <div class="fb-sec" [class.cons]="f.frigobar!.status === 'CONSUMO_REGISTRADO'">
                  <div class="fb-h"><span class="fb-t"><i class="pi pi-inbox"></i> FRIGOBAR</span>
                    @switch (f.frigobar!.status) {
                      @case ('CONSUMO_REGISTRADO') { <span class="fb-badge cons">CONSUMO REGISTRADO</span> }
                      @case ('PAGADO') { <span class="fb-badge pay">PAGADO</span> }
                      @case ('REVISADO') { <span class="fb-badge rev">REVISADO</span> }
                      @default { <span class="fb-badge sr">SIN REVISAR</span> }
                    }
                    @if (f.frigobar!.repositionPending) { <span class="fb-repo"><i class="pi pi-exclamation-triangle"></i> Reposición pendiente</span> }
                  </div>
                  @switch (f.frigobar!.status) {
                    @case ('SIN_REVISAR') {
                      <div class="fb-body"><span class="fb-st">Estado: <b>SIN REVISAR</b></span>
                        <button class="fb-btn blue" [disabled]="busy()" (click)="openReview()"><i class="pi pi-search"></i> Revisar frigobar</button></div>
                    }
                    @case ('REVISADO') {
                      <div class="fb-body"><div><span class="fb-st">Estado: <b>REVISADO</b> · Sin productos consumidos</span><small>Revisado por: {{ f.frigobar!.reviewedBy || '—' }} · {{ f.frigobar!.reviewedAt | date: 'dd/MM/yyyy hh:mm a' }}</small></div>
                        @if (f.frigobar!.repositionPending) { <button class="fb-btn ghost" [disabled]="busy()" (click)="reponer(f.frigobar!.reviewId)"><i class="pi pi-refresh"></i> Reponer</button> }</div>
                    }
                    @case ('CONSUMO_REGISTRADO') {
                      <div class="fb-cons">
                        <div class="fb-lines">@for (l of f.frigobar!.lines; track $index) { <div class="fb-l"><span>{{ l.name }} ×{{ l.quantity }}</span><span class="fb-la">S/ {{ l.amount | number: '1.2-2' }}</span></div> }</div>
                        <div class="fb-r"><div class="fb-pend"><span>TOTAL PENDIENTE</span><strong>S/ {{ f.frigobar!.pendiente | number: '1.2-2' }}</strong></div>
                          <button class="fb-btn green" [disabled]="busy()" (click)="openCobro(f.frigobar!.pendiente || 0)"><i class="pi pi-credit-card"></i> Cobrar S/ {{ f.frigobar!.pendiente | number: '1.2-2' }}</button></div>
                      </div>
                      @if (f.frigobar!.repositionPending) { <button class="fb-btn ghost sm" [disabled]="busy()" (click)="reponer(f.frigobar!.reviewId)"><i class="pi pi-refresh"></i> Reponer frigobar</button> }
                    }
                    @case ('PAGADO') {
                      <div class="fb-body"><div><span class="fb-st">Estado: <b>PAGADO</b></span><small>Consumo: S/ {{ f.frigobar!.consumido | number: '1.2-2' }} · Saldo: S/ 0.00</small></div>
                        @if (f.frigobar!.repositionPending) { <button class="fb-btn ghost" [disabled]="busy()" (click)="reponer(f.frigobar!.reviewId)"><i class="pi pi-refresh"></i> Reponer</button> }</div>
                    }
                  }
                </div>
              }

              <div class="total-row"><span><i class="pi pi-dollar"></i> TOTAL DE ESTADÍA</span><div class="tr-r"><span class="big">S/ {{ f.amounts.total | number: '1.2-2' }}</span><small>Pagado: S/ {{ f.amounts.paid | number: '1.2-2' }}</small></div></div>

              <div class="sim" [class.bad]="f.simulator.exceeded">
                <h4><i class="pi pi-chart-line"></i> Simulador Límite Productos vs Hospedaje</h4>
                <div class="sim-cols"><div class="sc"><span>Hospedaje</span><strong>S/ {{ f.simulator.hospedaje | number: '1.2-2' }}</strong></div>
                  <div class="sc"><span>Productos</span><strong>S/ {{ f.simulator.productos | number: '1.2-2' }}</strong></div></div>
                <div class="ratio-row"><span>Ratio actual</span><span class="rb" [class.bad]="f.simulator.exceeded">{{ f.simulator.ratio }}% (Límite: {{ f.simulator.limit }}%)</span></div>
                <div class="bar"><div class="fill" [style.width.%]="barWidth(f.simulator.ratio)" [class.bad]="f.simulator.exceeded"></div><div class="mark" [style.left.%]="f.simulator.limit"></div></div>
                @if (f.simulator.exceeded) {
                  <div class="sim-warn"><strong><i class="pi pi-exclamation-circle"></i> Límite excedido</strong>
                    <div class="sw-row"><span>$ Exceso: <b>S/ {{ f.simulator.exceso | number: '1.2-2' }}</b></span><span>% IGV adicional: <b>S/ {{ f.simulator.igvAdicional | number: '1.2-2' }}</b></span></div>
                    <div class="sw-hint">💡 Para estar en {{ f.simulator.limit }}%, hospedaje debería ser: S/ {{ f.simulator.suggested | number: '1.2-2' }}</div></div>
                }
              </div>
              <div class="alerts"><span class="al-t">ALERTAS</span>
                <div>Limpiezas: <strong>{{ f.cleaning.done }} / {{ f.cleaning.possible }}</strong> <small class="muted2">(programadas por noches)</small></div>
                <div class="al-y">• {{ f.cleaning.allowed > f.cleaning.done ? (f.cleaning.allowed - f.cleaning.done) + ' disponible(s) hoy' : (f.cleaning.done < f.cleaning.possible ? 'Se habilitan al llegar al checkout de cada noche' : 'Sin limpiezas pendientes') }}</div>
              </div>
            }

            <!-- FOLIO -->
            @if (tab() === 'folio') {
              <div class="tablewrap">
                <table class="ftbl"><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th class="num">+Cargo</th><th class="num">-Pago</th><th class="num">Saldo</th><th>Responsable</th></tr></thead>
                  <tbody>
                    @for (m of f.movements; track $index) {
                      <tr><td class="muted">{{ m.at | date: 'dd/MM/yyyy hh:mm a' }}</td>
                        <td><span class="mtag" [class.pay]="m.type === 'Pago'">{{ m.type }}</span></td>
                        <td>{{ m.description }}</td>
                        <td class="num">{{ m.charge > 0 ? ('S/ ' + (m.charge | number: '1.2-2')) : '—' }}</td>
                        <td class="num pay">{{ m.payment > 0 ? ('S/ ' + (m.payment | number: '1.2-2')) : '—' }}</td>
                        <td class="num" [class.deb]="m.balance > 0">S/ {{ m.balance | number: '1.2-2' }}</td>
                        <td class="muted">{{ m.by }}</td></tr>
                    } @empty { <tr><td colspan="7" class="muted center">Sin movimientos.</td></tr> }
                  </tbody></table>
              </div>
            }

            <!-- HISTORIAL (resumen por día calendario) -->
            @if (tab() === 'historial') {
              <p class="hint2"><i class="pi pi-info-circle"></i> Resumen por día calendario (00:00 a 23:59). Las horas exactas están en Auditoría.</p>
              @for (d of historialDays(f); track d.key) {
                <div class="panel">
                  <h4><i class="pi pi-calendar"></i> {{ d.label }}</h4>
                  @if (d.renovaciones.length) {
                    <div class="h-cat"><span class="h-lbl reno"><i class="pi pi-refresh"></i> Renovación</span>
                      <ul>@for (r of d.renovaciones; track $index) { <li>1 período adicional · S/ {{ r.charge | number: '1.2-2' }}</li> }</ul></div>
                  }
                  @if (d.limpiezas.length) {
                    <div class="h-cat"><span class="h-lbl limp"><i class="pi pi-sparkles"></i> Limpieza</span>
                      <ul>@for (c of d.limpiezas; track $index) { <li>{{ c.action }}</li> }</ul></div>
                  }
                  @if (d.productos.length) {
                    <div class="h-cat"><span class="h-lbl vent"><i class="pi pi-shopping-bag"></i> Venta de productos</span>
                      <ul>@for (p of d.productos; track $index) { <li>{{ p.name }} ×{{ p.quantity }} · S/ {{ p.amount | number: '1.2-2' }}</li> }</ul>
                      <div class="h-tot">Total: S/ {{ d.productosTotal | number: '1.2-2' }}</div></div>
                  }
                </div>
              } @empty { <p class="muted center" style="padding:1.5rem">Sin actividad registrada aún.</p> }
            }

            <!-- AUDITORÍA (bitácora cronológica real) -->
            @if (tab() === 'operacion') {
              <div class="panel">
                <h4><i class="pi pi-clock"></i> AUDITORÍA — SECUENCIA CRONOLÓGICA</h4>
                @for (e of audit(); track $index) {
                  <div class="au-row">
                    <span class="au-t">{{ e.at | date: 'dd/MM HH:mm' }}</span>
                    <span class="au-dot" [class]="auClass(e)"></span>
                    <div class="au-c">
                      <div class="au-h"><strong>{{ e.user }}</strong> — {{ actLabel(e) }}</div>
                      @if (e.detail) { <div class="au-d">{{ e.detail }}</div> }
                      <div class="au-m"><span class="au-org">{{ origin(e) }}</span>@if (e.reference) { <span class="au-ref">{{ e.reference }}</span> }</div>
                    </div>
                  </div>
                } @empty { <p class="muted center">Sin eventos de auditoría para esta estancia.</p> }
              </div>
            }
          </div>

          <footer class="fl-foot">
            <button class="fbtn green"><i class="pi pi-file-edit"></i> Facturar</button>
            <button class="fbtn orange"><i class="pi pi-file"></i> Nota de Crédito/Débito</button>
            <span class="spacer"></span>
            <button class="fbtn ghost" (click)="onVis(false)">Cerrar</button>
          </footer>
        </div>
      } @else { <p class="loading">Cargando folio…</p> }
    </p-dialog>

    <!-- Inspección de frigobar -->
    <p-dialog [(visible)]="reviewVisible" [modal]="true" [header]="(data()?.room?.number || '') + ' - INSPECCIÓN FRIGOBAR'" [style]="{ width: '52rem', maxWidth: '97vw' }" styleClass="fl-dialog2">
      @if (!reviewLines().length) {
        <p class="muted" style="padding:1rem">La habitación no tiene dotación de frigobar. Dótala primero en <b>Dotación Base → Primera Dotación</b>.</p>
      } @else {
        <div class="insp">
          <div class="insp-l">
            @for (g of reviewGroups(); track g.key) {
              <div class="ig">
                <div class="ig-h" [class.bandeja]="g.key === 'BANDEJA'"><i class="pi" [class.pi-inbox]="g.key === 'FRIGOBAR'" [class.pi-shopping-cart]="g.key === 'BANDEJA'"></i> <div><b>{{ g.label }}</b><small>{{ g.key === 'FRIGOBAR' ? 'Productos dentro del frigobar' : 'Productos sobre la bandeja / mesa' }}</small></div></div>
                <div class="ig-cols"><span>PRODUCTO</span><span class="c">BASE</span><span class="c">IMAGEN</span><span class="c">CONSUMO</span></div>
                @for (l of g.rows; track l.productId) {
                  <div class="ig-row" [class.on]="l.consumo > 0">
                    <span class="ig-n">{{ l.name }}</span>
                    <span class="c ig-b">{{ l.expectedQty }}</span>
                    <button class="c ig-img" type="button" [disabled]="l.consumo >= l.expectedQty" (click)="revInc(l)" title="Tocar para marcar consumo">@if (l.imageUrl) { <img [src]="l.imageUrl" alt="" /> } @else { <i class="pi pi-image"></i> }</button>
                    <span class="c ig-step">
                      <button class="st" [disabled]="l.consumo <= 0" (click)="revDec(l)" title="Reducir">−</button>
                      <b [class.on]="l.consumo > 0">{{ l.consumo > 0 ? ('−' + l.consumo) : '0' }}</b>
                    </span>
                  </div>
                }
              </div>
            }
          </div>
          <div class="insp-r">
            <div class="ir-h"><i class="pi pi-file-edit"></i> <div><b>PRODUCTOS CONSUMIDOS</b><small>Se cargarán al folio</small></div></div>
            <div class="ir-list">
              @for (l of reviewConsumed(); track l.productId) { <div class="ir-l"><span class="ir-q">{{ l.consumo }} ×</span> {{ l.name }}</div> }
              @if (!reviewConsumed().length) { <p class="muted sm">Sin consumo aún.</p> }
            </div>
            <div class="ir-tot"><i class="pi pi-chart-bar"></i> <div><small>TOTAL CONSUMIDO</small><strong>{{ reviewTotalUnits() }} unidad(es)</strong></div></div>
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="reviewVisible = false" />
        <p-button label="Confirmar Inspección" icon="pi pi-check" severity="success" [loading]="busy()" [disabled]="!reviewLines().length" (onClick)="submitReview()" />
      </ng-template>
    </p-dialog>

    <!-- Cobrar frigobar (reusa el cobro de la estancia) -->
    <p-dialog [(visible)]="cobroVisible" [modal]="true" header="Cobrar Frigobar" [style]="{ width: '24rem', maxWidth: '95vw' }" styleClass="fl-dialog2">
      <div class="cb-amt">Total a cobrar<strong>S/ {{ cobroAmount | number: '1.2-2' }}</strong></div>
      <label class="cb-lbl">Método de pago</label>
      <p-select [options]="payMethods" optionLabel="label" optionValue="value" [(ngModel)]="cobroMethod" appendTo="body" styleClass="w" />
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="cobroVisible = false" />
        <p-button label="Confirmar cobro" icon="pi pi-check" severity="success" [loading]="busy()" (onClick)="confirmCobro()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .fl-dialog .p-dialog { display: flex; flex-direction: column; }
      :host ::ng-deep .fl-dialog .p-dialog-content { background: #0a0e1a; color: #e6edf5; padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      .fl { display: flex; flex-direction: column; flex: 1; min-height: 0; }
      .fl-head { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.4rem; background: #0f1a2b; border-bottom: 1px solid #1c2c44; }
      .fl-id { display: flex; align-items: center; gap: 0.8rem; }
      .ico { background: #5b21b6; color: #fff; width: 42px; height: 42px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.2rem; }
      .ttl { font-size: 1.15rem; font-weight: 800; } .ttl .rm { color: #8aa0bd; font-weight: 500; }
      .sub { color: #8aa0bd; font-size: 0.8rem; } .sub strong { color: #a78bfa; }
      .fl-right { display: flex; align-items: center; gap: 0.8rem; }
      .badge { font-size: 0.78rem; color: #8aa0bd; } .badge.act { color: #34d399; }
      .x { background: transparent; border: 0; color: #8aa0bd; cursor: pointer; font-size: 1.1rem; }
      .tabs { display: flex; gap: 0.2rem; padding: 0 1.4rem; background: #0f1a2b; border-bottom: 1px solid #1c2c44; }
      .tabs button { background: transparent; border: 0; border-bottom: 2px solid transparent; color: #8aa0bd; padding: 0.8rem 1rem; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .tabs button.on { color: #60a5fa; border-bottom-color: #60a5fa; font-weight: 700; }
      .fl-body { padding: 1rem 1.3rem; flex: 1; min-height: 0; overflow-y: auto; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
      .panel { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 0.85rem; margin-bottom: 0.7rem; }
      /* Historial por día */
      .hint2 { display: flex; align-items: center; gap: 0.4rem; color: #8aa0bd; font-size: 0.8rem; margin: 0 0 0.7rem; } .hint2 .pi { color: #60a5fa; }
      .h-cat { margin-bottom: 0.6rem; } .h-cat:last-child { margin-bottom: 0; }
      .h-lbl { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
      .h-lbl.reno { color: #5eead4; } .h-lbl.limp { color: #93c5fd; } .h-lbl.vent { color: #fbbf24; }
      .h-cat ul { margin: 0.3rem 0 0; padding-left: 1.1rem; color: #cbd5e1; font-size: 0.85rem; } .h-cat li { margin: 0.1rem 0; }
      .h-tot { color: #fbbf24; font-weight: 700; font-size: 0.82rem; margin-top: 0.25rem; }
      /* Auditoría timeline */
      .au-row { display: flex; gap: 0.7rem; align-items: flex-start; padding: 0.4rem 0; border-bottom: 1px solid #16202e; }
      .au-t { flex: 0 0 4.6rem; color: #8aa0bd; font-size: 0.76rem; font-variant-numeric: tabular-nums; padding-top: 0.15rem; }
      .au-dot { flex: 0 0 auto; width: 0.7rem; height: 0.7rem; border-radius: 50%; background: #64748b; margin-top: 0.3rem; }
      .au-dot.hosp { background: #34d399; } .au-dot.limp { background: #60a5fa; } .au-dot.vent { background: #fbbf24; } .au-dot.sys { background: #a78bfa; }
      .au-c { flex: 1; min-width: 0; } .au-h { font-size: 0.88rem; } .au-h strong { color: #fff; }
      .au-d { color: #9fb0c3; font-size: 0.8rem; margin-top: 0.1rem; }
      .au-m { display: flex; gap: 0.5rem; margin-top: 0.15rem; flex-wrap: wrap; }
      .au-org { font-size: 0.68rem; font-weight: 700; color: #93c5fd; background: rgba(37,99,235,0.15); border-radius: 999px; padding: 0.05rem 0.5rem; }
      .au-ref { font-size: 0.68rem; color: #8aa0bd; }
      h4 { margin: 0 0 0.8rem; font-size: 0.82rem; color: #8aa0bd; letter-spacing: 0.03em; display: flex; align-items: center; gap: 0.4rem; }
      h4 .hl { margin-left: auto; color: #fbbf24; } h4 .pi { color: #60a5fa; }
      .g-name { font-size: 1.2rem; font-weight: 800; }
      .g-meta { display: flex; gap: 1.2rem; color: #8aa0bd; font-size: 0.85rem; margin-top: 0.4rem; flex-wrap: wrap; }
      .bill { border: 1px solid #6b4f2a; border-radius: 10px; padding: 0.8rem; margin-top: 0.9rem; font-size: 0.82rem; color: #fcd9a8; }
      .bh { display: flex; justify-content: space-between; color: #fbbf24; font-weight: 700; margin-bottom: 0.4rem; }
      .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
      .rchip { background: rgba(45,212,191,0.15); color: #5eead4; border: 1px solid #155e63; border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.72rem; }
      .clean-box { background: rgba(96,165,250,0.1); border: 1px solid #1e3a8a; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.7rem; color: #93c5fd; font-weight: 700; font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; flex-wrap: wrap; }
      .clean-box small { color: #8aa0bd; font-weight: 400; }
      .cl-av { color: #64748b; } .cl-av.on { color: #34d399; font-weight: 600; }
      .muted2 { color: #8aa0bd; font-weight: 400; font-size: 0.9em; }
      .cl-btn { background: linear-gradient(135deg,#2563eb,#3b82f6); color: #fff; border: 0; border-radius: 9px; padding: 0.5rem 0.85rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
      .cl-btn:hover { filter: brightness(1.1); } .cl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .cl-badge { border-radius: 999px; padding: 0.3rem 0.7rem; font-size: 0.74rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.35rem; white-space: nowrap; }
      .cl-badge.sol { background: rgba(245,158,11,0.18); color: #fbbf24; } .cl-badge.cur { background: rgba(59,130,246,0.22); color: #93c5fd; }
      .dates2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
      .dates2 > div { background: #0b1220; border: 1px solid #1c2c44; border-radius: 8px; padding: 0.5rem 0.7rem; }
      .dates2 span { font-size: 0.66rem; color: #8aa0bd; display: block; } .dates2 strong { font-size: 0.82rem; }
      .timer { margin-top: 0.7rem; background: rgba(127,29,29,0.15); border: 1px solid #7f1d1d; border-radius: 8px; padding: 0.6rem 0.8rem; color: #fca5a5; display: flex; align-items: center; gap: 0.5rem; }
      .timer strong { margin-left: auto; font-size: 1.2rem; letter-spacing: 0.04em; }
      .dur { margin-top: 0.6rem; color: #8aa0bd; font-size: 0.82rem; }
      .money3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
      .mc { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
      .mc .l { font-size: 0.72rem; color: #8aa0bd; display: flex; align-items: center; gap: 0.35rem; } .mc .v { font-size: 1.5rem; font-weight: 800; } .mc .s { font-size: 0.72rem; color: #8aa0bd; }
      .total-row { display: flex; align-items: center; justify-content: space-between; background: linear-gradient(90deg,#1e1b4b,#312e81); border: 1px solid #4338ca; border-radius: 12px; padding: 1rem 1.2rem; margin-bottom: 1rem; }
      .total-row .big { font-size: 1.8rem; font-weight: 800; } .tr-r { text-align: right; } .tr-r small { color: #a5b4fc; display: block; }
      .sim { border: 1px solid #1c2c44; border-radius: 12px; padding: 1.1rem; margin-bottom: 1rem; } .sim.bad { border-color: #b91c1c; }
      .sim-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 0.8rem; }
      .sc { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; } .sc span { font-size: 0.72rem; color: #8aa0bd; display: block; } .sc strong { font-size: 1.2rem; color: #60a5fa; }
      .ratio-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: #8aa0bd; margin-bottom: 0.4rem; }
      .rb { background: #166534; color: #6ee7b7; border-radius: 999px; padding: 0.15rem 0.6rem; font-weight: 700; } .rb.bad { background: #be123c; color: #fff; }
      .bar { position: relative; height: 8px; background: #1c2c44; border-radius: 999px; overflow: visible; }
      .fill { height: 100%; background: #34d399; border-radius: 999px; } .fill.bad { background: #f43f5e; }
      .mark { position: absolute; top: -3px; width: 2px; height: 14px; background: #f87171; }
      .sim-warn { background: rgba(127,29,29,0.2); border: 1px solid #7f1d1d; border-radius: 8px; padding: 0.7rem 0.9rem; margin-top: 0.8rem; color: #fca5a5; font-size: 0.82rem; }
      .sw-row { display: flex; justify-content: space-between; margin-top: 0.3rem; } .sw-hint { margin-top: 0.4rem; color: #fcd34d; }
      .alerts { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; font-size: 0.85rem; }
      .al-t { font-size: 0.7rem; color: #8aa0bd; display: block; margin-bottom: 0.4rem; } .al-y { color: #fbbf24; margin-top: 0.3rem; }
      /* Frigobar */
      .fb-sec { background: linear-gradient(180deg,#161e3a,#111834); border: 1px solid #2a3a6a; border-radius: 12px; padding: 0.9rem 1rem; margin-bottom: 0.7rem; }
      .fb-sec.cons { border-color: #3a5a86; }
      .fb-h { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
      .fb-t { font-weight: 800; letter-spacing: 0.03em; display: inline-flex; align-items: center; gap: 0.4rem; } .fb-t .pi { color: #a78bfa; }
      .fb-badge { border-radius: 999px; padding: 0.12rem 0.6rem; font-size: 0.66rem; font-weight: 800; }
      .fb-badge.cons { background: rgba(59,130,246,0.2); color: #93c5fd; } .fb-badge.pay { background: rgba(16,185,129,0.2); color: #6ee7b7; }
      .fb-badge.rev { background: rgba(148,163,184,0.2); color: #cbd5e1; } .fb-badge.sr { background: rgba(245,158,11,0.2); color: #fbbf24; }
      .fb-repo { margin-left: auto; font-size: 0.72rem; color: #fbbf24; display: inline-flex; align-items: center; gap: 0.25rem; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.35); border-radius: 999px; padding: 0.1rem 0.55rem; }
      .fb-body { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap; } .fb-st small, .fb-body small { display: block; color: #8aa0bd; font-size: 0.78rem; }
      .fb-cons { display: flex; align-items: stretch; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .fb-lines { flex: 1; min-width: 200px; } .fb-l { display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid #1c2c44; font-size: 0.86rem; } .fb-la { color: #fbbf24; font-weight: 700; }
      .fb-r { display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end; justify-content: center; } .fb-pend { text-align: right; } .fb-pend span { display: block; font-size: 0.68rem; color: #8aa0bd; } .fb-pend strong { font-size: 1.4rem; }
      .fb-btn { border: 0; border-radius: 9px; padding: 0.55rem 0.9rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; white-space: nowrap; } .fb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .fb-btn.blue { background: linear-gradient(135deg,#2563eb,#3b82f6); color: #fff; } .fb-btn.green { background: linear-gradient(135deg,#059669,#10b981); color: #04130d; }
      .fb-btn.ghost { background: #0b1220; border: 1px solid #274468; color: #93c5fd; } .fb-btn.sm { margin-top: 0.6rem; font-size: 0.78rem; padding: 0.4rem 0.7rem; }
      :host ::ng-deep .fl-dialog2 .p-dialog-content, :host ::ng-deep .fl-dialog2 .p-dialog-header, :host ::ng-deep .fl-dialog2 .p-dialog-footer { background: #0e1a2b; color: #e6edf5; }
      .rv-sub { color: #8aa0bd; font-size: 0.82rem; margin: 0 0 0.8rem; }
      .rv-row { display: flex; align-items: center; gap: 0.7rem; background: #0b1220; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.55rem 0.8rem; margin-bottom: 0.5rem; }
      .rv-n { flex: 1; } .rv-n small { display: block; color: #8aa0bd; font-size: 0.72rem; } .rv-q { font-size: 0.78rem; color: #8aa0bd; display: inline-flex; align-items: center; gap: 0.4rem; }
      .rv-c { min-width: 2.2rem; text-align: right; font-weight: 800; color: #64748b; } .rv-c.on { color: #f87171; }
      .rv-tot { text-align: right; margin-top: 0.5rem; color: #cbd5e1; } .rv-tot b { color: #fbbf24; }
      .cb-amt { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; color: #8aa0bd; font-size: 0.8rem; margin-bottom: 0.8rem; } .cb-amt strong { font-size: 1.8rem; color: #6ee7b7; }
      .cb-lbl { display: block; font-size: 0.8rem; color: #8aa0bd; margin-bottom: 0.3rem; } :host ::ng-deep .fl-dialog2 .w { width: 100%; }
      /* Inspección de frigobar (2 columnas) */
      .insp { display: grid; grid-template-columns: 1fr 15rem; gap: 0.9rem; align-items: start; }
      .insp-l { max-height: 64vh; overflow-y: auto; padding-right: 0.3rem; }
      .insp-r { position: sticky; top: 0; }
      .ig { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; margin-bottom: 0.8rem; overflow: hidden; }
      .ig-h { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.9rem; background: rgba(59,130,246,0.12); color: #93c5fd; } .ig-h.bandeja { background: rgba(245,158,11,0.12); color: #fbbf24; } .ig-h b { display: block; } .ig-h small { color: #8aa0bd; font-size: 0.72rem; } .ig-h .pi { font-size: 1.2rem; }
      .ig-cols { display: grid; grid-template-columns: 1fr 4rem 4rem 6rem; gap: 0.4rem; padding: 0.35rem 0.9rem; font-size: 0.64rem; color: #8aa0bd; font-weight: 700; letter-spacing: 0.03em; } .ig-cols .c { text-align: center; }
      .ig-row { display: grid; grid-template-columns: 1fr 4rem 4rem 6rem; gap: 0.4rem; align-items: center; padding: 0.4rem 0.9rem; border-top: 1px solid #16202e; } .ig-row.on { background: rgba(244,63,94,0.06); }
      .ig-n { font-weight: 800; font-size: 0.98rem; text-transform: uppercase; letter-spacing: 0.02em; color: #fff; } .ig-b { text-align: center; font-weight: 800; font-size: 1rem; }
      .ig-img { display: inline-flex; align-items: center; justify-content: center; background: #0b1220; border: 1px solid #274468; border-radius: 8px; padding: 0.2rem; cursor: pointer; width: 2.6rem; height: 2.6rem; margin: 0 auto; } .ig-img:hover:not(:disabled) { border-color: #3b82f6; } .ig-img:disabled { opacity: 0.6; cursor: not-allowed; } .ig-img img { max-width: 2rem; max-height: 2rem; object-fit: contain; } .ig-img .pi { color: #46617a; }
      .ig-step { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }
      .ig-step .st { width: 1.9rem; height: 1.9rem; border: 1px solid #7f1d1d; background: rgba(244,63,94,0.12); color: #fca5a5; border-radius: 7px; cursor: pointer; font-weight: 800; line-height: 1; } .ig-step .st:disabled { opacity: 0.35; cursor: not-allowed; } .ig-step b { min-width: 2rem; text-align: center; color: #64748b; font-size: 1.1rem; } .ig-step b.on { color: #f87171; }
      .insp-r { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 0.8rem; display: flex; flex-direction: column; }
      .ir-h { display: flex; align-items: flex-start; gap: 0.5rem; color: #fca5a5; margin-bottom: 0.6rem; } .ir-h b { display: block; font-size: 0.78rem; } .ir-h small { color: #8aa0bd; font-size: 0.68rem; } .ir-h .pi { color: #f87171; }
      .ir-list { flex: 1; min-height: 4rem; } .ir-l { padding: 0.35rem 0; border-bottom: 1px solid #16202e; font-size: 0.85rem; text-transform: uppercase; } .ir-q { color: #f87171; font-weight: 800; } .sm { font-size: 0.78rem; text-transform: none; }
      .ir-tot { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.6rem; background: rgba(244,63,94,0.12); border: 1px solid #7f1d1d; border-radius: 10px; padding: 0.6rem 0.8rem; color: #fca5a5; } .ir-tot small { display: block; font-size: 0.62rem; } .ir-tot strong { font-size: 1.2rem; color: #fff; } .ir-tot .pi { font-size: 1.3rem; }
      @media (max-width: 680px) { .insp { grid-template-columns: 1fr; } }
      .tablewrap { overflow-x: auto; border: 1px solid #1c2c44; border-radius: 12px; }
      .ftbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; min-width: 760px; }
      .ftbl th { text-align: left; padding: 0.7rem 0.9rem; color: #8aa0bd; font-weight: 600; border-bottom: 1px solid #1c2c44; background: #0f1a2b; }
      .ftbl td { padding: 0.6rem 0.9rem; border-bottom: 1px solid #16202e; } .ftbl .num { text-align: right; } .ftbl .num.pay { color: #34d399; } .ftbl .num.deb { color: #f87171; }
      .mtag { color: #60a5fa; font-weight: 600; } .mtag.pay { color: #34d399; }
      .muted { color: #8aa0bd; } .center { text-align: center; }
      .seg { display: flex; align-items: center; gap: 0.8rem; background: #0b1220; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.5rem; }
      .seg .sn { width: 1.8rem; height: 1.8rem; border-radius: 50%; background: #4338ca; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; } .seg .sn.r { background: #b45309; }
      .seg .si { flex: 1; } .seg .si small { display: block; color: #8aa0bd; } .seg .sa { color: #34d399; font-weight: 700; }
      .prow, .crow { display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid #16202e; }
      .prow small { display: block; color: #8aa0bd; } .pr-r { text-align: right; } .pa { color: #fbbf24; font-weight: 700; display: block; } .pg { font-size: 0.7rem; color: #8aa0bd; } .pg.ok { color: #34d399; }
      .evt { display: flex; gap: 0.8rem; margin-bottom: 0.7rem; }
      .ev-ico { width: 2rem; height: 2rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; } .ev-ico.in { background: #10b981; color: #04130d; } .ev-ico.sale { background: #0e7490; color: #fff; }
      .ev-card { flex: 1; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.6rem 0.9rem; } .ev-card .muted { font-size: 0.78rem; }
      .fl-foot { display: flex; align-items: center; gap: 0.6rem; padding: 0.9rem 1.4rem; background: #0f1a2b; border-top: 1px solid #1c2c44; }
      .fl-foot .spacer { flex: 1; }
      .fbtn { border: 1px solid #1c2c44; background: #0b1220; color: #e6edf5; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
      .fbtn.green { border-color: #14633f; color: #6ee7b7; } .fbtn.orange { border-color: #b45309; color: #fcd34d; } .fbtn.ghost { color: #8aa0bd; }
      .loading { padding: 2rem; text-align: center; color: #8aa0bd; }
      @media (max-width: 760px) { .grid2, .money3, .sim-cols, .dates2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class FolioEstanciaComponent implements OnDestroy {
  readonly docLabel = docLabel;
  readonly natLabel = natLabel;
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  private readonly toast = inject(MessageService);

  @Input() visible = false;
  @Input() stayId: string | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  /** Notifica al board que algo cambió (p.ej. se solicitó limpieza → recargar el mapa). */
  @Output() changed = new EventEmitter<void>();

  readonly data = signal<Folio | null>(null);
  readonly audit = signal<AuditEvent[]>([]);
  readonly tab = signal<Tab>('resumen');
  readonly nowTick = signal(Date.now());
  readonly busy = signal(false);
  private clock?: ReturnType<typeof setInterval>;

  ngOnDestroy(): void { if (this.clock) clearInterval(this.clock); }

  /** La sección de limpieza programada solo aplica a pernoctación o estancias renovadas. */
  showCleaning(f: Folio): boolean { return f.cleaning.pernocta || f.renewals > 0; }
  /** Se puede solicitar cuando hay una limpieza programada pendiente y ninguna en curso. */
  canRequestCleaning(f: Folio): boolean { return f.cleaning.status === 'NONE' && f.cleaning.allowed > f.cleaning.done; }

  requestCleaning(): void {
    if (!this.stayId) return;
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/stays/${this.stayId}/request-renewal-cleaning`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Limpieza solicitada', detail: 'La habitación se envió al personal de limpieza.' }); this.load(); this.changed.emit(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo solicitar la limpieza.' }); },
    });
  }

  // ── Frigobar: revisar / cobrar / reponer ──
  reviewVisible = false;
  readonly reviewLines = signal<ReviewLine[]>([]);
  cobroVisible = false;
  cobroAmount = 0;
  cobroMethod = 'CASH';
  readonly payMethods = [
    { label: 'Efectivo', value: 'CASH' }, { label: 'Tarjeta', value: 'CARD' }, { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Yape', value: 'YAPE' }, { label: 'Plin', value: 'PLIN' }, { label: 'Billetera', value: 'WALLET' },
  ];
  openReview(): void {
    if (!this.stayId) return;
    this.reviewLines.set([]);
    this.http.get<ApiResponse<{ lines: ReviewLine[] }>>(`${this.api}/frigobar/review/${this.stayId}/start`).subscribe({
      next: (r) => { this.reviewLines.set((r.data?.lines ?? []).map((l) => ({ ...l, location: l.location === 'BANDEJA' ? 'BANDEJA' : 'FRIGOBAR', consumo: 0 }))); this.reviewVisible = true; },
      error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo iniciar la revisión.' }),
    });
  }
  reviewGroups(): { key: string; label: string; rows: ReviewLine[] }[] {
    const fr = this.reviewLines().filter((l) => l.location !== 'BANDEJA');
    const ba = this.reviewLines().filter((l) => l.location === 'BANDEJA');
    return [{ key: 'FRIGOBAR', label: 'Frigobar', rows: fr }, { key: 'BANDEJA', label: 'Bandeja', rows: ba }].filter((g) => g.rows.length);
  }
  revInc(l: ReviewLine): void { if (l.consumo < l.expectedQty) { l.consumo++; this.reviewLines.set([...this.reviewLines()]); } }
  revDec(l: ReviewLine): void { if (l.consumo > 0) { l.consumo--; this.reviewLines.set([...this.reviewLines()]); } }
  reviewConsumed(): ReviewLine[] { return this.reviewLines().filter((l) => l.consumo > 0); }
  reviewTotalUnits(): number { return this.reviewLines().reduce((a, l) => a + l.consumo, 0); }
  submitReview(): void {
    if (!this.stayId || !this.reviewLines().length) return;
    this.busy.set(true);
    // El backend recibe "quedan" (found) = base − consumo. Origen RECEPCION (Housekeeping usará el mismo modal luego).
    const lines = this.reviewLines().map((l) => ({ productId: l.productId, foundQty: Math.max(0, l.expectedQty - l.consumo) }));
    this.http.post<ApiResponse<{ consumedTotal: number }>>(`${this.api}/frigobar/review/${this.stayId}`, { lines, origin: 'RECEPCION' }).subscribe({
      next: (r) => { this.busy.set(false); this.reviewVisible = false; const c = r.data?.consumedTotal ?? 0; this.toast.add({ severity: 'success', summary: 'Frigobar revisado', detail: c > 0 ? `Consumo registrado: S/ ${c.toFixed(2)}` : 'Sin consumo.' }); this.load(); this.changed.emit(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar la revisión.' }); },
    });
  }
  openCobro(amount: number): void { this.cobroAmount = amount; this.cobroMethod = 'CASH'; this.cobroVisible = true; }
  confirmCobro(): void {
    if (!this.stayId || this.cobroAmount <= 0) return;
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/stays/${this.stayId}/pay`, { amount: this.cobroAmount, method: this.cobroMethod }).subscribe({
      next: () => { this.busy.set(false); this.cobroVisible = false; this.toast.add({ severity: 'success', summary: 'Cobro registrado', detail: `S/ ${this.cobroAmount.toFixed(2)} cobrados.` }); this.load(); this.changed.emit(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cobrar.' }); },
    });
  }
  reponer(reviewId?: string): void {
    if (!reviewId) return;
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/frigobar/review/${reviewId}/reposition`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Frigobar repuesto', detail: 'Los productos se repusieron desde Productos Limpieza.' }); this.load(); this.changed.emit(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo reponer.' }); },
    });
  }

  load(): void {
    this.tab.set('resumen');
    this.data.set(null);
    this.audit.set([]);
    if (!this.stayId) return;
    this.http.get<ApiResponse<Folio>>(`${this.api}/stays/${this.stayId}/folio`).subscribe((r) => this.data.set(r.data));
    this.http.get<ApiResponse<AuditEvent[]>>(`${this.api}/stays/${this.stayId}/activity`).subscribe((r) => this.audit.set(r.data ?? []));
    if (!this.clock) this.clock = setInterval(() => this.nowTick.set(Date.now()), 1000);
  }

  // ── Auditoría ──
  actLabel(e: AuditEvent): string { return (e.activity && ACT_LABEL[e.activity]) || e.detail || e.activity || 'Evento'; }
  origin(e: AuditEvent): string { return (e.area && AREA_ORIGIN[e.area]) || 'Sistema'; }
  auClass(e: AuditEvent): string {
    const a = e.area ?? '';
    if (a === 'HOSPEDAJE') return 'au-dot hosp';
    if (a === 'LIMPIEZA' || a === 'INVENTARIO') return 'au-dot limp';
    if (a === 'VENTAS' || a === 'CAJA') return 'au-dot vent';
    return 'au-dot sys';
  }

  // ── Historial por día calendario ──
  private dayKey(iso: string): string { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  private dayLabel(iso: string): string {
    const d = new Date(iso);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  private isRenewalDesc(s: string): boolean { return /renov|tiempo extra|extensi/i.test(s || ''); }
  historialDays(f: Folio): HistDay[] {
    const map = new Map<string, HistDay>();
    const get = (iso: string): HistDay => {
      const k = this.dayKey(iso);
      let d = map.get(k);
      if (!d) { d = { key: k, label: this.dayLabel(iso), renovaciones: [], limpiezas: [], productos: [], productosTotal: 0 }; map.set(k, d); }
      return d;
    };
    // Renovaciones: cargos de renovación en los movimientos (con fecha real).
    for (const m of f.movements) if (m.charge > 0 && this.isRenewalDesc(m.description)) get(m.at).renovaciones.push({ charge: m.charge });
    // Limpiezas: bitácora de tareas.
    for (const c of f.cleaningLog) get(c.at).limpiezas.push({ action: c.action });
    // Productos consumidos.
    for (const p of f.products) { const d = get(p.at); d.productos.push({ name: p.name, quantity: p.quantity, amount: p.amount }); d.productosTotal += p.amount; }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  onVis(v: boolean): void { this.visible = v; this.visibleChange.emit(v); }

  expired(): boolean {
    const d = this.data();
    return d ? new Date(d.plannedCheckoutAt).getTime() - this.nowTick() < 0 : false;
  }
  remaining(): string {
    const d = this.data();
    if (!d) return '00:00:00';
    const ms = new Date(d.plannedCheckoutAt).getTime() - this.nowTick();
    const neg = ms < 0; const t = Math.abs(ms);
    const h = Math.floor(t / 3_600_000); const m = Math.floor((t % 3_600_000) / 60_000); const s = Math.floor((t % 60_000) / 1000);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${neg ? '-' : ''}${p(h)}:${p(m)}:${p(s)}`;
  }
  durationLabel(min: number): string {
    const h = Math.floor(min / 60); const m = min % 60;
    return `${h}h ${m}min`;
  }
  barWidth(ratio: number): number { return Math.min(100, Math.max(0, ratio)); }
}
