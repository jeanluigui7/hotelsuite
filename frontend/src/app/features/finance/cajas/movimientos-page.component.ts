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
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { CashDetail, CashDetailMovement, MovementDetail, MovementHistoryEntry } from '../services/finance.models';
import { buildCuadreTicket } from '../services/cuadre-ticket';
import { downloadCsv } from '../../../core/utils/export';

interface ReconItem { id: string; at: string; type: string; amount: number; affectsCash: boolean; quantity: number | null; note: string | null; by: string | null; approvedBy: string | null; }
interface ReconSummary { expected: number | null; declared: number | null; originalDifference: number; pendingDifference: number; reconciliations: ReconItem[]; }
interface VAuditItem { paymentId: string; saleId: string; concept: string; amount: number; gross: number; commission: number; time: string; }
interface VAuditGroup { method: string; code: string | null; amount: number; grossAmount: number; commissionAmount: number; ops: number; room: string | null; client: string; clientShort: string; concept: string; time: string; state: 'VERIFICADO' | 'PENDIENTE' | 'SIN_CODIGO' | 'EN_REVISION' | 'NO_EXISTE'; duplicate: boolean; items: VAuditItem[]; }
interface VAudit { esperado: { byMethod: Record<string, number>; total: number; grossByMethod?: Record<string, number>; grossTotal?: number; commissionTotal?: number }; groups: VAuditGroup[]; summary: { verifiedAmount: number; verifiedOps: number; pendingAmount: number; sinCodigoCount: number; duplicateCount: number; enRevisionCount: number; noExisteCount?: number; difference: number }; }

const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', YAPE: 'Yape', PLIN: 'Plin', WALLET: 'Billetera', MIXTO: 'Mixto', PENDIENTE: 'Pendiente' };
const TYPE_LABEL: Record<string, string> = { HOSPEDAJE: 'Hospedaje', RENOVACION: 'Pago Renovación', PRODUCTO: 'Venta Producto', SERVICIO: 'Servicio', INGRESO: 'Ingreso', EGRESO: 'Egreso', DEUDA: 'Deuda' };
const TYPE_COLOR: Record<string, [string, string]> = {
  HOSPEDAJE: ['rgba(59,130,246,0.18)', '#60a5fa'], RENOVACION: ['rgba(245,158,11,0.2)', '#f59e0b'], PRODUCTO: ['rgba(245,158,11,0.2)', '#fbbf24'],
  SERVICIO: ['rgba(20,184,166,0.2)', '#2dd4bf'], INGRESO: ['rgba(16,185,129,0.18)', '#34d399'], EGRESO: ['rgba(248,113,113,0.18)', '#f87171'],
  DEUDA: ['rgba(248,113,113,0.2)', '#f87171'],
};

