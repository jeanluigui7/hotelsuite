import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { CashDetail, CashDetailMovement, MovementDetail, MovementHistoryEntry } from '../services/finance.models';
import { buildCuadreTicket } from '../services/cuadre-ticket';

interface ReconItem { id: string; at: string; type: string; amount: number; affectsCash: boolean; quantity: number | null; note: string | null; by: string | null; approvedBy: string | null; }
interface ReconSummary { expected: number | null; declared: number | null; originalDifference: number; pendingDifference: number; reconciliations: ReconItem[]; }

const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', YAPE: 'Yape', PLIN: 'Plin', WALLET: 'Billetera', MIXTO: 'Mixto', PENDIENTE: 'Pendiente' };
const TYPE_LABEL: Record<string, string> = { HOSPEDAJE: 'Hospedaje', RENOVACION: 'Pago Renovación', PRODUCTO: 'Venta Producto', SERVICIO: 'Servicio', INGRESO: 'Ingreso', EGRESO: 'Egreso' };
const TYPE_COLOR: Record<string, [string, string]> = {
  HOSPEDAJE: ['rgba(59,130,246,0.18)', '#60a5fa'], RENOVACION: ['rgba(245,158,11,0.2)', '#f59e0b'], PRODUCTO: ['rgba(245,158,11,0.2)', '#fbbf24'],
  SERVICIO: ['rgba(20,184,166,0.2)', '#2dd4bf'], INGRESO: ['rgba(16,185,129,0.18)', '#34d399'], EGRESO: ['rgba(248,113,113,0.18)', '#f87171'],
};