@Component({
  selector: 'app-cash-movements-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule, DatePickerModule],
  template: `
    <section class="wrap">
      @if (loading()) { <p class="muted">Cargando…</p> }
      @else if (detail()) {
        @let d = detail()!;
        <header class="head">
          <div>
            <h1>Movimientos — Caja #{{ d.session.number ?? '—' }} <span class="audit-badge"><i class="pi pi-shield"></i> Vista de auditoría</span></h1>
            <p class="turno">{{ diaTurno(d.session.openedAt) }} · {{ d.session.openedAt | date: 'dd/MM HH:mm' }} — {{ d.session.closedAt ? (d.session.closedAt | date: 'HH:mm') : 'En curso' }} · {{ d.session.openedByName }}
              <span class="stpill" [class.open]="d.session.status === 'OPEN'" [class.adj]="d.session.status === 'AJUSTADA'">{{ estadoLabel(d.session.status) }}</span>
            </p>
          </div>
          <div class="dactions">
            <button class="mini" (click)="verCuadre(d)"><i class="pi pi-print"></i> Ver ticket</button>
            <button class="mini" (click)="exportMovs(d, 'xlsx')"><i class="pi pi-file-excel"></i> XLSX</button>
            <button class="mini" (click)="exportMovs(d, 'csv')"><i class="pi pi-file"></i> CSV</button>
            @if (d.session.status !== 'OPEN' && canReopen) { <button class="mini warn" (click)="reopen(d.session.id)"><i class="pi pi-replay"></i> Reabrir</button> }
          </div>
        </header>

        <!-- Resumen del turno -->
        <div class="cards">
          <div class="mc total"><span>TOTAL RECAUDADO</span><strong>S/ {{ d.methodBar.total | number: '1.2-2' }}</strong></div>
          <div class="mc blue"><span>Hospedaje</span><strong>S/ {{ d.cards.ventasHospedaje | number: '1.2-2' }}</strong></div>
          <div class="mc brown"><span>Productos</span><strong>S/ {{ d.cards.ventasProductos | number: '1.2-2' }}</strong></div>
          <div class="mc teal"><span>Servicios / Penalidades</span><strong>S/ {{ d.cards.serviciosOtros | number: '1.2-2' }}</strong></div>
          <button class="mc red clickable" (click)="deudasVisible = true" [disabled]="!(d.deudas?.length)">
            <span>Deudas pendientes @if (d.deudas?.length) { <i class="pi pi-external-link"></i> }</span>
            <strong>S/ {{ d.cards.deudasPendientes | number: '1.2-2' }}</strong>
            @if (d.deudas?.length) { <em>{{ d.deudas!.length }} obligación(es)</em> }
          </button>
          <button class="mc purple clickable" (click)="ajustesVisible = true">
            <span>Ajustes de caja <i class="pi pi-external-link"></i></span>
            <strong>{{ d.cards.ajustes >= 0 ? '+' : '' }}S/ {{ d.cards.ajustes | number: '1.2-2' }}</strong>
            <em>Ver composición</em>
          </button>
          @if (regsTotal(d) > 0) {
            <button class="mc amber clickable" (click)="setAjustesFilter('REG')">
              <span>Regularizaciones <i class="pi pi-filter"></i></span>
              <strong>S/ {{ (d.regularizaciones!.cobradas.amount + d.regularizaciones!.noCobradas.amount + d.regularizaciones!.porVerificar.amount) | number: '1.2-2' }}</strong>
              <em><b class="ok">{{ d.regularizaciones!.cobradas.count }} cobr.</b> · <b class="warn">{{ d.regularizaciones!.noCobradas.count }} no cobr.</b> · <b class="pend">{{ d.regularizaciones!.porVerificar.count }} x verif.</b></em>
            </button>
          }
        </div>

        <!-- Cobros por método -->
        <section class="mblock">
          <h3><i class="pi pi-wallet"></i> Cobros por método</h3>
          <div class="mcards">
            @for (mm of methodCards; track mm.key) {
              <div class="mcard"><span>{{ mm.label }}</span><strong [style.color]="mm.color">S/ {{ methodAmount(d, mm.key) | number: '1.2-2' }}</strong></div>
            }
          </div>
        </section>

        <!-- Auditoría de efectivo: caja chica + conciliación -->
        <div class="audit2">
          <section class="ablock">
            <h3><i class="pi pi-briefcase"></i> Caja chica</h3>
            <div class="kv"><span>Recibida al abrir</span><b>S/ {{ d.session.openingAmount | number: '1.2-2' }}</b></div>
            <div class="kv"><span>Dejada al cerrar</span><b>{{ d.session.pettyCashLeft != null ? ('S/ ' + (d.session.pettyCashLeft | number: '1.2-2')) : '—' }}</b></div>
            <p class="note"><i class="pi pi-info-circle"></i> La caja chica no es recaudación ni afecta el efectivo esperado a entregar. Se separa antes del conteo por denominaciones.</p>
          </section>
          <section class="ablock">
            <h3><i class="pi pi-balance-scale"></i> Conciliación de efectivo</h3>
            <div class="kv"><span>Efectivo por ventas</span><b>S/ {{ efectivoVentas(d) | number: '1.2-2' }}</b></div>
            <div class="kv"><span>Ajustes que afectan efectivo <button class="lnk" (click)="ajustesVisible = true">Ver detalle</button></span><b [class.pos]="ajusteEfectivo(d) > 0" [class.neg]="ajusteEfectivo(d) < 0">{{ ajusteEfectivo(d) >= 0 ? '+' : '' }}S/ {{ ajusteEfectivo(d) | number: '1.2-2' }}</b></div>
            <div class="kv strong"><span>Efectivo esperado</span><b>S/ {{ esperadoEntregar(d) | number: '1.2-2' }}</b></div>
            <div class="kv"><span>Efectivo contado / declarado</span><b>{{ d.session.closingAmount != null ? ('S/ ' + (d.session.closingAmount | number: '1.2-2')) : '— (en curso)' }}</b></div>
            @if (diferencia(d) !== null) {
              <div class="kv diff" [class.pos]="diferencia(d)! > 0" [class.neg]="diferencia(d)! < 0" [class.ok]="diferencia(d) === 0">
                <span>Diferencia vs esperado</span><b>{{ cuadreLabel(diferencia(d)!) }}</b>
              </div>
            }
            @if (canEdit && recon() && recon()!.pendingDifference > 0) { <button class="mini" style="margin-top:.5rem" (click)="openVnr()"><i class="pi pi-plus"></i> Regularizar venta no registrada</button> }
          </section>
        </div>

        <!-- Conciliación de medios virtuales -->
        @if (vaudit(); as va) {
          @if (va.esperado.total > 0) {
            <section class="ablock virt">
              <h3><i class="pi pi-qrcode"></i> Conciliación de medios virtuales
                <button class="mini" style="margin-left:auto" (click)="openAudit()"><i class="pi pi-verified"></i> Auditar medios de pago virtuales</button>
              </h3>
              <div class="mcards">
                @for (mm of methodCards; track mm.key) {
                  @if (mm.key !== 'CASH' && (va.esperado.byMethod[mm.key] || 0) > 0) {
                    <div class="mcard"><span>{{ mm.label }}</span><strong [style.color]="mm.color">S/ {{ va.esperado.byMethod[mm.key] | number: '1.2-2' }}</strong></div>
                  }
                }
                <div class="mcard"><span>Total virtual esperado</span><strong>S/ {{ va.esperado.total | number: '1.2-2' }}</strong></div>
              </div>
              <div class="vsum">
                <span class="ok">Verificado: S/ {{ va.summary.verifiedAmount | number: '1.2-2' }} ({{ va.summary.verifiedOps }} ops)</span>
                <span class="pend">Pendiente: S/ {{ va.summary.pendingAmount | number: '1.2-2' }}</span>
                @if (va.summary.sinCodigoCount > 0) { <span class="warn">Sin código: {{ va.summary.sinCodigoCount }}</span> }
                @if (va.summary.duplicateCount > 0) { <span class="warn">Duplicados: {{ va.summary.duplicateCount }}</span> }
                <span class="diff" [class.ok]="va.summary.difference === 0">Diferencia: {{ vDiffLabel(va.summary.difference) }}</span>
              </div>
              <p class="note"><i class="pi pi-info-circle"></i> Los pagos virtuales no afectan el arqueo físico de efectivo.</p>
            </section>
          }
        }

        <div class="filters">
          <label>Tipo: <p-select [options]="typeFilterOpts" optionLabel="label" optionValue="value" [ngModel]="typeFilter()" (ngModelChange)="onTypeFilter($event)" styleClass="flt-sm" /></label>
          @if (typeFilter() === 'AJUSTES') {
            <label>Subtipo: <p-select [options]="ajusteSubOpts" optionLabel="label" optionValue="value" [ngModel]="ajusteSub()" (ngModelChange)="ajusteSub.set($event)" styleClass="flt-sm" /></label>
          }
          <label>Método: <p-select [options]="methodFilterOpts" optionLabel="label" optionValue="value" [ngModel]="methodFilter()" (ngModelChange)="methodFilter.set($event)" styleClass="flt-sm" /></label>
          <span class="count">Mostrando {{ filteredMovements().length }} de {{ d.movements.length }} movimientos</span>
        </div>

        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Hora</th><th class="c">Hab.</th><th>Tipo</th><th>Descripción</th><th class="r">Monto</th><th class="c">Método</th><th class="c">Estado</th><th class="c">Acción</th></tr></thead>
            <tbody>
              @for (m of filteredMovements(); track m.id) {
                <tr [class.anulado]="m.status === 'ANULADO'" [class.deuda]="m.type === 'DEUDA'">
                  <td>{{ m.time | date: 'HH:mm' }}</td>
                  <td class="c">{{ m.room || '—' }}</td>
                  <td><span class="tbadge" [style.background]="typeBg(m.type)" [style.color]="typeFg(m.type)">{{ typeLabel(m.type) }}</span></td>
                  <td>{{ m.description }}</td>
                  <td class="r">S/ {{ m.amount | number: '1.2-2' }}</td>
                  <td class="c">{{ methodLabel(m.method) }}</td>
                  <td class="c">
                    @if (m.type === 'DEUDA') { <span class="est warn">Pendiente</span> }
                    @else if (m.unregistered && m.verify) { <span class="est" [class]="verifyClass(m.verify)">{{ verifyLabel(m.verify) }}</span> }
                    @else { <span class="est" [class.anul]="m.status === 'ANULADO'">{{ m.status }}</span> }
                  </td>
                  <td class="c nowrap">
                    @if (m.type === 'DEUDA') {
                      @if (canEdit) { <button class="lnk green" (click)="openRegularize(m)">Regularizar</button> }
                    } @else {
                      <button class="lnk" (click)="verMovimiento(m)">Ver</button>
                      @if (canEdit && m.status === 'NORMAL') {
                        <button class="lnk red" (click)="anular(m)">Anular</button>
                        <button class="lnk" (click)="openCorrect(m)">Corregir</button>
                      }
                    }
                  </td>
                </tr>
              } @empty { <tr><td colspan="8" class="empty">Sin movimientos.</td></tr> }
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
              @for (p of x.payments!; track $index) {
                <div class="vrow"><span>{{ methodLabel(p.method) }} @if (p.code) { · cód. {{ p.code }} }</span><b>S/ {{ p.amount | number:'1.2-2' }}</b></div>
                @if (p.commission) { <div class="vrow sub"><span>↳ Cobrado en POS (neto + comisión {{ p.commissionPct }}%)</span><b>S/ {{ p.grossCharged | number:'1.2-2' }}</b></div> }
              }
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
                <td class="c"><span class="est" [class]="x.estado === 'NO_COBRADA' || x.estado === 'SIN_REGISTRAR' ? 'warn' : 'pend'">{{ deudaEstado(x.estado) }}</span></td>
                <td class="r">S/ {{ x.importe | number: '1.2-2' }}</td>
              </tr>
            } @empty { <tr><td colspan="7" class="empty">Sin deudas pendientes.</td></tr> }
          </tbody>
          <tfoot><tr><td colspan="6" class="r">Total pendiente</td><td class="r"><b>S/ {{ d.cards.deudasPendientes | number: '1.2-2' }}</b></td></tr></tfoot>
        </table>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="deudasVisible = false" /></ng-template>
    </p-dialog>

    <!-- Regularizar / cobrar deuda -->
    <p-dialog [(visible)]="regVisible" [modal]="true" header="Regularizar deuda" [style]="{ width: '32rem', maxWidth: '97vw' }">
      @if (regTarget(); as m) {
        <p class="muted sm">{{ m.description }}@if (m.room) { · Hab. {{ m.room }} }</p>
        <div class="form">
          <label>Importe a regularizar (S/)</label>
          <p-inputNumber [(ngModel)]="regAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />

          <label>¿Cuándo se recibió realmente el pago?</label>
          <div class="modes">
            <label class="mode"><input type="radio" name="regmode" value="HISTORICAL" [(ngModel)]="regMode" /> Ya fue pagado en el turno original</label>
            <label class="mode"><input type="radio" name="regmode" value="NOW" [(ngModel)]="regMode" /> Lo estoy cobrando ahora</label>
          </div>

          @if (regMode === 'HISTORICAL') {
            <label>Caja / turno original</label>
            <p-select [options]="cajaOpts()" optionLabel="label" optionValue="value" [(ngModel)]="regTargetSession" [filter]="true" filterBy="label" placeholder="Elegir la caja donde ocurrió" appendTo="body" styleClass="w" [loading]="cajasLoading()" />
            <label>Fecha y hora del pago</label>
            <p-datepicker [(ngModel)]="regPaidAt" [showTime]="true" hourFormat="12" dateFormat="dd/mm/yy" appendTo="body" styleClass="w" [showIcon]="true" />
          }

          <label>Medio de pago</label>
          <p-select [options]="methodEditOpts" optionLabel="label" optionValue="value" [(ngModel)]="regMethod" (onChange)="onRegMethod()" appendTo="body" styleClass="w" />
          @if (regNeedsCode()) {
            <label>Código de verificación / operación</label>
            <input pInputText [(ngModel)]="regCode" placeholder="N° de operación (obligatorio)" />
          }
          <label>Observación (opcional)</label>
          <input pInputText [(ngModel)]="regNote" maxlength="200" placeholder="Ej. pago al ingreso por Yape, no registrado en caja" />

          @if (regMode === 'HISTORICAL') {
            <p class="infobox"><i class="pi pi-info-circle"></i> Esta acción ajusta la caja y turno originales para fines de auditoría. <b>No se sumará dinero al turno actual.</b></p>
          } @else {
            <p class="infobox now"><i class="pi pi-wallet"></i> El pago ingresará al <b>turno abierto actual</b> con la fecha de hoy.</p>
          }
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="regVisible = false" />
        <p-button [label]="regMode === 'HISTORICAL' ? 'Regularizar pago histórico' : 'Registrar cobro'" icon="pi pi-check" [loading]="busy()" [disabled]="!regCanSave()" (onClick)="doRegularize()" />
      </ng-template>
    </p-dialog>

    <!-- Composición de Ajustes de caja -->
    <p-dialog [(visible)]="ajustesVisible" [modal]="true" [style]="{ width: '42rem', maxWidth: '97vw' }" header="Ajustes de caja — composición">
      @if (detail(); as d) {
        <div class="recon-grid" style="margin-bottom:.7rem">
          <div><span>Ingresos</span><strong class="pos">+S/ {{ d.methodBar.ingresos | number: '1.2-2' }}</strong></div>
          <div><span>Egresos</span><strong class="neg">-S/ {{ d.methodBar.egresos | number: '1.2-2' }}</strong></div>
          <div><span>Neto (afecta efectivo)</span><strong>{{ ajusteEfectivo(d) >= 0 ? '+' : '' }}S/ {{ ajusteEfectivo(d) | number: '1.2-2' }}</strong></div>
        </div>
        <p class="muted sm">Los ajustes son movimientos económicos del turno (ingresos, egresos, vuelto, regularización). Los ingresos de efectivo suman al esperado; los virtuales no.</p>
        <table class="vtbl">
          <thead><tr><th>Hora</th><th>Tipo</th><th>Descripción</th><th class="c">Método</th><th class="r">Monto</th></tr></thead>
          <tbody>
            @for (m of ajusteMovs(); track m.id) {
              <tr><td>{{ m.time | date: 'HH:mm' }}</td><td>{{ ajusteTipo(m) }}</td><td>{{ m.description }}</td><td class="c">{{ methodLabel(m.method) }}</td><td class="r">S/ {{ m.amount | number: '1.2-2' }}</td></tr>
            } @empty { <tr><td colspan="5" class="empty">Sin ajustes en este turno.</td></tr> }
          </tbody>
        </table>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="ajustesVisible = false" /></ng-template>
    </p-dialog>

    <!-- Auditar medios de pago virtuales -->
    <p-dialog [(visible)]="auditVisible" [modal]="true" [style]="{ width: '70rem', maxWidth: '98vw' }" header="Auditar medios de pago virtuales">
      @if (vaudit(); as va) {
        <div class="vsum" style="margin-bottom:.5rem">
          <span>Total esperado: <b>S/ {{ va.esperado.total | number: '1.2-2' }}</b></span>
          <span class="ok">Verificado: S/ {{ va.summary.verifiedAmount | number: '1.2-2' }}</span>
          <span class="pend">Pendiente: S/ {{ va.summary.pendingAmount | number: '1.2-2' }}</span>
          <span class="diff" [class.ok]="va.summary.difference === 0">{{ vDiffLabel(va.summary.difference) }}</span>
        </div>
        @if (va.esperado.commissionTotal) {
          <div class="vsum posbar" style="margin-bottom:.5rem"><span>Cobrado en POS (neto + comisión): <b>S/ {{ va.esperado.grossTotal | number: '1.2-2' }}</b></span><span class="muted">Comisión POS retenida: S/ {{ va.esperado.commissionTotal | number: '1.2-2' }}</span></div>
        }
        <p class="muted sm" style="margin:.2rem 0 .6rem">Operaciones agrupadas por método + código. Si un mismo código cubre varias líneas, aparecen juntas (un solo pago).</p>

        <!-- Filtros por método + buscador -->
        <div class="afilters">
          <div class="fchips">
            @for (f of methodChips(); track f.key) {
              <button class="fchip" [class.on]="auditMethod() === f.key" (click)="setAuditMethod(f.key)">
                <span class="flbl">{{ f.label }} ({{ f.count }})</span>
                @if (f.key !== 'ALL') { <span class="fver">Verificados: {{ f.verified }}</span> }
              </button>
            }
          </div>
          <div class="asearch"><i class="pi pi-search"></i><input pInputText [ngModel]="auditSearch()" (ngModelChange)="onAuditSearch($event)" placeholder="Buscar nombre, código o hab…" /></div>
        </div>

        <!-- Tabla compacta -->
        <div class="atbl-wrap">
          <table class="atbl">
            <thead>
              <tr>
                <th>Hab.</th><th>Método</th><th>Nombre</th>
                <th class="srt" (click)="toggleHoraSort()">Hora {{ horaSortAsc() ? '↑' : '↓' }}</th>
                <th class="r">Monto</th><th>Código</th><th>Estado</th><th class="r">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (g of pagedAudit(); track vAuditKey(g)) {
                <tr [class.dup]="g.duplicate">
                  <td class="hab">{{ g.room || '—' }}</td>
                  <td><span class="mtag {{ methodClass(g.method) }}">{{ methodLabel(g.method) }}</span></td>
                  <td class="nm"><span [title]="g.client">{{ g.clientShort || g.client }}</span>@if (g.concept) { <em>{{ g.concept }}</em> }</td>
                  <td class="hr">{{ g.time | date: 'HH:mm' }}</td>
                  <td class="r amt"><b>S/ {{ g.amount | number: '1.2-2' }}</b>@if (g.commissionAmount) { <em class="posit">POS {{ g.grossAmount | number: '1.2-2' }}</em> }</td>
                  <td class="cod">{{ g.code || '—' }}@if (g.duplicate) { <span class="dupt">dup</span> }</td>
                  <td><span class="est {{ vStateClass(g.state) }}">{{ vStateLabel(g.state) }}</span></td>
                  <td class="acts">
                    @if (!canEdit) { <span class="muted sm">—</span> }
                    @else if (auditingCode() === vAuditKey(g)) {
                      <input pInputText class="codein" [(ngModel)]="auditCodeInput" placeholder="Código" />
                      <button class="ab save" [disabled]="busy()" (click)="confirmSetCode(g)">Guardar</button>
                      <button class="ab x" (click)="auditingCode.set('')" title="Cancelar"><i class="pi pi-times"></i></button>
                    } @else {
                      <button class="ab ok" [disabled]="busy() || g.state === 'VERIFICADO'" (click)="verifyGroup(g)"><i class="pi pi-check"></i> Verificar</button>
                      <button class="ab edit" [disabled]="busy()" (click)="startSetCode(g)"><i class="pi pi-pencil"></i> Editar código</button>
                      <button class="ab no" [disabled]="busy() || g.state === 'NO_EXISTE'" (click)="markNotFound(g)"><i class="pi pi-times"></i> No existente</button>
                    }
                  </td>
                </tr>
              } @empty { <tr><td colspan="8" class="empty">Sin operaciones para este filtro.</td></tr> }
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div class="apag">
          <span>Mostrar
            <select [ngModel]="auditPageSize()" (ngModelChange)="auditPageSize.set(+$event); auditPage.set(0)"><option [ngValue]="10">10</option><option [ngValue]="20">20</option><option [ngValue]="50">50</option></select>
            de {{ filteredAudit().length }} movimientos
          </span>
          @if (auditPages().length > 1) {
            <div class="apag-nav">
              <button [disabled]="auditPage() === 0" (click)="auditPage.set(auditPage() - 1)">‹</button>
              @for (p of auditPages(); track p) { <button [class.on]="p === auditPage()" (click)="auditPage.set(p)">{{ p + 1 }}</button> }
              <button [disabled]="auditPage() >= auditPages().length - 1" (click)="auditPage.set(auditPage() + 1)">›</button>
            </div>
          }
        </div>
      }
      <ng-template pTemplate="footer"><p-button label="Finalizar auditoría" icon="pi pi-check" (onClick)="finalizeAudit()" /></ng-template>
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
      .mc.total { background: linear-gradient(135deg, rgba(16,185,129,0.18), rgba(15,26,43,0.4)); border-color: rgba(16,185,129,0.5); } .mc.total span { color: #6ee7b7; font-weight: 700; letter-spacing: 0.5px; } .mc.total strong { color: #34d399; font-size: 1.5rem; }
      .mc.red strong { color: #f87171; }
      .audit-badge { font-size: 0.68rem; font-weight: 700; color: #a5b4fc; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.35); border-radius: 999px; padding: 0.15rem 0.6rem; vertical-align: middle; margin-left: 0.5rem; }
      .stpill { font-size: 0.7rem; font-weight: 700; border-radius: 999px; padding: 0.1rem 0.55rem; background: rgba(148,163,184,0.2); color: #cbd5e1; margin-left: 0.4rem; } .stpill.open { background: rgba(16,185,129,0.2); color: #34d399; } .stpill.adj { background: rgba(245,158,11,0.2); color: #fbbf24; }
      .mblock { margin-bottom: 1rem; } .mblock h3, .ablock h3 { margin: 0 0 0.5rem; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; color: #cbd5e1; }
      .mcards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); gap: 0.6rem; }
      .mcard { border: 1px solid #243245; border-radius: 9px; padding: 0.55rem 0.7rem; background: #131d2b; display: flex; flex-direction: column; gap: 0.15rem; } .mcard span { font-size: 0.72rem; color: #8aa0bd; } .mcard strong { font-size: 1.02rem; }
      .audit2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-bottom: 1rem; }
      .ablock { border: 1px solid #1c2c44; border-radius: 10px; padding: 0.8rem 0.9rem; background: #131d2b; }
      .ablock .kv { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.25rem 0; font-size: 0.86rem; } .ablock .kv span { color: #8aa0bd; } .ablock .kv.strong { border-top: 1px dashed #1c2c44; margin-top: 0.2rem; padding-top: 0.4rem; } .ablock .kv.strong b { font-size: 1.05rem; }
      .ablock .kv.diff { border-top: 1px solid #1c2c44; margin-top: 0.2rem; padding-top: 0.4rem; } .ablock .kv.diff.pos b { color: #34d399; } .ablock .kv.diff.neg b { color: #f87171; } .ablock .kv.diff.ok b { color: #34d399; }
      .ablock .note { font-size: 0.74rem; color: #8aa0bd; margin: 0.5rem 0 0; display: flex; gap: 0.4rem; }
      @media (max-width: 720px) { .audit2 { grid-template-columns: 1fr; } }
      .ablock.virt { margin-bottom: 1rem; } .ablock.virt h3 { display: flex; align-items: center; gap: 0.4rem; }
      .vsum { display: flex; flex-wrap: wrap; gap: 0.9rem; font-size: 0.82rem; margin: 0.5rem 0; } .vsum .ok { color: #34d399; } .vsum .pend { color: #60a5fa; } .vsum .warn { color: #f59e0b; } .vsum .diff { font-weight: 700; color: #f59e0b; } .vsum .diff.ok { color: #34d399; }
      .vsum.posbar { padding: 0.45rem 0.7rem; background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.25); border-radius: 8px; } .vsum.posbar b { color: #93c5fd; }
      .posit { color: #93c5fd; font-style: normal; font-weight: 600; }
      .agroups { display: flex; flex-direction: column; gap: 0.6rem; max-height: 55vh; overflow-y: auto; }
      .agroup { border: 1px solid #243245; border-radius: 9px; padding: 0.6rem 0.8rem; background: #131d2b; } .agroup.dup { border-color: #b45309; }
      .ag-head { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; } .ag-code { font-size: 0.9rem; } .ag-code .dupt { color: #f59e0b; font-size: 0.7rem; margin-left: 0.4rem; } .ag-amt { color: #8aa0bd; font-size: 0.82rem; margin-left: auto; }
      .ag-items { margin: 0.4rem 0; border-top: 1px dashed #1c2c44; padding-top: 0.35rem; } .ag-it { display: flex; justify-content: space-between; font-size: 0.8rem; padding: 0.1rem 0; color: #cbd5e1; } .ag-it span { color: #8aa0bd; }
      .ag-actions { display: flex; gap: 0.9rem; } .ag-edit { display: flex; gap: 0.5rem; align-items: center; } .ag-ok { color: #34d399; font-weight: 700; font-size: 0.85rem; }
      :host ::ng-deep .ag-edit input[pInputText] { flex: 1; }
      /* Tabla compacta de auditoría virtual */
      .afilters { display: flex; gap: 0.8rem; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 0.6rem; }
      .fchips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .fchip { display: flex; flex-direction: column; align-items: flex-start; gap: 0.05rem; background: #131d2b; border: 1px solid #243245; border-radius: 9px; padding: 0.35rem 0.7rem; cursor: pointer; color: #cbd5e1; min-width: 4.5rem; }
      .fchip:hover { border-color: #3b5a86; } .fchip.on { border-color: #60a5fa; background: rgba(96,165,250,0.12); }
      .fchip .flbl { font-size: 0.82rem; font-weight: 700; } .fchip .fver { font-size: 0.68rem; color: #8aa0bd; }
      .asearch { position: relative; display: flex; align-items: center; } .asearch i { position: absolute; left: 0.6rem; color: #8aa0bd; font-size: 0.8rem; }
      :host ::ng-deep .asearch input[pInputText] { padding-left: 1.9rem; min-width: 15rem; font-size: 0.82rem; }
      .atbl-wrap { max-height: 52vh; overflow-y: auto; border: 1px solid #1c2c44; border-radius: 9px; }
      .atbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .atbl thead th { position: sticky; top: 0; background: #0f1928; color: #8aa0bd; font-weight: 600; text-align: left; padding: 0.5rem 0.6rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid #1c2c44; z-index: 1; }
      .atbl th.r, .atbl td.r { text-align: right; } .atbl th.srt { cursor: pointer; user-select: none; } .atbl th.srt:hover { color: #cbd5e1; }
      .atbl tbody td { padding: 0.45rem 0.6rem; border-bottom: 1px solid #16233649; color: #e2e8f0; vertical-align: middle; }
      .atbl tbody tr:hover { background: rgba(96,165,250,0.05); } .atbl tbody tr.dup { background: rgba(180,83,9,0.08); }
      .atbl td.hab { font-weight: 700; color: #cbd5e1; } .atbl td.hr { color: #cbd5e1; font-variant-numeric: tabular-nums; }
      .atbl td.nm span { display: block; font-weight: 600; } .atbl td.nm em { display: block; font-size: 0.72rem; color: #8aa0bd; font-style: normal; }
      .atbl td.amt b { font-variant-numeric: tabular-nums; } .atbl td.amt em { display: block; font-size: 0.68rem; }
      .atbl td.cod { font-variant-numeric: tabular-nums; letter-spacing: 0.4px; } .atbl td.cod .dupt { color: #f59e0b; font-size: 0.62rem; margin-left: 0.25rem; }
      .mtag { display: inline-flex; align-items: center; font-size: 0.72rem; font-weight: 700; padding: 0.12rem 0.5rem; border-radius: 999px; }
      .mtag.yape { background: rgba(168,85,247,0.18); color: #c4b5fd; } .mtag.plin { background: rgba(20,184,166,0.18); color: #2dd4bf; } .mtag.card { background: rgba(96,165,250,0.18); color: #93c5fd; } .mtag.transfer { background: rgba(245,158,11,0.18); color: #fbbf24; } .mtag.other { background: rgba(148,163,184,0.18); color: #cbd5e1; }
      .est.no { color: #f87171; }
      .atbl td.acts { white-space: nowrap; text-align: right; } .atbl td.acts .ab { border: 1px solid transparent; border-radius: 6px; padding: 0.25rem 0.5rem; font-size: 0.72rem; font-weight: 600; cursor: pointer; margin-left: 0.3rem; background: #13243a; color: #cbd5e1; }
      .ab.ok { border-color: rgba(52,211,153,0.5); color: #6ee7b7; } .ab.ok:hover:not(:disabled) { background: rgba(52,211,153,0.14); }
      .ab.edit { border-color: rgba(96,165,250,0.5); color: #93c5fd; } .ab.edit:hover:not(:disabled) { background: rgba(96,165,250,0.14); }
      .ab.no { border-color: rgba(248,113,113,0.5); color: #fca5a5; } .ab.no:hover:not(:disabled) { background: rgba(248,113,113,0.14); }
      .ab.save { border-color: rgba(52,211,153,0.5); color: #6ee7b7; } .ab.x { color: #94a3b8; } .ab:disabled { opacity: 0.4; cursor: not-allowed; }
      :host ::ng-deep .atbl td.acts input.codein { width: 6.5rem; padding: 0.25rem 0.4rem; font-size: 0.75rem; }
      .apag { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.6rem; font-size: 0.8rem; color: #8aa0bd; flex-wrap: wrap; }
      .apag select { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 6px; padding: 0.2rem 0.4rem; margin: 0 0.2rem; }
      .apag-nav { display: flex; gap: 0.25rem; } .apag-nav button { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 6px; min-width: 1.9rem; padding: 0.25rem 0.4rem; cursor: pointer; } .apag-nav button.on { border-color: #60a5fa; background: rgba(96,165,250,0.16); color: #93c5fd; } .apag-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
      .vdet { display: flex; flex-direction: column; gap: 0.3rem; } .vrow { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.85rem; padding: 0.15rem 0; } .vrow span { color: #8aa0bd; }
      .vrow.sub { font-size: 0.78rem; padding: 0 0 0.15rem 0; margin-top: -0.1rem; } .vrow.sub span, .vrow.sub b { color: #6b7f9c; font-weight: 500; }
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
      .lnk { background: none; border: 0; color: #60a5fa; cursor: pointer; font-size: 0.8rem; padding: 0 0.3rem; } .lnk.red { color: #f87171; } .lnk.green { color: #34d399; font-weight: 700; }
      tr.deuda td { background: rgba(248,113,113,0.05); } .est.warn { color: #f59e0b; }
      .form { display: flex; flex-direction: column; gap: 0.35rem; } .form label { font-size: 0.82rem; color: #8aa0bd; margin-top: 0.4rem; }
      .modes { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.2rem; }
      .mode { display: flex; align-items: center; gap: 0.5rem; font-size: 0.86rem; color: #cbd5e1; cursor: pointer; margin: 0; } .mode input { width: auto; }
      .infobox { display: flex; gap: 0.5rem; align-items: flex-start; margin-top: 0.8rem; padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.8rem; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: #93c5fd; } .infobox.now { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); color: #6ee7b7; }
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

  // Signals para que el computed filteredMovements reaccione al cambiar los filtros.
  readonly typeFilter = signal('');
  readonly ajusteSub = signal(''); // subtipo dentro de "Ajustes": '' | INGRESO | EGRESO | VUELTO | REG
  readonly methodFilter = signal('');
  readonly typeFilterOpts = [
    { label: 'Todos', value: '' }, { label: 'Hospedaje', value: 'HOSPEDAJE' },
    { label: 'Venta producto', value: 'PRODUCTO' }, { label: 'Servicio', value: 'SERVICIO' }, { label: 'Ajustes', value: 'AJUSTES' },
  ];
  readonly ajusteSubOpts = [
    { label: 'Todos', value: '' }, { label: 'Ingreso', value: 'INGRESO' }, { label: 'Egreso', value: 'EGRESO' },
    { label: 'Vuelto', value: 'VUELTO' }, { label: 'Regularización', value: 'REG' },
  ];
  readonly methodFilterOpts = [
    { label: 'Todos', value: '' }, { label: 'Efectivo', value: 'CASH' }, { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Yape', value: 'YAPE' }, { label: 'Plin', value: 'PLIN' }, { label: 'Tarjeta', value: 'CARD' }, { label: 'Vuelto', value: 'VUELTO' },
  ];
  // Cobros por método (cards compactas).
  readonly methodCards = [
    { key: 'CASH', label: 'Efectivo', color: '#34d399' }, { key: 'YAPE', label: 'Yape', color: '#a855f7' },
    { key: 'CARD', label: 'Tarjeta', color: '#60a5fa' }, { key: 'TRANSFER', label: 'Transferencia', color: '#cbd5e1' },
    { key: 'PLIN', label: 'Plin', color: '#34d399' }, { key: 'OTROS', label: 'Otros', color: '#fbbf24' },
  ];
  ajustesVisible = false; // modal de composición de ajustes
  // Auditoría de medios virtuales
  readonly vaudit = signal<VAudit | null>(null);
  auditVisible = false;
  readonly auditingCode = signal<string>(''); // grupo en edición de código (method|code)
  auditCodeInput = '';
  // Filtros/orden/paginación de la tabla de auditoría (persisten entre acciones).
  readonly auditMethod = signal<'ALL' | 'YAPE' | 'PLIN' | 'CARD' | 'TRANSFER'>('ALL');
  readonly auditSearch = signal('');
  readonly horaSortAsc = signal(false); // por defecto: más reciente primero (desc)
  readonly auditPage = signal(0);
  readonly auditPageSize = signal(10);
  // Chips de método con conteo total y verificados (derivados de los grupos).
  readonly methodChips = computed(() => {
    const groups = this.vaudit()?.groups ?? [];
    const defs: { key: 'ALL' | 'YAPE' | 'PLIN' | 'CARD' | 'TRANSFER'; label: string }[] = [
      { key: 'ALL', label: 'Todos' }, { key: 'YAPE', label: 'Yape' }, { key: 'PLIN', label: 'Plin' },
      { key: 'CARD', label: 'Tarjeta' }, { key: 'TRANSFER', label: 'Transferencia' },
    ];
    return defs.map((d) => {
      const rows = d.key === 'ALL' ? groups : groups.filter((g) => g.method === d.key);
      return { ...d, count: rows.length, verified: rows.filter((g) => g.state === 'VERIFICADO').length };
    });
  });
  // Grupos filtrados por método + búsqueda, ordenados por hora.
  readonly filteredAudit = computed(() => {
    const groups = this.vaudit()?.groups ?? [];
    const m = this.auditMethod();
    const q = this.auditSearch().trim().toLowerCase();
    const asc = this.horaSortAsc();
    let rows = m === 'ALL' ? groups.slice() : groups.filter((g) => g.method === m);
    if (q) rows = rows.filter((g) => (g.client || '').toLowerCase().includes(q) || (g.code || '').toLowerCase().includes(q) || (g.room || '').toLowerCase().includes(q));
    rows.sort((a, b) => asc ? a.time.localeCompare(b.time) : b.time.localeCompare(a.time));
    return rows;
  });
  readonly auditPages = computed(() => {
    const n = Math.ceil(this.filteredAudit().length / this.auditPageSize());
    return Array.from({ length: Math.max(1, n) }, (_, i) => i);
  });
  readonly pagedAudit = computed(() => {
    const size = this.auditPageSize();
    const start = this.auditPage() * size;
    return this.filteredAudit().slice(start, start + size);
  });

  // VER detalle
  detailModalVisible = false;
  readonly movDetail = signal<MovementDetail | null>(null);
  // DEUDAS
  deudasVisible = false;
  // Regularizar deuda
  regVisible = false;
  readonly regTarget = signal<CashDetailMovement | null>(null);
  regAmount: number | null = null;
  regMethod = 'CASH';
  regCode = '';
  regMode: 'HISTORICAL' | 'NOW' = 'HISTORICAL';
  regTargetSession: string | null = null;
  regPaidAt: Date | null = null;
  regNote = '';
  // Cajas seleccionables como "caja original" (cerradas/ajustadas/abiertas).
  readonly cajas = signal<{ id: string; number: number | null; status: string; openedAt: string; closedAt: string | null; openedByName: string }[]>([]);
  readonly cajasLoading = signal(false);
  readonly cajaOpts = computed(() => this.cajas().map((c) => ({ value: c.id, label: this.cajaLabel(c) })));

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
      next: (r) => { this.detail.set(r.data); this.loading.set(false); if (r.data?.session?.status && r.data.session.status !== 'OPEN') this.loadRecon(this.sessionId); this.loadVAudit(); },
      error: () => { this.loading.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la caja.' }); },
    });
  }
  private loadVAudit(): void {
    this.http.get<ApiResponse<VAudit>>(`${this.api}/cash/sessions/${this.sessionId}/virtual-audit`).subscribe({ next: (r) => this.vaudit.set(r.data), error: () => this.vaudit.set(null) });
  }
  private loadRecon(id: string): void { this.http.get<ApiResponse<ReconSummary>>(`${this.api}/cash/${id}/reconciliation`).subscribe({ next: (r) => this.recon.set(r.data), error: () => {} }); }

  methodLabel(k: string): string { return METHOD_LABEL[k] ?? k; }
  typeLabel(k: string): string { return TYPE_LABEL[k] ?? k; }
  typeBg(k: string): string { return (TYPE_COLOR[k] ?? ['rgba(148,163,184,0.18)', '#94a3b8'])[0]; }
  typeFg(k: string): string { return (TYPE_COLOR[k] ?? ['rgba(148,163,184,0.18)', '#94a3b8'])[1]; }
  reconType(t: string): string { return ({ VENTA_NO_REGISTRADA: 'Venta no registrada', PERDIDA_COLABORADOR: 'Pérdida atribuida' } as Record<string, string>)[t] ?? t; }
  private isVuelto(m: CashDetailMovement): boolean { return m.method === 'VUELTO' || /vuelto/i.test(m.description || ''); }
  private isAjuste(m: CashDetailMovement): boolean { return m.type === 'INGRESO' || m.type === 'EGRESO' || !!m.unregistered || this.isVuelto(m); }
  readonly filteredMovements = computed<CashDetailMovement[]>(() => {
    const all = this.detail()?.movements ?? [];
    const type = this.typeFilter();
    const sub = this.ajusteSub();
    const method = this.methodFilter();
    return all.filter((m) => {
      if (method && m.method !== method) return false;
      if (!type) return true;
      if (type === 'HOSPEDAJE') return m.type === 'HOSPEDAJE' || m.type === 'RENOVACION';
      if (type === 'PRODUCTO') return m.type === 'PRODUCTO' && !m.unregistered;
      if (type === 'SERVICIO') return m.type === 'SERVICIO';
      if (type === 'AJUSTES') {
        if (!this.isAjuste(m)) return false;
        if (sub === 'INGRESO') return m.type === 'INGRESO' && !this.isVuelto(m);
        if (sub === 'EGRESO') return m.type === 'EGRESO' && !this.isVuelto(m);
        if (sub === 'VUELTO') return this.isVuelto(m);
        if (sub === 'REG') return !!m.unregistered;
        return true;
      }
      return false;
    });
  });
  onTypeFilter(v: string): void { this.typeFilter.set(v); if (v !== 'AJUSTES') this.ajusteSub.set(''); }
  setAjustesFilter(sub: string): void { this.typeFilter.set('AJUSTES'); this.ajusteSub.set(sub); }

  // ── Cabecera / resumen ──
  private readonly DIAS = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
  private readonly MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  diaTurno(v: string): string { const d = new Date(v); const h = d.getHours() * 60 + d.getMinutes(); const t = h >= 22 * 60 + 30 || h < 6 * 60 ? 'NOCHE' : h < 14 * 60 ? 'MAÑANA' : 'TARDE'; return `${this.DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${this.MESES[d.getMonth()]} · ${t}`; }
  estadoLabel(s: string): string { return ({ OPEN: 'Abierta', CLOSED: 'Cerrada', AJUSTADA: 'Ajustada' } as Record<string, string>)[s] ?? s; }
  methodAmount(d: CashDetail, key: string): number {
    const bm = d.methodBar.byMethod;
    if (key === 'OTROS') { const known = ['CASH', 'YAPE', 'CARD', 'TRANSFER', 'PLIN']; return Math.round(Object.entries(bm).filter(([k]) => !known.includes(k)).reduce((a, [, v]) => a + Number(v), 0) * 100) / 100; }
    return bm[key] || 0;
  }

  // ── Conciliación de efectivo (sin depender de recon; la base no infla el esperado) ──
  efectivoVentas(d: CashDetail): number { return d.methodBar.byMethod['CASH'] || 0; }
  ajusteEfectivo(d: CashDetail): number { return Math.round((d.methodBar.ingresos - d.methodBar.egresos) * 100) / 100; }
  esperadoEntregar(d: CashDetail): number { return Math.round((this.efectivoVentas(d) + this.ajusteEfectivo(d)) * 100) / 100; }
  diferencia(d: CashDetail): number | null { return d.session.closingAmount != null ? Math.round((d.session.closingAmount - this.esperadoEntregar(d)) * 100) / 100 : null; }
  cuadreLabel(diff: number): string { return diff === 0 ? '✓ CUADRADO' : diff > 0 ? `+S/ ${diff.toFixed(2)} SOBRANTE` : `S/ ${(-diff).toFixed(2)} FALTANTE`; }
  ajusteMovs(): CashDetailMovement[] { return (this.detail()?.movements ?? []).filter((m) => this.isAjuste(m)); }
  ajusteTipo(m: CashDetailMovement): string {
    if (this.isVuelto(m)) return 'Vuelto';
    if (m.unregistered) return 'Regularización';
    if (m.type === 'INGRESO') return 'Ingreso';
    if (m.type === 'EGRESO') return 'Egreso';
    return this.typeLabel(m.type);
  }

  // ── Exportar movimientos ──
  exportMovs(d: CashDetail, _fmt: 'xlsx' | 'csv'): void {
    const rows = d.movements.map((m) => [
      new Date(m.time).toLocaleString('es-PE'), m.room || '', this.typeLabel(m.type), m.description,
      m.amount.toFixed(2), this.methodLabel(m.method), m.status,
    ]);
    downloadCsv(`caja-${d.session.number ?? 'mov'}-movimientos`, ['Hora', 'Habitación', 'Tipo', 'Descripción', 'Monto', 'Método', 'Estado'], rows);
  }

  // ── Auditoría de medios virtuales (tabla compacta + filtros + orden por hora) ──
  openAudit(): void { this.auditingCode.set(''); this.auditCodeInput = ''; this.auditMethod.set('ALL'); this.auditSearch.set(''); this.horaSortAsc.set(false); this.auditPage.set(0); this.auditVisible = true; }
  setAuditMethod(m: 'ALL' | 'YAPE' | 'PLIN' | 'CARD' | 'TRANSFER'): void { this.auditMethod.set(m); this.auditPage.set(0); }
  onAuditSearch(v: string): void { this.auditSearch.set(v); this.auditPage.set(0); }
  toggleHoraSort(): void { this.horaSortAsc.set(!this.horaSortAsc()); }
  methodClass(m: string): string { return ({ YAPE: 'yape', PLIN: 'plin', CARD: 'card', TRANSFER: 'transfer' } as Record<string, string>)[m] ?? 'other'; }
  vAuditKey(g: VAuditGroup): string { return `${g.method}|${g.code ?? ''}`; }
  vStateLabel(s: string): string { return ({ VERIFICADO: 'Verificado', PENDIENTE: 'Pendiente', SIN_CODIGO: 'Sin código', EN_REVISION: 'En revisión', NO_EXISTE: 'No existente' } as Record<string, string>)[s] ?? s; }
  vStateClass(s: string): string { return ({ VERIFICADO: 'ok', PENDIENTE: 'pend', SIN_CODIGO: 'warn', EN_REVISION: 'warn', NO_EXISTE: 'no' } as Record<string, string>)[s] ?? ''; }
  vDiffLabel(diff: number): string { return diff === 0 ? '✓ CUADRADO' : `S/ ${diff.toFixed(2)} DIFERENCIA`; }
  private auditAction(body: { paymentIds?: string[]; method?: string; code?: string; action: 'VERIFY' | 'SET_CODE' | 'REVIEW' | 'NOT_FOUND'; newCode?: string }): void {
    this.busy.set(true);
    this.http.post<ApiResponse<VAudit>>(`${this.api}/cash/sessions/${this.sessionId}/virtual-audit/verify`, body).subscribe({
      next: (r) => { this.busy.set(false); this.vaudit.set(r.data); this.auditingCode.set(''); }, // el filtro/orden/página se conservan
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo auditar.' }); },
    });
  }
  private targetOf(g: VAuditGroup): { paymentIds?: string[]; method?: string; code?: string } {
    return g.code ? { method: g.method, code: g.code } : { paymentIds: g.items.map((i) => i.paymentId) };
  }
  verifyGroup(g: VAuditGroup): void { this.auditAction({ ...this.targetOf(g), action: 'VERIFY' }); }
  markNotFound(g: VAuditGroup): void {
    if (!confirm(`¿Confirmas que esta operación NO existe en el medio de pago correspondiente?\n\n${this.methodLabel(g.method)} · ${g.code || 'sin código'} · S/ ${g.amount.toFixed(2)}`)) return;
    this.auditAction({ ...this.targetOf(g), action: 'NOT_FOUND' });
  }
  startSetCode(g: VAuditGroup): void { this.auditingCode.set(this.vAuditKey(g)); this.auditCodeInput = g.code ?? ''; }
  confirmSetCode(g: VAuditGroup): void {
    if (!this.auditCodeInput.trim()) { this.messages.add({ severity: 'warn', summary: 'Código', detail: 'Ingresa el código.' }); return; }
    // Para grupos sin código, corregimos por los ids de sus pagos; con código, por método+código.
    if (g.code) this.auditAction({ method: g.method, code: g.code, action: 'SET_CODE', newCode: this.auditCodeInput.trim() });
    else this.auditAction({ paymentIds: g.items.map((i) => i.paymentId), action: 'SET_CODE', newCode: this.auditCodeInput.trim() });
  }
  finalizeAudit(): void { this.loadVAudit(); this.auditVisible = false; this.messages.add({ severity: 'success', summary: 'Auditoría', detail: 'Auditoría actualizada.' }); }

  // ── Etapa 3/4 — ventas no registradas y regularizaciones ──
  verifyLabel(v: string): string { return ({ REGULARIZADA: 'Regularizada', POR_VERIFICAR: 'Por verificar', NO_COBRADA: 'No cobrada' } as Record<string, string>)[v] ?? v; }
  verifyClass(v: string): string { return v === 'REGULARIZADA' ? 'ok' : v === 'NO_COBRADA' ? 'warn' : 'pend'; }
  regsTotal(d: CashDetail): number { const r = d.regularizaciones; return r ? r.cobradas.count + r.noCobradas.count + r.porVerificar.count : 0; }

  // ── Etapa 5 — deudas ──
  deudaTipo(t: string): string { return ({ RENOVACION: 'Renovación', HOSPEDAJE: 'Hospedaje', PRODUCTO: 'Producto', SERVICIO: 'Servicio', VENTA_NO_COBRADA: 'Venta no cobrada' } as Record<string, string>)[t] ?? t; }

  // ── Regularizar deuda desde movimientos ──
  regNeedsCode(): boolean { return this.regMethod !== 'CASH'; }
  onRegMethod(): void { if (this.regMethod === 'CASH') this.regCode = ''; }
  regCanSave(): boolean {
    if (!(this.regAmount && this.regAmount > 0)) return false;
    if (this.regNeedsCode() && !this.regCode.trim()) return false;
    if (this.regMode === 'HISTORICAL' && (!this.regTargetSession || !this.regPaidAt)) return false;
    return true;
  }
  private fmtDT(iso: string, withDate = true): string {
    const d = new Date(iso); if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    const t = `${p(d.getHours())}:${p(d.getMinutes())}`;
    return withDate ? `${p(d.getDate())}/${p(d.getMonth() + 1)} ${t}` : t;
  }
  cajaLabel(c: { number: number | null; status: string; openedAt: string; closedAt: string | null; openedByName: string }): string {
    const est = c.status === 'OPEN' ? 'Abierta' : c.status === 'AJUSTADA' ? 'Ajustada' : 'Cerrada';
    return `Caja #${c.number ?? '—'} · ${this.fmtDT(c.openedAt)}–${c.closedAt ? this.fmtDT(c.closedAt, false) : '—'} · ${c.openedByName} · ${est}`;
  }
  openRegularize(m: CashDetailMovement): void {
    this.regTarget.set(m);
    this.regAmount = m.amount;
    this.regMethod = 'CASH'; this.regCode = ''; this.regNote = '';
    this.regMode = 'HISTORICAL';
    const d = this.detail();
    this.regTargetSession = d?.session.id ?? null; // por defecto, la caja que se está viendo
    this.regPaidAt = d?.session.openedAt ? new Date(d.session.openedAt) : new Date();
    // Cargar cajas para el selector de "caja original".
    if (!this.cajas().length) {
      this.cajasLoading.set(true);
      this.http.get<ApiResponse<{ id: string; number: number | null; status: string; openedAt: string; closedAt: string | null; openedByName: string }[]>>(`${this.api}/cash/sessions`, { params: { pageSize: '50' } }).subscribe({
        next: (r) => { this.cajas.set(r.data ?? []); this.cajasLoading.set(false); },
        error: () => this.cajasLoading.set(false),
      });
    }
    this.regVisible = true;
  }
  doRegularize(): void {
    const m = this.regTarget(); const d = this.detail();
    if (!m || !d || !this.regCanSave()) return;
    this.busy.set(true);
    this.finance.regularizeDebt(d.session.id, {
      saleId: m.saleId ?? undefined,
      stayId: m.stayId ?? undefined,
      method: this.regMethod,
      amount: this.regAmount!,
      reference: this.regNeedsCode() ? this.regCode.trim() : undefined,
      mode: this.regMode,
      targetSessionId: this.regMode === 'HISTORICAL' ? (this.regTargetSession ?? undefined) : undefined,
      paidAt: this.regMode === 'HISTORICAL' && this.regPaidAt ? this.regPaidAt.toISOString() : undefined,
      note: this.regNote.trim() || undefined,
    }).subscribe({
      next: () => { this.busy.set(false); this.regVisible = false; this.messages.add({ severity: 'success', summary: 'Deuda regularizada', detail: this.regMode === 'HISTORICAL' ? 'Registrada en el turno original.' : 'Cobrada en el turno actual.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo regularizar.' }); },
    });
  }
  deudaEstado(e: string): string { return ({ PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', NO_COBRADA: 'No cobrada', SIN_REGISTRAR: 'Sin registrar' } as Record<string, string>)[e] ?? e; }

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