@Component({
  selector: 'app-cash-movements-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule],
  template: `
    <section class="wrap">
      @if (loading()) { <p class="muted">Cargando…</p> }
      @else if (detail()) {
        @let d = detail()!;
        <header class="head">
          <div>
            <h1>Movimientos — Caja #{{ d.session.number ?? '—' }}</h1>
            <p class="turno">Turno: {{ d.session.openedAt | date: 'dd/MM/yyyy HH:mm' }} — {{ d.session.closedAt ? (d.session.closedAt | date: 'dd/MM/yyyy HH:mm') : 'En curso' }} · {{ d.session.openedByName }}</p>
          </div>
          <div class="dactions">
            <button class="mini" (click)="verCuadre(d)"><i class="pi pi-print"></i> Ver</button>
            @if (d.session.status !== 'OPEN' && canReopen) { <button class="mini warn" (click)="reopen(d.session.id)"><i class="pi pi-replay"></i> Reabrir</button> }
          </div>
        </header>

        <div class="cards">
          <div class="mc blue"><span>Total Ventas Hospedaje</span><strong>S/ {{ d.cards.ventasHospedaje | number: '1.2-2' }}</strong></div>
          <div class="mc brown"><span>Ventas Productos</span><strong>S/ {{ d.cards.ventasProductos | number: '1.2-2' }}</strong></div>
          <div class="mc teal"><span>Servicios y Otros</span><strong>S/ {{ d.cards.serviciosOtros | number: '1.2-2' }}</strong></div>
          <button class="mc brown clickable" (click)="deudasVisible = true" [disabled]="!(d.deudas?.length)">
            <span>Deudas Pendientes @if (d.deudas?.length) { <i class="pi pi-external-link"></i> }</span>
            <strong>S/ {{ d.cards.deudasPendientes | number: '1.2-2' }}</strong>
            @if (d.deudas?.length) { <em>{{ d.deudas!.length }} obligación(es) al cierre</em> }
          </button>
          <div class="mc green"><span>Efectivo</span><strong>S/ {{ d.cards.efectivo | number: '1.2-2' }}</strong></div>
          <div class="mc purple"><span>Ajustes (+/-)</span><strong>{{ d.cards.ajustes >= 0 ? '+' : '' }}S/ {{ d.cards.ajustes | number: '1.2-2' }}</strong></div>
          @if (regsTotal(d) > 0) {
            <button class="mc amber clickable" (click)="toggleRegsFilter()" [class.active]="typeFilter === '__REG__'">
              <span>Regularizaciones <i class="pi pi-filter"></i></span>
              <strong>S/ {{ (d.regularizaciones!.cobradas.amount + d.regularizaciones!.noCobradas.amount + d.regularizaciones!.porVerificar.amount) | number: '1.2-2' }}</strong>
              <em>
                <b class="ok">{{ d.regularizaciones!.cobradas.count }} cobr.</b> ·
                <b class="warn">{{ d.regularizaciones!.noCobradas.count }} no cobr.</b> ·
                <b class="pend">{{ d.regularizaciones!.porVerificar.count }} x verif.</b>
              </em>
            </button>
          }
        </div>

        @if (recon(); as rc) {
          <div class="recon">
            <div class="recon-h"><span><i class="pi pi-balance-scale"></i> Conciliación de caja</span>
              @if (canEdit && rc.pendingDifference > 0) { <button class="mini" (click)="openVnr()"><i class="pi pi-plus"></i> Regularizar venta no registrada</button> }
            </div>
            <div class="recon-grid">
              <div><span>Esperado original</span><strong>S/ {{ rc.expected ?? 0 | number: '1.2-2' }}</strong></div>
              <div><span>Declarado / Entregado</span><strong>S/ {{ rc.declared ?? 0 | number: '1.2-2' }}</strong></div>
              <div><span>Diferencia original</span><strong [class.pos]="rc.originalDifference > 0" [class.neg]="rc.originalDifference < 0">{{ rc.originalDifference > 0 ? '+' : '' }}S/ {{ rc.originalDifference | number: '1.2-2' }}</strong></div>
              <div><span>Diferencia pendiente</span><strong [class.pos]="rc.pendingDifference > 0" [class.neg]="rc.pendingDifference < 0" [class.ok]="rc.pendingDifference === 0">{{ rc.pendingDifference > 0 ? '+' : '' }}S/ {{ rc.pendingDifference | number: '1.2-2' }}</strong></div>
            </div>
            @if (rc.reconciliations.length) {
              <div class="recon-list"><div class="rl-t">Regularizaciones posteriores</div>
                @for (r of rc.reconciliations; track r.id) {
                  <div class="rl"><span>{{ r.at | date: 'dd/MM HH:mm' }}</span><span class="rt">{{ reconType(r.type) }}</span><span>{{ r.note || '—' }}</span><span class="ra">−S/ {{ r.amount | number: '1.2-2' }}</span><span class="rb">{{ r.approvedBy || r.by || '' }}</span></div>
                }
              </div>
            }
          </div>
        }

        <div class="bar">
          <span>Total Turno Parcial: <b>S/ {{ d.methodBar.total | number: '1.2-2' }}</b></span>
          <span>Efectivo: <b class="pos">S/ {{ (d.methodBar.byMethod['CASH'] || 0) | number: '1.2-2' }}</b></span>
          <span>Transferencia: <b>S/ {{ (d.methodBar.byMethod['TRANSFER'] || 0) | number: '1.2-2' }}</b></span>
          <span>Yape: <b style="color:#a855f7">S/ {{ (d.methodBar.byMethod['YAPE'] || 0) | number: '1.2-2' }}</b></span>
          <span>Plin: <b style="color:#34d399">S/ {{ (d.methodBar.byMethod['PLIN'] || 0) | number: '1.2-2' }}</b></span>
          <span>Tarjeta: <b style="color:#60a5fa">S/ {{ (d.methodBar.byMethod['CARD'] || 0) | number: '1.2-2' }}</b></span>
          <span>Ingresos: <b class="pos">+S/ {{ d.methodBar.ingresos | number: '1.2-2' }}</b></span>
          <span>Egresos: <b class="neg">-S/ {{ d.methodBar.egresos | number: '1.2-2' }}</b></span>
          <span>Anulaciones: <b class="neg">S/ {{ d.methodBar.anulaciones | number: '1.2-2' }}</b></span>
        </div>

        <div class="filters">
          <label>Tipo: <p-select [options]="typeFilterOpts" optionLabel="label" optionValue="value" [(ngModel)]="typeFilter" styleClass="flt-sm" /></label>
          <label>Método: <p-select [options]="methodFilterOpts" optionLabel="label" optionValue="value" [(ngModel)]="methodFilter" styleClass="flt-sm" /></label>
          <span class="count">Mostrando {{ filteredMovements().length }} de {{ d.movements.length }} movimientos</span>
        </div>

        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Hora</th><th>Tipo</th><th>Descripción</th><th class="r">Monto</th><th class="c">Método</th><th class="c">Estado</th><th class="c">Acción</th></tr></thead>
            <tbody>
              @for (m of filteredMovements(); track m.id) {
                <tr [class.anulado]="m.status === 'ANULADO'">
                  <td>{{ m.time | date: 'HH:mm' }}</td>
                  <td><span class="tbadge" [style.background]="typeBg(m.type)" [style.color]="typeFg(m.type)">{{ typeLabel(m.type) }}</span></td>
                  <td>{{ m.description }}</td>
                  <td class="r">S/ {{ m.amount | number: '1.2-2' }}</td>
                  <td class="c">{{ methodLabel(m.method) }}</td>
                  <td class="c">
                    @if (m.unregistered && m.verify) { <span class="est" [class]="verifyClass(m.verify)">{{ verifyLabel(m.verify) }}</span> }
                    @else { <span class="est" [class.anul]="m.status === 'ANULADO'">{{ m.status }}</span> }
                  </td>
                  <td class="c nowrap">
                    <button class="lnk" (click)="verMovimiento(m)">Ver</button>
                    @if (canEdit && m.status === 'NORMAL') {
                      <button class="lnk red" (click)="anular(m)">Anular</button>
                      <button class="lnk" (click)="openCorrect(m)">Corregir</button>
                    }
                  </td>
                </tr>
              } @empty { <tr><td colspan="7" class="empty">Sin movimientos.</td></tr> }
            </tbody>
          </table>
        </div>
      } @else { <p class="muted">No se pudo cargar la caja.</p> }
    </section>

    <!-- Corregir movimiento -->
    <p-dialog [(visible)]="correctVisible" [modal]="true" header="Corregir movimiento" [style]="{ width: '26rem' }">
      @if (correctTarget(); as m) {
        <p class="muted">{{ m.description }}</p>
        @if (m.saleId) {
          <div class="form"><label>Método de pago correcto</label><p-select [options]="methodEditOpts" optionLabel="label" optionValue="value" [(ngModel)]="correctMethod" styleClass="w" /></div>
        } @else {
          <div class="form">
            <label>Tipo</label><p-select [options]="movTypeOpts" optionLabel="label" optionValue="value" [(ngModel)]="correctMovType" styleClass="w" />
            <label>Monto</label><p-inputNumber [(ngModel)]="correctMovAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
            <label>Concepto</label><input pInputText [(ngModel)]="correctMovConcept" />
          </div>
        }
        <div class="form"><label>Motivo de la corrección (auditoría)</label><input pInputText [(ngModel)]="correctReason" placeholder="Ej. error de digitación" /></div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="correctVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="busy()" (onClick)="doCorrect()" />
      </ng-template>
    </p-dialog>

    <!-- Regularizar venta no registrada -->
    <p-dialog [(visible)]="vnrVisible" [modal]="true" header="Regularizar venta no registrada" [style]="{ width: '30rem', maxWidth: '96vw' }">
      <div class="form">
        <p class="muted">Reclasifica parte del sobrante del turno como una venta que no se registró. No duplica efectivo ni modifica el cierre.</p>
        <label>Producto</label><p-select [options]="vnrProducts()" optionLabel="name" optionValue="id" [(ngModel)]="vnrForm.productId" [filter]="true" filterBy="name" placeholder="Elegir producto" appendTo="body" styleClass="w" />
        <label>Cantidad</label><p-inputNumber [(ngModel)]="vnrForm.quantity" [min]="1" [showButtons]="true" styleClass="w" />
        <label>Importe (S/) — parte del sobrante</label><p-inputNumber [(ngModel)]="vnrForm.amount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label>Observación</label><input pInputText [(ngModel)]="vnrForm.note" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="vnrVisible = false" />
        <p-button label="Regularizar" icon="pi pi-check" [loading]="busy()" (onClick)="saveVnr()" />
      </ng-template>
    </p-dialog>

    <!-- VER detalle de movimiento -->
    <p-dialog [(visible)]="detailModalVisible" [modal]="true" [style]="{ width: '38rem', maxWidth: '96vw' }" header="Detalle del movimiento">
      @if (movDetail(); as x) {
        <div class="vdet">
          <div class="vrow"><span>Fecha / hora</span><b>{{ x.time | date: 'dd/MM/yyyy HH:mm' }}</b></div>
          <div class="vrow"><span>Caja</span><b>#{{ x.sessionNumber ?? '—' }}</b></div>
          <div class="vrow"><span>Registrado por</span><b>{{ x.user || '—' }}</b></div>
          @if (x.kind === 'SALE') {
            @if (x.room) { <div class="vrow"><span>Habitación</span><b>{{ x.room }}</b></div> }
            @if (x.guest) { <div class="vrow"><span>Cliente</span><b>{{ x.guest }}</b></div> }
            @if (x.folio) { <div class="vrow"><span>Folio</span><b>{{ x.folio }}</b></div> }
            @if (x.unregistered) { <div class="vrow"><span>Tipo</span><b class="tag amber">Venta no registrada · {{ verifyLabel(x.verifyStatus || '') }}</b></div> }
            <div class="vrow"><span>Estado</span><b>{{ x.status }}</b></div>
            <div class="vsub">Productos / servicios</div>
            <table class="vtbl"><thead><tr><th>Descripción</th><th class="c">Cant.</th><th class="r">P.Unit</th><th class="r">Subtotal</th></tr></thead>
              <tbody>@for (it of x.items || []; track $index) { <tr><td>{{ it.description }}</td><td class="c">{{ it.quantity }}</td><td class="r">S/ {{ it.unitPrice | number:'1.2-2' }}</td><td class="r">S/ {{ it.subtotal | number:'1.2-2' }}</td></tr> }</tbody>
              <tfoot><tr><td colspan="3" class="r">Total</td><td class="r"><b>S/ {{ x.total | number:'1.2-2' }}</b></td></tr></tfoot>
            </table>
            @if (x.payments?.length) {
              <div class="vsub">Pagos</div>
              @for (p of x.payments!; track $index) { <div class="vrow"><span>{{ methodLabel(p.method) }} @if (p.code) { · cód. {{ p.code }} }</span><b>S/ {{ p.amount | number:'1.2-2' }}</b></div> }
            }
          } @else {
            <div class="vrow"><span>Tipo</span><b>{{ x.type === 'IN' ? 'Ingreso' : 'Egreso' }}</b></div>
            <div class="vrow"><span>Concepto</span><b>{{ x.concept }}</b></div>
            <div class="vrow"><span>Monto</span><b>S/ {{ x.amount | number:'1.2-2' }}</b></div>
            <div class="vrow"><span>Método</span><b>{{ methodLabel(x.method || 'CASH') }}</b></div>
            @if (x.reference) { <div class="vrow"><span>Comprobante</span><b>{{ x.reference }}</b></div> }
            @if (x.note) { <div class="vrow"><span>Observación</span><b>{{ x.note }}</b></div> }
            <div class="vrow"><span>Estado</span><b [class.neg]="x.status === 'ANULADO'">{{ x.status }}</b></div>
            @if (x.status === 'ANULADO') { <div class="vrow"><span>Anulado por</span><b>{{ x.voidedBy || '—' }} · {{ x.voidReason || 's/motivo' }}</b></div> }
          }
          <div class="vsub">Historial de intervenciones</div>
          @if (x.history.length) {
            @for (h of x.history; track h.id) {
              <div class="vhist"><span class="ht">{{ histLabel(h.type) }}</span><span class="hd">{{ h.createdAt | date: 'dd/MM HH:mm' }} · {{ h.user || '—' }}</span>
                @if (h.reason) { <span class="hr">{{ h.reason }}</span> }
                <span class="hj">{{ histChange(h) }}</span>
              </div>
            }
          } @else { <p class="muted sm">Sin correcciones ni anulaciones.</p> }
        </div>
      } @else { <p class="muted">Cargando…</p> }
      <ng-template pTemplate="footer"><p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="detailModalVisible = false" /></ng-template>
    </p-dialog>

    <!-- DEUDAS pendientes al cierre -->
    <p-dialog [(visible)]="deudasVisible" [modal]="true" [style]="{ width: '46rem', maxWidth: '97vw' }" header="Deudas pendientes al cierre">
      @if (detail(); as d) {
        <p class="muted sm">Snapshot de obligaciones del turno al momento del cierre. Aunque se cobren después, permanecen como pendientes de este turno para auditoría.</p>
        <table class="vtbl">
          <thead><tr><th>Hora</th><th>Hab.</th><th>Tipo</th><th>Concepto</th><th>Folio</th><th class="c">Estado</th><th class="r">Importe</th></tr></thead>
          <tbody>
            @for (x of d.deudas || []; track x.saleId) {
              <tr>
                <td>{{ x.time | date: 'HH:mm' }}</td><td>{{ x.room || '—' }}</td>
                <td><span class="tbadge" [style.background]="typeBg(x.tipo)" [style.color]="typeFg(x.tipo)">{{ deudaTipo(x.tipo) }}</span></td>
                <td>{{ x.concepto }}</td><td>{{ x.folio || '—' }}</td>
                <td class="c"><span class="est" [class]="x.estado === 'NO_COBRADA' ? 'warn' : 'pend'">{{ deudaEstado(x.estado) }}</span></td>
                <td class="r">S/ {{ x.importe | number: '1.2-2' }}</td>
              </tr>
            } @empty { <tr><td colspan="7" class="empty">Sin deudas pendientes.</td></tr> }
          </tbody>
          <tfoot><tr><td colspan="6" class="r">Total pendiente</td><td class="r"><b>S/ {{ d.cards.deudasPendientes | number: '1.2-2' }}</b></td></tr></tfoot>
        </table>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="deudasVisible = false" /></ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .wrap { padding: 1.25rem; }
      .muted { color: #8aa0bd; } .empty { text-align: center; padding: 1.5rem; color: #8aa0bd; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      h1 { margin: 0; font-size: 1.35rem; } .turno { margin: 0.2rem 0 0; color: #8aa0bd; font-size: 0.85rem; }
      .dactions { display: flex; gap: 0.5rem; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.4rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; } .mini.warn { background: #78350f; color: #fcd34d; border-color: #b45309; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 0.7rem; margin-bottom: 1rem; }
      .mc { border: 1px solid #243245; border-radius: 10px; padding: 0.7rem 0.9rem; display: flex; flex-direction: column; gap: 0.2rem; background: #131d2b; } .mc span { font-size: 0.72rem; color: #8aa0bd; } .mc strong { font-size: 1.1rem; }
      .mc.blue strong { color: #60a5fa; } .mc.brown strong { color: #fbbf24; } .mc.teal strong { color: #2dd4bf; } .mc.green strong { color: #34d399; } .mc.purple strong { color: #c4b5fd; } .mc.amber strong { color: #f59e0b; }
      .mc.clickable { cursor: pointer; text-align: left; font: inherit; transition: border-color .15s; } .mc.clickable:hover:not([disabled]) { border-color: #3b5a86; } .mc.clickable[disabled] { cursor: default; opacity: 0.75; } .mc.clickable.active { border-color: #f59e0b; }
      .mc em { font-size: 0.68rem; color: #8aa0bd; font-style: normal; } .mc em .ok { color: #34d399; } .mc em .warn { color: #f59e0b; } .mc em .pend { color: #60a5fa; }
      .vdet { display: flex; flex-direction: column; gap: 0.3rem; } .vrow { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.85rem; padding: 0.15rem 0; } .vrow span { color: #8aa0bd; }
      .vsub { margin-top: 0.6rem; font-size: 0.72rem; text-transform: uppercase; color: #8aa0bd; border-top: 1px dashed #1c2c44; padding-top: 0.45rem; }
      .vtbl { width: 100%; border-collapse: collapse; margin-top: 0.3rem; } .vtbl th, .vtbl td { padding: 0.35rem 0.5rem; border-bottom: 1px solid #16233a; font-size: 0.8rem; text-align: left; } .vtbl .r { text-align: right; } .vtbl .c { text-align: center; } .vtbl th { color: #8aa0bd; font-weight: 600; font-size: 0.7rem; } .vtbl tfoot td { border-bottom: 0; }
      .vhist { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; font-size: 0.8rem; padding: 0.3rem 0; border-bottom: 1px dashed #16233a; } .vhist .ht { font-weight: 700; color: #c4b5fd; } .vhist .hd { color: #8aa0bd; font-size: 0.74rem; } .vhist .hr { color: #cbd5e1; } .vhist .hj { color: #8aa0bd; font-size: 0.74rem; width: 100%; }
      .tag { border-radius: 6px; padding: 0.1rem 0.5rem; font-size: 0.72rem; font-weight: 700; } .tag.amber { background: rgba(245,158,11,0.16); color: #f59e0b; }
      .sm { font-size: 0.8rem; } .est.ok { color: #34d399; } .est.warn { color: #f59e0b; } .est.pend { color: #60a5fa; }
      .recon { border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.9rem; background: rgba(139,92,246,0.06); }
      .recon-h { display: flex; align-items: center; justify-content: space-between; gap: 1rem; font-weight: 700; color: #c4b5fd; margin-bottom: 0.5rem; }
      .recon-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; } .recon-grid > div { display: flex; flex-direction: column; gap: 0.15rem; } .recon-grid span { font-size: 0.72rem; color: #8aa0bd; } .recon-grid strong { font-size: 1.02rem; } .recon-grid .ok { color: #34d399; }
      .recon-list { margin-top: 0.6rem; border-top: 1px dashed #1c2c44; padding-top: 0.5rem; } .rl-t { font-size: 0.74rem; color: #8aa0bd; margin-bottom: 0.3rem; text-transform: uppercase; }
      .rl { display: grid; grid-template-columns: 5rem 9rem 1fr auto auto; gap: 0.6rem; align-items: center; font-size: 0.8rem; padding: 0.2rem 0; } .rl .rt { font-weight: 700; color: #c4b5fd; } .rl .ra { color: #f59e0b; font-weight: 700; } .rl .rb { color: #8aa0bd; font-size: 0.74rem; }
      .pos { color: #34d399; } .neg { color: #f87171; }
      .bar { display: flex; flex-wrap: wrap; gap: 0.9rem; padding: 0.6rem 0.8rem; border: 1px solid #1c2c44; border-radius: 10px; font-size: 0.8rem; color: #8aa0bd; margin-bottom: 0.7rem; }
      .filters { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.6rem; flex-wrap: wrap; font-size: 0.85rem; } .filters .count { color: #8aa0bd; }
      .tbl-wrap { overflow-x: auto; } .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.5rem 0.7rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.82rem; } .tbl .r { text-align: right; } .tbl .c { text-align: center; } .tbl .nowrap { white-space: nowrap; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.72rem; }
      tr.anulado td { opacity: 0.5; text-decoration: line-through; }
      .tbadge { border-radius: 6px; padding: 0.1rem 0.5rem; font-size: 0.7rem; font-weight: 700; }
      .est { font-size: 0.72rem; font-weight: 700; color: #34d399; } .est.anul { color: #f87171; }
      .lnk { background: none; border: 0; color: #60a5fa; cursor: pointer; font-size: 0.8rem; padding: 0 0.3rem; } .lnk.red { color: #f87171; }
      .form { display: flex; flex-direction: column; gap: 0.35rem; } .form label { font-size: 0.82rem; color: #8aa0bd; margin-top: 0.4rem; }
      :host ::ng-deep .w, :host ::ng-deep .form input[pInputText], :host ::ng-deep .form .p-inputnumber, :host ::ng-deep .form .p-inputnumber input, :host ::ng-deep .form .p-select { width: 100%; }
      @media (max-width: 720px) { .recon-grid { grid-template-columns: repeat(2,1fr); } }
    `,
  ],
})
export class CashMovementsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly canEdit = this.auth.can('finance', 'edit');
  readonly canReopen = this.auth.can('settings', 'edit'); // reabrir es solo Admin/Superadmin
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly detail = signal<CashDetail | null>(null);
  readonly recon = signal<ReconSummary | null>(null);
  private sessionId = '';

  typeFilter = '';
  methodFilter = '';
  readonly typeFilterOpts = [
    { label: 'Todos', value: '' }, { label: 'Hospedaje', value: 'HOSPEDAJE' }, { label: 'Pago Renovación', value: 'RENOVACION' },
    { label: 'Venta Producto', value: 'PRODUCTO' }, { label: 'Servicio', value: 'SERVICIO' }, { label: 'Ingreso', value: 'INGRESO' }, { label: 'Egreso', value: 'EGRESO' },
    { label: 'Regularizaciones', value: '__REG__' },
  ];
  readonly methodFilterOpts = [
    { label: 'Todos', value: '' }, { label: 'Efectivo', value: 'CASH' }, { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Yape', value: 'YAPE' }, { label: 'Plin', value: 'PLIN' }, { label: 'Tarjeta', value: 'CARD' },
  ];

  // VER detalle
  detailModalVisible = false;
  readonly movDetail = signal<MovementDetail | null>(null);
  // DEUDAS
  deudasVisible = false;

  // Corregir
  correctVisible = false;
  readonly correctTarget = signal<CashDetailMovement | null>(null);
  correctMethod = 'CASH';
  correctMovType: 'IN' | 'OUT' = 'IN';
  correctMovAmount: number | null = null;
  correctMovConcept = '';
  correctReason = '';
  readonly methodEditOpts = [{ label: 'Efectivo', value: 'CASH' }, { label: 'Transferencia', value: 'TRANSFER' }, { label: 'Yape', value: 'YAPE' }, { label: 'Plin', value: 'PLIN' }, { label: 'Tarjeta', value: 'CARD' }];
  readonly movTypeOpts = [{ label: 'Ingreso', value: 'IN' }, { label: 'Egreso', value: 'OUT' }];

  // VNR
  vnrVisible = false;
  vnrForm: { productId: string | null; quantity: number; amount: number | null; note: string } = { productId: null, quantity: 1, amount: null, note: '' };
  readonly vnrProducts = signal<{ id: string; name: string }[]>([]);
  private reconWhId = '';

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload();
  }

  reload(): void {
    if (!this.sessionId) { this.loading.set(false); return; }
    this.loading.set(true);
    this.finance.sessionDetail(this.sessionId).subscribe({
      next: (r) => { this.detail.set(r.data); this.loading.set(false); if (r.data?.session?.status && r.data.session.status !== 'OPEN') this.loadRecon(this.sessionId); },
      error: () => { this.loading.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la caja.' }); },
    });
  }
  private loadRecon(id: string): void { this.http.get<ApiResponse<ReconSummary>>(`${this.api}/cash/${id}/reconciliation`).subscribe({ next: (r) => this.recon.set(r.data), error: () => {} }); }

  methodLabel(k: string): string { return METHOD_LABEL[k] ?? k; }
  typeLabel(k: string): string { return TYPE_LABEL[k] ?? k; }
  typeBg(k: string): string { return (TYPE_COLOR[k] ?? ['rgba(148,163,184,0.18)', '#94a3b8'])[0]; }
  typeFg(k: string): string { return (TYPE_COLOR[k] ?? ['rgba(148,163,184,0.18)', '#94a3b8'])[1]; }
  reconType(t: string): string { return ({ VENTA_NO_REGISTRADA: 'Venta no registrada', PERDIDA_COLABORADOR: 'Pérdida atribuida' } as Record<string, string>)[t] ?? t; }
  readonly filteredMovements = computed<CashDetailMovement[]>(() => {
    const all = this.detail()?.movements ?? [];
    return all.filter((m) => {
      if (this.typeFilter === '__REG__') return !!m.unregistered;
      return (!this.typeFilter || m.type === this.typeFilter) && (!this.methodFilter || m.method === this.methodFilter);
    });
  });

  // ── Etapa 3/4 — ventas no registradas y regularizaciones ──
  verifyLabel(v: string): string { return ({ REGULARIZADA: 'Regularizada', POR_VERIFICAR: 'Por verificar', NO_COBRADA: 'No cobrada' } as Record<string, string>)[v] ?? v; }
  verifyClass(v: string): string { return v === 'REGULARIZADA' ? 'ok' : v === 'NO_COBRADA' ? 'warn' : 'pend'; }
  regsTotal(d: CashDetail): number { const r = d.regularizaciones; return r ? r.cobradas.count + r.noCobradas.count + r.porVerificar.count : 0; }
  toggleRegsFilter(): void { this.typeFilter = this.typeFilter === '__REG__' ? '' : '__REG__'; }

  // ── Etapa 5 — deudas ──
  deudaTipo(t: string): string { return ({ RENOVACION: 'Renovación', HOSPEDAJE: 'Hospedaje', PRODUCTO: 'Producto', SERVICIO: 'Servicio', VENTA_NO_COBRADA: 'Venta no cobrada' } as Record<string, string>)[t] ?? t; }
  deudaEstado(e: string): string { return ({ PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', NO_COBRADA: 'No cobrada' } as Record<string, string>)[e] ?? e; }

  // ── Etapa 2 — VER + historial ──
  histLabel(t: string): string { return ({ CORRECTION: 'Corrección', VOID: 'Anulación', UNREGISTERED_SALE: 'Venta no registrada', REOPEN: 'Reapertura' } as Record<string, string>)[t] ?? t; }
  histChange(h: MovementHistoryEntry): string {
    const b = h.before as Record<string, unknown> | null;
    const a = h.after as Record<string, unknown> | null;
    const fmt = (o: Record<string, unknown> | null) => o ? Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ') : '—';
    if (b && a) return `${fmt(b)} → ${fmt(a)}`;
    if (a) return fmt(a);
    if (b) return fmt(b);
    return '';
  }
  verMovimiento(m: CashDetailMovement): void {
    this.movDetail.set(null);
    this.detailModalVisible = true;
    const params = m.saleId ? { saleId: m.saleId } : { movementId: m.id };
    this.finance.movementDetail(params).subscribe({
      next: (r) => this.movDetail.set(r.data),
      error: () => { this.detailModalVisible = false; this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle.' }); },
    });
  }

  anular(m: CashDetailMovement): void {
    const what = m.saleId ? 'esta venta' : 'este movimiento';
    const reason = prompt(`¿Anular ${what}? Se conserva para auditoría y se excluye del arqueo.\n\nMotivo (auditoría):`, '');
    if (reason === null) return;
    const next = () => { this.messages.add({ severity: 'success', summary: 'Anulado', detail: 'Movimiento anulado.' }); this.reload(); };
    const error = (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo anular.' });
    if (m.saleId) this.finance.cancelSale(m.saleId, reason || undefined).subscribe({ next, error });
    else this.finance.deleteMovement(m.id, reason || undefined).subscribe({ next, error });
  }

  openCorrect(m: CashDetailMovement): void {
    this.correctTarget.set(m);
    this.correctReason = '';
    if (m.saleId) { this.correctMethod = m.method === 'MIXTO' || m.method === 'PENDIENTE' ? 'CASH' : m.method; }
    else { this.correctMovType = m.type === 'EGRESO' ? 'OUT' : 'IN'; this.correctMovAmount = m.amount; this.correctMovConcept = m.description; }
    this.correctVisible = true;
  }
  doCorrect(): void {
    const m = this.correctTarget(); if (!m) return;
    this.busy.set(true);
    const reason = this.correctReason.trim() || undefined;
    const done = () => { this.busy.set(false); this.correctVisible = false; this.messages.add({ severity: 'success', summary: 'Corregido', detail: 'Movimiento actualizado.' }); this.reload(); };
    const fail = (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo corregir.' }); };
    if (m.saleId) { this.finance.correctSale(m.saleId, this.correctMethod, reason).subscribe({ next: done, error: fail }); }
    else {
      if (this.correctMovAmount == null || this.correctMovAmount <= 0 || !this.correctMovConcept.trim()) { this.busy.set(false); this.messages.add({ severity: 'warn', summary: 'Datos', detail: 'Monto y concepto requeridos.' }); return; }
      this.finance.editMovement(m.id, { type: this.correctMovType, amount: this.correctMovAmount, concept: this.correctMovConcept.trim(), reason }).subscribe({ next: done, error: fail });
    }
  }

  reopen(id: string): void {
    if (!confirm('¿Reabrir esta caja? Volverá a estado Abierta.')) return;
    this.finance.reopenSession(id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Caja reabierta', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo reabrir.' }),
    });
  }

  openVnr(): void {
    this.vnrForm = { productId: null, quantity: 1, amount: null, note: '' };
    if (!this.vnrProducts().length) this.http.get<ApiResponse<{ id: string; name: string }[]>>(`${this.api}/products`, { params: { pageSize: '300', status: 'active' } }).subscribe((r) => this.vnrProducts.set(r.data ?? []));
    this.http.get<ApiResponse<{ id: string; type: string }[]>>(`${this.api}/warehouses`, { params: { pageSize: '100' } }).subscribe((r) => { this.reconWhId = (r.data ?? []).find((w) => w.type === 'RECEPTION')?.id ?? ''; });
    this.vnrVisible = true;
  }
  saveVnr(): void {
    const d = this.detail(); if (!d) return;
    if (!this.vnrForm.productId || !this.vnrForm.amount || this.vnrForm.amount <= 0) { this.messages.add({ severity: 'warn', summary: 'Datos', detail: 'Elige producto e importe.' }); return; }
    if (!this.reconWhId) { this.messages.add({ severity: 'warn', summary: 'Almacén', detail: 'No se encontró el almacén de recepción.' }); return; }
    this.busy.set(true);
    const body = { productId: this.vnrForm.productId, warehouseId: this.reconWhId, quantity: this.vnrForm.quantity, amount: this.vnrForm.amount, note: this.vnrForm.note || undefined };
    this.http.post<ApiResponse<unknown>>(`${this.api}/cash/${d.session.id}/reconciliation/unregistered-sale`, body).subscribe({
      next: () => { this.busy.set(false); this.vnrVisible = false; this.messages.add({ severity: 'success', summary: 'Regularizado', detail: '' }); this.loadRecon(d.session.id); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo regularizar.' }); },
    });
  }

  /** Igual que el botón "Ver" de Finanzas › Cajas: abre el cuadre imprimible en una pestaña nueva. */
  verCuadre(d: CashDetail): void {
    const w = window.open('', '_blank');
    if (!w) { this.messages.add({ severity: 'warn', summary: 'Ventana bloqueada', detail: 'Permite ventanas emergentes para ver/imprimir el cuadre.' }); return; }
    w.document.open(); w.document.write(buildCuadreTicket(d)); w.document.close();
  }
}
