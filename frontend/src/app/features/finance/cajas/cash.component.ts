import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { CashCurrent, CashDetail, CashDetailMovement, CashSession, CashSessionRow } from '../services/finance.models';

interface ReconItem { id: string; at: string; type: string; amount: number; affectsCash: boolean; quantity: number | null; note: string | null; by: string | null; approvedBy: string | null; }
interface ReconSummary { expected: number | null; declared: number | null; originalDifference: number; pendingDifference: number; reconciliations: ReconItem[]; }

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  YAPE: 'Yape',
  PLIN: 'Plin',
  WALLET: 'Billetera',
  MIXTO: 'Mixto',
  PENDIENTE: 'Pendiente',
};
const TYPE_LABEL: Record<string, string> = {
  HOSPEDAJE: 'Hospedaje',
  RENOVACION: 'Pago Renovación',
  PRODUCTO: 'Venta Producto',
  SERVICIO: 'Servicio',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
};
// Colores de badge por tipo: [fondo, texto]
const TYPE_COLOR: Record<string, [string, string]> = {
  HOSPEDAJE: ['rgba(59,130,246,0.18)', '#60a5fa'],
  RENOVACION: ['rgba(245,158,11,0.2)', '#f59e0b'],
  PRODUCTO: ['rgba(245,158,11,0.2)', '#fbbf24'],
  SERVICIO: ['rgba(20,184,166,0.2)', '#2dd4bf'],
  INGRESO: ['rgba(16,185,129,0.18)', '#34d399'],
  EGRESO: ['rgba(248,113,113,0.18)', '#f87171'],
};

@Component({
  selector: 'app-cash',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule, TagModule],
  template: `
    <section class="wrap">
      <header class="head">
        <h1>Cajas</h1>
        <div class="actions">
          @if (openSession()) {
            <button class="btn in" (click)="openMovement('IN')"><i class="pi pi-plus-circle"></i> INGRESOS</button>
            <button class="btn out" (click)="openMovement('OUT')"><i class="pi pi-minus-circle"></i> EGRESOS</button>
          }
          <button class="btn new" (click)="openOpenDialog()" [disabled]="!!openSession()"><i class="pi pi-plus"></i> Abrir Caja</button>
        </div>
      </header>

      <!-- Banner de ajustes del turno abierto -->
      <div class="ajustes">
        <div>
          <div class="a-tit">──── AJUSTES ────</div>
          <div class="a-sub">{{ (adjIn() + adjOut()) > 0 ? 'Ajustes del turno abierto' : 'Sin ajustes operativos' }}</div>
        </div>
        <div class="a-tot">
          <div class="a-big">TOTAL AJUSTES : S/ {{ (adjIn() - adjOut()) | number: '1.2-2' }}</div>
          <div class="a-det"><span class="pos">Ingresos: S/ {{ adjIn() | number: '1.2-2' }}</span> &nbsp; <span class="neg">Egresos: S/ {{ adjOut() | number: '1.2-2' }}</span></div>
        </div>
      </div>

      <div class="toolbar">
        <p-select [options]="stateOptions" optionLabel="label" optionValue="value" [(ngModel)]="statusFilter" (onChange)="reload()" styleClass="flt" />
        <span class="count">Mostrando {{ total() }} caja(s)</span>
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr><th>ID</th><th>APERTURA</th><th>CIERRE</th><th class="r">MONTO INICIAL</th><th class="r">MONTO FINAL</th><th class="c">ESTADO</th><th class="c">CUADRE</th><th class="ac">ACCIONES</th></tr>
          </thead>
          <tbody>
            @for (s of rows(); track s.id) {
              <tr>
                <td class="id">{{ s.number ?? '—' }}</td>
                <td><div class="dt">{{ s.openedAt | date: 'dd/MM/yyyy HH:mm' }}</div><div class="usr"><i class="pi pi-user"></i> {{ s.openedByName }}</div></td>
                <td>
                  @if (s.closedAt) { <div class="dt">{{ s.closedAt | date: 'dd/MM/yyyy HH:mm' }}</div><div class="usr"><i class="pi pi-user"></i> {{ s.closedByName }}</div> }
                  @else { <span class="muted">—</span> }
                </td>
                <td class="r">S/ {{ s.openingAmount | number: '1.2-2' }}</td>
                <td class="r">{{ s.closingAmount != null ? ('S/ ' + (s.closingAmount | number: '1.2-2')) : '—' }}</td>
                <td class="c"><span class="pill" [class.open]="s.status === 'OPEN'" [class.closed]="s.status === 'CLOSED'"><i class="pi" [class.pi-lock-open]="s.status==='OPEN'" [class.pi-lock]="s.status==='CLOSED'"></i> {{ s.status === 'OPEN' ? 'Abierta' : 'Cerrada' }}</span></td>
                <td class="c">
                  @if (!canSeeCuadre()) { <span class="muted" title="Cierre ciego: el cuadre lo audita administración"><i class="pi pi-lock"></i></span> }
                  @else if (s.status === 'OPEN' || s.difference == null) { <span class="muted">—</span> }
                  @else if (s.difference > 0) { <span class="cuadre sob">+S/ {{ s.difference | number: '1.2-2' }} Sobrante</span> }
                  @else if (s.difference < 0) { <span class="cuadre fal">S/ {{ -s.difference | number: '1.2-2' }} Faltante</span> }
                  @else { <span class="cuadre ok"><i class="pi pi-check"></i> OK</span> }
                </td>
                <td class="ac">
                  <button class="mini" (click)="viewCuadre(s)"><i class="pi pi-print"></i> Ver</button>
                  @if (canSeeCuadre() && canEdit) { <button class="mini" (click)="openDetail(s)">Movimientos</button> }
                  @if (s.status === 'OPEN' && canEdit) { <button class="mini close" (click)="openCloseDialog(s)">Cerrar</button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="8" class="empty">Sin cajas registradas.</td></tr> }
          </tbody>
        </table>
      </div>

      @if (total() > pageSize) {
        <div class="pager">
          <button class="mini" [disabled]="page() === 1" (click)="go(page() - 1)">Anterior</button>
          <span>Página {{ page() }} de {{ pages() }}</span>
          <button class="mini" [disabled]="page() >= pages()" (click)="go(page() + 1)">Siguiente</button>
        </div>
      }
    </section>

    <!-- Abrir caja -->
    <p-dialog [(visible)]="openVisible" [modal]="true" header="Abrir caja" [style]="{ width: '26rem' }">
      <div class="form">
        <label>Monto inicial (efectivo)</label>
        <p-inputNumber [(ngModel)]="openingAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label>Notas</label>
        <input pInputText [(ngModel)]="openNotes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="openVisible = false" />
        <p-button label="Abrir" icon="pi pi-lock-open" [loading]="busy()" (onClick)="doOpen()" />
      </ng-template>
    </p-dialog>

    <!-- Ingreso/Egreso -->
    <p-dialog [(visible)]="movVisible" [modal]="true" [header]="movType === 'IN' ? 'Registrar ingreso' : 'Registrar egreso'" [style]="{ width: '26rem' }">
      <div class="form">
        <label>Monto</label>
        <p-inputNumber [(ngModel)]="movAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label>Concepto</label>
        <input pInputText [(ngModel)]="movConcept" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="movVisible = false" />
        <p-button label="Registrar" icon="pi pi-check" [loading]="busy()" (onClick)="doMovement()" />
      </ng-template>
    </p-dialog>

    <!-- Cerrar caja -->
    <p-dialog [(visible)]="closeVisible" [modal]="true" [header]="blindClose() ? 'Cerrar caja — entrega de efectivo' : 'Cerrar caja (arqueo)'" [style]="{ width: '28rem' }">
      <div class="form">
        @if (blindClose()) {
          <p class="blind-note"><i class="pi pi-info-circle"></i> Cuenta físicamente el efectivo del cajón y registra el monto que estás entregando.</p>
          <label>Monto que estoy entregando (S/)</label>
          <p-inputNumber [(ngModel)]="closingAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        } @else {
          <p class="muted">Efectivo esperado: <strong>S/ {{ expectedCash() | number: '1.2-2' }}</strong></p>
          <label>Efectivo contado</label>
          <p-inputNumber [(ngModel)]="closingAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
          @if (closingAmount !== null) {
            <p class="diff" [class.neg]="closeDiff() < 0">Diferencia: <strong>{{ closeDiff() | number: '1.2-2' }}</strong></p>
          }
        }
        <label>Notas de cierre</label>
        <input pInputText [(ngModel)]="closeNotes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="closeVisible = false" />
        <p-button [label]="blindClose() ? 'Registrar entrega' : 'Cerrar turno'" icon="pi pi-lock" severity="warn" [loading]="busy()" (onClick)="doClose()" />
      </ng-template>
    </p-dialog>

    <!-- Detalle (Ver) -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '60rem', maxWidth: '97vw' }" [header]="detailHeader()">
      @if (detailLoading()) { <p class="muted">Cargando…</p> }
      @else if (detail()) {
        @let d = detail()!;
        <div class="dhead">
          <p class="turno">Turno: {{ d.session.openedAt | date: 'dd/MM/yyyy HH:mm' }} — {{ d.session.closedAt ? (d.session.closedAt | date: 'dd/MM/yyyy HH:mm') : 'En curso' }}</p>
          <div class="dactions">
            <button class="mini" (click)="downloadDetail(d)"><i class="pi pi-download"></i> Descargar</button>
            @if (d.session.status === 'CLOSED' && canEdit) { <button class="mini warn" (click)="reopen(d.session.id)"><i class="pi pi-replay"></i> Reabrir</button> }
          </div>
        </div>
        <div class="cards">
          <div class="mc blue"><span>Total Ventas Hospedaje</span><strong>S/ {{ d.cards.ventasHospedaje | number: '1.2-2' }}</strong></div>
          <div class="mc brown"><span>Ventas Productos</span><strong>S/ {{ d.cards.ventasProductos | number: '1.2-2' }}</strong></div>
          <div class="mc teal"><span>Servicios y Otros</span><strong>S/ {{ d.cards.serviciosOtros | number: '1.2-2' }}</strong></div>
          <div class="mc brown"><span>Deudas Pendientes</span><strong>S/ {{ d.cards.deudasPendientes | number: '1.2-2' }}</strong></div>
          <div class="mc green"><span>Efectivo</span><strong>S/ {{ d.cards.efectivo | number: '1.2-2' }}</strong></div>
          <div class="mc purple"><span>Ajustes (+/-)</span><strong>{{ d.cards.ajustes >= 0 ? '+' : '' }}S/ {{ d.cards.ajustes | number: '1.2-2' }}</strong></div>
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
              <div class="recon-list">
                <div class="rl-t">Regularizaciones posteriores</div>
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
          <table class="tbl mini-tbl">
            <thead><tr><th>Hora</th><th>Tipo</th><th>Descripción</th><th class="r">Monto</th><th class="c">Método</th><th class="c">Estado</th>@if (canEdit) { <th class="c">Acción</th> }</tr></thead>
            <tbody>
              @for (m of filteredMovements(); track m.id) {
                <tr [class.anulado]="m.status === 'ANULADO'">
                  <td>{{ m.time | date: 'HH:mm' }}</td>
                  <td><span class="tbadge" [style.background]="typeBg(m.type)" [style.color]="typeFg(m.type)">{{ typeLabel(m.type) }}</span></td>
                  <td>{{ m.description }}</td>
                  <td class="r">S/ {{ m.amount | number: '1.2-2' }}</td>
                  <td class="c">{{ methodLabel(m.method) }}</td>
                  <td class="c"><span class="est" [class.anul]="m.status === 'ANULADO'">{{ m.status }}</span></td>
                  @if (canEdit) {
                    <td class="c nowrap">
                      @if (m.status === 'NORMAL') {
                        <button class="lnk red" (click)="anular(m)">Anular</button>
                        <button class="lnk" (click)="openCorrect(m)">Corregir</button>
                      } @else { <span class="muted">—</span> }
                    </td>
                  }
                </tr>
              } @empty { <tr><td [attr.colspan]="canEdit ? 7 : 6" class="empty">Sin movimientos.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </p-dialog>

    <!-- Corregir movimiento -->
    <p-dialog [(visible)]="correctVisible" [modal]="true" header="Corregir movimiento" [style]="{ width: '26rem' }">
      @if (correctTarget(); as m) {
        <p class="muted">{{ m.description }}</p>
        @if (m.saleId) {
          <div class="form">
            <label>Método de pago correcto</label>
            <p-select [options]="methodEditOpts" optionLabel="label" optionValue="value" [(ngModel)]="correctMethod" styleClass="w" />
          </div>
        } @else {
          <div class="form">
            <label>Tipo</label>
            <p-select [options]="movTypeOpts" optionLabel="label" optionValue="value" [(ngModel)]="correctMovType" styleClass="w" />
            <label>Monto</label>
            <p-inputNumber [(ngModel)]="correctMovAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
            <label>Concepto</label>
            <input pInputText [(ngModel)]="correctMovConcept" />
          </div>
        }
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
        <label>Producto</label>
        <p-select [options]="vnrProducts()" optionLabel="name" optionValue="id" [(ngModel)]="vnrForm.productId" [filter]="true" filterBy="name" placeholder="Elegir producto" appendTo="body" styleClass="w" />
        <label>Cantidad</label>
        <p-inputNumber [(ngModel)]="vnrForm.quantity" [min]="1" [showButtons]="true" styleClass="w" />
        <label>Importe (S/) — parte del sobrante</label>
        <p-inputNumber [(ngModel)]="vnrForm.amount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label>Observación</label>
        <input pInputText [(ngModel)]="vnrForm.note" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="vnrVisible = false" />
        <p-button label="Regularizar" icon="pi pi-check" [loading]="busy()" (onClick)="saveVnr()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .wrap { padding: 1.25rem; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      h1 { margin: 0; font-size: 1.6rem; }
      h4 { margin: 1.1rem 0 0.4rem; font-size: 0.9rem; color: var(--p-text-muted-color, #a1a1aa); }
      .muted { color: var(--p-text-muted-color, #8aa0bd); }
      .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
      .btn { display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; border: 1px solid transparent; background: transparent; }
      .btn.in { color: #34d399; border-color: #14633f; } .btn.out { color: #f87171; border-color: #7f1d1d; }
      .btn.new { background: #10b981; color: #04130d; border: 0; } .btn.new:disabled { opacity: 0.45; cursor: not-allowed; }
      .ajustes { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin: 1rem 0; padding: 0.9rem 1.2rem; border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 12px; background: var(--p-content-background, #0e1622); flex-wrap: wrap; }
      .a-tit { color: #8aa0bd; letter-spacing: 1px; font-size: 0.8rem; } .a-sub { color: #64748b; font-size: 0.78rem; }
      .a-tot { text-align: right; } .a-big { font-weight: 800; font-size: 1.05rem; } .a-det { font-size: 0.78rem; }
      .pos { color: #34d399; } .neg { color: #f87171; }
      .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.6rem; }
      .count { color: #8aa0bd; font-size: 0.85rem; }
      .tbl-wrap { overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.7rem 0.7rem; border-bottom: 1px solid var(--p-content-border-color, #1c2c44); text-align: left; font-size: 0.86rem; vertical-align: top; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.74rem; letter-spacing: 0.4px; }
      .tbl .r { text-align: right; } .tbl .c { text-align: center; } .tbl .ac { text-align: right; white-space: nowrap; }
      .id { font-weight: 800; color: #93c5fd; }
      .dt { font-weight: 600; } .usr { color: #8aa0bd; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.3rem; margin-top: 0.15rem; }
      .pill { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.74rem; font-weight: 700; padding: 0.18rem 0.7rem; border-radius: 999px; }
      .pill.open { background: rgba(16,185,129,0.16); color: #34d399; } .pill.closed { background: rgba(148,163,184,0.16); color: #94a3b8; }
      .cuadre { font-size: 0.74rem; font-weight: 700; padding: 0.18rem 0.7rem; border-radius: 999px; white-space: nowrap; }
      .cuadre.sob { background: rgba(16,185,129,0.16); color: #34d399; } .cuadre.fal { background: rgba(248,113,113,0.16); color: #f87171; } .cuadre.ok { background: rgba(59,130,246,0.18); color: #60a5fa; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.35rem 0.75rem; font-size: 0.78rem; font-weight: 600; cursor: pointer; margin-left: 0.35rem; }
      .mini.close { background: #10b981; color: #04130d; border: 0; }
      .empty { text-align: center; color: #8aa0bd; padding: 2rem; }
      .pager { display: flex; align-items: center; gap: 1rem; justify-content: center; margin-top: 1rem; color: #8aa0bd; font-size: 0.82rem; }
      .form { display: flex; flex-direction: column; gap: 0.35rem; }
      .form label { font-size: 0.82rem; color: #8aa0bd; margin-top: 0.5rem; }
      :host ::ng-deep .form .w, :host ::ng-deep .form input[pInputText] { width: 100%; }
      .diff { margin-top: 0.5rem; } .diff.neg strong { color: #f87171; }
      .blind-note { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0 0 0.4rem; padding: 0.55rem 0.7rem; border-radius: 8px; background: rgba(59,130,246,0.12); color: #93c5fd; font-size: 0.82rem; }
      .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; margin-bottom: 0.8rem; }
      .mc { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.8rem 0.9rem; border-radius: 10px; border: 1px solid #1c2c44; }
      .mc span { font-size: 0.72rem; color: #8aa0bd; } .mc strong { font-size: 1.05rem; }
      .mc.blue { background: rgba(37,99,235,0.12); } .mc.green { background: rgba(16,185,129,0.12); } .mc.amber { background: rgba(245,158,11,0.12); } .mc.purple { background: rgba(139,92,246,0.12); }
      .mc.brown { background: rgba(120,53,15,0.22); } .mc.teal { background: rgba(20,184,166,0.12); }
      .recon { border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.7rem; background: rgba(139,92,246,0.06); }
      .recon-h { display: flex; align-items: center; justify-content: space-between; gap: 1rem; font-weight: 700; color: #c4b5fd; margin-bottom: 0.5rem; }
      .recon-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; }
      .recon-grid > div { display: flex; flex-direction: column; gap: 0.15rem; } .recon-grid span { font-size: 0.72rem; color: #8aa0bd; } .recon-grid strong { font-size: 1.02rem; } .recon-grid .ok { color: #34d399; }
      .recon-list { margin-top: 0.6rem; border-top: 1px dashed #1c2c44; padding-top: 0.5rem; } .rl-t { font-size: 0.74rem; color: #8aa0bd; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.4px; }
      .rl { display: grid; grid-template-columns: 5rem 9rem 1fr auto auto; gap: 0.6rem; align-items: center; font-size: 0.8rem; padding: 0.2rem 0; }
      .rl .rt { font-weight: 700; color: #c4b5fd; } .rl .ra { color: #f59e0b; font-weight: 700; } .rl .rb { color: #8aa0bd; font-size: 0.74rem; }
      @media (max-width: 720px) { .recon-grid { grid-template-columns: repeat(2, 1fr); } .rl { grid-template-columns: 1fr 1fr; } }
      .bar { display: flex; flex-wrap: wrap; gap: 0.9rem; padding: 0.6rem 0.8rem; border: 1px solid #1c2c44; border-radius: 10px; font-size: 0.8rem; color: #8aa0bd; margin-bottom: 0.6rem; }
      .bar b { color: #e2e8f0; }
      .turno { color: #8aa0bd; font-size: 0.82rem; margin: 0; }
      .dhead { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.7rem; flex-wrap: wrap; }
      .dactions { display: flex; gap: 0.5rem; }
      .mini.warn { background: #78350f; color: #fcd34d; border-color: #b45309; }
      .lnk { background: none; border: 0; color: #93c5fd; cursor: pointer; font-size: 0.78rem; font-weight: 600; padding: 0.1rem 0.35rem; }
      .lnk.red { color: #f87171; }
      .nowrap { white-space: nowrap; }
      .filters { display: flex; align-items: center; gap: 1rem; margin: 0.4rem 0; flex-wrap: wrap; }
      .filters label { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #8aa0bd; }
      :host ::ng-deep .flt-sm { min-width: 9rem; }
      .tbadge { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.6rem; border-radius: 999px; white-space: nowrap; }
      .est { font-size: 0.68rem; font-weight: 700; padding: 0.12rem 0.55rem; border-radius: 6px; background: rgba(148,163,184,0.18); color: #94a3b8; }
      .est.anul { background: rgba(248,113,113,0.18); color: #f87171; }
      tr.anulado td { opacity: 0.55; text-decoration: line-through; }
      tr.anulado td:last-child { text-decoration: none; }
      .mini-tbl th, .mini-tbl td { padding: 0.5rem 0.6rem; font-size: 0.82rem; }
      @media (max-width: 720px) { .cards { grid-template-columns: repeat(2, 1fr); } }
    `,
  ],
})
export class CashComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  // Conciliación posterior al cierre (Fase 2).
  readonly recon = signal<ReconSummary | null>(null);
  vnrVisible = false;
  vnrForm: { productId: string | null; quantity: number; amount: number | null; note: string } = { productId: null, quantity: 1, amount: null, note: '' };
  readonly vnrProducts = signal<{ id: string; name: string }[]>([]);
  private reconWhId = '';
  reconType(t: string): string { return ({ VENTA_NO_REGISTRADA: 'Venta no registrada', PERDIDA_COLABORADOR: 'Pérdida atribuida' } as Record<string, string>)[t] ?? t; }

  readonly rows = signal<CashSessionRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  statusFilter: '' | 'OPEN' | 'CLOSED' = '';
  readonly stateOptions = [
    { label: 'Todos los Estados', value: '' },
    { label: 'Abierta', value: 'OPEN' },
    { label: 'Cerrada', value: 'CLOSED' },
  ];

  // Turno abierto (para cabecera / arqueo)
  readonly current = signal<CashCurrent | null>(null);
  readonly openSession = computed(() => this.current()?.session ?? null);
  readonly adjIn = computed(() => Number(this.current()?.summary?.movementsIn ?? 0));
  readonly adjOut = computed(() => Number(this.current()?.summary?.movementsOut ?? 0));
  readonly expectedCash = computed(() => Number(this.current()?.summary?.expectedCash ?? 0));

  readonly busy = signal(false);
  readonly canCreate = this.auth.can('finance', 'create');
  readonly canEdit = this.auth.can('finance', 'edit');
  // Administración = quien puede editar la configuración del hotel (el switch "Administrador presente").
  readonly isAdmin = this.auth.can('settings', 'edit');
  // Modo de trabajo de la sucursal activa.
  readonly adminPresent = computed(() => this.auth.activeBranch()?.adminPresent ?? true);
  // Cierre ciego: recepción no ve esperado ni diferencias (solo cuando NO hay administrador presente).
  readonly blindClose = computed(() => !this.adminPresent());
  // ¿Puede ver el cuadre (esperado/sobrante/faltante)? Siempre con admin presente; en modo ciego, solo administración.
  readonly canSeeCuadre = computed(() => this.adminPresent() || this.isAdmin);

  // Diálogos
  openVisible = false;
  openingAmount: number | null = 0;
  openNotes = '';

  movVisible = false;
  movType: 'IN' | 'OUT' = 'IN';
  movAmount: number | null = null;
  movConcept = '';

  closeVisible = false;
  closeTarget: CashSessionRow | null = null;
  closingAmount: number | null = null;
  closeNotes = '';
  readonly closeDiff = computed(() => Math.round(((this.closingAmount ?? 0) - this.expectedCash()) * 100) / 100);

  detailVisible = false;
  readonly detailLoading = signal(false);
  readonly detail = signal<CashDetail | null>(null);
  detailRow: CashSessionRow | null = null;
  typeFilter = '';
  methodFilter = '';
  readonly typeFilterOpts = [
    { label: 'Todos', value: '' },
    { label: 'Hospedaje', value: 'HOSPEDAJE' },
    { label: 'Pago Renovación', value: 'RENOVACION' },
    { label: 'Venta Producto', value: 'PRODUCTO' },
    { label: 'Servicio', value: 'SERVICIO' },
    { label: 'Ingreso', value: 'INGRESO' },
    { label: 'Egreso', value: 'EGRESO' },
  ];
  readonly methodFilterOpts = [
    { label: 'Todos', value: '' },
    { label: 'Efectivo', value: 'CASH' },
    { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Yape', value: 'YAPE' },
    { label: 'Plin', value: 'PLIN' },
    { label: 'Tarjeta', value: 'CARD' },
  ];
  filteredMovements(): CashDetailMovement[] {
    const all = this.detail()?.movements ?? [];
    return all.filter((m) => (!this.typeFilter || m.type === this.typeFilter) && (!this.methodFilter || m.method === this.methodFilter));
  }

  ngOnInit(): void {
    this.reloadCurrent();
    this.reload();
  }

  label(key: string): string { return METHOD_LABEL[key] ?? key; }
  methodLabel(key: string): string { return METHOD_LABEL[key] ?? key; }
  typeLabel(key: string): string { return TYPE_LABEL[key] ?? key; }
  typeBg(key: string): string { return (TYPE_COLOR[key] ?? ['rgba(148,163,184,0.18)', '#94a3b8'])[0]; }
  typeFg(key: string): string { return (TYPE_COLOR[key] ?? ['rgba(148,163,184,0.18)', '#94a3b8'])[1]; }

  detailHeader(): string {
    const n = this.detailRow?.number;
    return n != null ? `Caja #${n}` : 'Detalle de caja';
  }

  reloadCurrent(): void {
    this.finance.cashCurrent().subscribe({ next: (res) => this.current.set(res.data), error: () => {} });
  }

  reload(): void {
    this.finance
      .listSessions({ page: this.page(), pageSize: this.pageSize, status: this.statusFilter || undefined })
      .subscribe({
        next: (res) => {
          this.rows.set(res.data ?? []);
          this.total.set(res.meta?.total ?? (res.data?.length ?? 0));
        },
        error: () => this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las cajas.' }),
      });
  }

  go(p: number): void { this.page.set(p); this.reload(); }

  // ── Abrir ──
  openOpenDialog(): void { this.openingAmount = 0; this.openNotes = ''; this.openVisible = true; }
  doOpen(): void {
    this.busy.set(true);
    this.finance.openCash({ openingAmount: this.openingAmount ?? 0, notes: this.openNotes || undefined }).subscribe({
      next: () => { this.busy.set(false); this.openVisible = false; this.messages.add({ severity: 'success', summary: 'Caja abierta', detail: 'Turno abierto.' }); this.refreshAll(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo abrir.' }); },
    });
  }

  // ── Ingreso/Egreso ──
  openMovement(type: 'IN' | 'OUT'): void { this.movType = type; this.movAmount = null; this.movConcept = ''; this.movVisible = true; }
  doMovement(): void {
    if (this.movAmount == null || this.movAmount <= 0 || !this.movConcept.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Monto y concepto requeridos.' }); return;
    }
    this.busy.set(true);
    this.finance.addMovement({ type: this.movType, amount: this.movAmount, concept: this.movConcept.trim() }).subscribe({
      next: () => { this.busy.set(false); this.movVisible = false; this.messages.add({ severity: 'success', summary: 'Registrado', detail: 'Movimiento agregado.' }); this.reloadCurrent(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar.' }); },
    });
  }

  // ── Cerrar ──
  openCloseDialog(row: CashSessionRow): void { this.closeTarget = row; this.closingAmount = null; this.closeNotes = ''; this.closeVisible = true; }
  doClose(): void {
    if (this.closingAmount === null) {
      const msg = this.blindClose() ? 'Ingresa el monto que estás entregando.' : 'Ingresa el efectivo contado.';
      this.messages.add({ severity: 'warn', summary: 'Falta el monto', detail: msg }); return;
    }
    const blind = this.blindClose();
    const delivered = this.closingAmount;
    const closingRow = this.closeTarget;
    this.busy.set(true);
    this.finance.closeCash({ closingAmount: this.closingAmount, notes: this.closeNotes || undefined }).subscribe({
      next: (res) => {
        this.busy.set(false); this.closeVisible = false;
        if (blind) {
          // Cierre ciego: no se revela la diferencia; solo se confirma la entrega y se imprime el ticket simple.
          this.messages.add({ severity: 'success', summary: 'Entrega registrada', detail: `Monto entregado: S/ ${delivered.toFixed(2)}` });
          if (closingRow) this.printSimpleTicket(res.data.session, closingRow, delivered);
        } else {
          this.messages.add({ severity: res.data.difference === 0 ? 'success' : 'warn', summary: 'Turno cerrado', detail: `Diferencia: ${res.data.difference.toFixed(2)}` });
          // Administrador presente: imprime el cuadre detallado del turno recién cerrado.
          this.finance.sessionDetail(res.data.session.id).subscribe({ next: (d) => this.openTicketWindow(this.buildCuadreHtml(d.data)), error: () => {} });
        }
        this.refreshAll();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cerrar.' }); },
    });
  }

  // ── Detalle ──
  openDetail(row: CashSessionRow): void {
    this.detailRow = row; this.detail.set(null); this.typeFilter = ''; this.methodFilter = ''; this.recon.set(null);
    this.detailVisible = true; this.detailLoading.set(true);
    this.finance.sessionDetail(row.id).subscribe({
      next: (res) => { this.detail.set(res.data); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle.' }); },
    });
    if (row.status === 'CLOSED') this.loadRecon(row.id);
  }

  private loadRecon(sessionId: string): void {
    this.http.get<ApiResponse<ReconSummary>>(`${this.api}/cash/${sessionId}/reconciliation`).subscribe({ next: (r) => this.recon.set(r.data), error: () => {} });
  }

  openVnr(): void {
    this.vnrForm = { productId: null, quantity: 1, amount: null, note: '' };
    if (!this.vnrProducts().length) this.http.get<ApiResponse<{ id: string; name: string }[]>>(`${this.api}/products`, { params: { pageSize: '300', status: 'active' } }).subscribe((r) => this.vnrProducts.set(r.data ?? []));
    // Almacén de recepción (de donde salió el producto vendido no registrado).
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
      next: () => { this.busy.set(false); this.vnrVisible = false; this.messages.add({ severity: 'success', summary: 'Regularizado', detail: 'Venta no registrada conciliada.' }); this.loadRecon(d.session.id); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo regularizar.' }); },
    });
  }

  private refreshAll(): void { this.reloadCurrent(); this.reload(); }

  // ── Acciones del detalle (Tanda 3) ──
  correctVisible = false;
  readonly correctTarget = signal<CashDetailMovement | null>(null);
  correctMethod = 'CASH';
  correctMovType: 'IN' | 'OUT' = 'IN';
  correctMovAmount: number | null = null;
  correctMovConcept = '';
  readonly methodEditOpts = [
    { label: 'Efectivo', value: 'CASH' },
    { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Yape', value: 'YAPE' },
    { label: 'Plin', value: 'PLIN' },
    { label: 'Tarjeta', value: 'CARD' },
  ];
  readonly movTypeOpts = [
    { label: 'Ingreso', value: 'IN' },
    { label: 'Egreso', value: 'OUT' },
  ];

  private reloadDetail(): void {
    if (this.detailRow) this.openDetail(this.detailRow);
    this.reload();
  }

  anular(m: CashDetailMovement): void {
    const what = m.saleId ? 'esta venta' : 'este movimiento';
    if (!confirm(`¿Anular ${what}? Esta acción lo excluye del arqueo.`)) return;
    const next = () => { this.messages.add({ severity: 'success', summary: 'Anulado', detail: 'Movimiento anulado.' }); this.reloadDetail(); this.reloadCurrent(); };
    const error = (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo anular.' });
    if (m.saleId) this.finance.cancelSale(m.saleId).subscribe({ next, error });
    else this.finance.deleteMovement(m.id).subscribe({ next, error });
  }

  openCorrect(m: CashDetailMovement): void {
    this.correctTarget.set(m);
    if (m.saleId) { this.correctMethod = m.method === 'MIXTO' || m.method === 'PENDIENTE' ? 'CASH' : m.method; }
    else { this.correctMovType = m.type === 'EGRESO' ? 'OUT' : 'IN'; this.correctMovAmount = m.amount; this.correctMovConcept = m.description; }
    this.correctVisible = true;
  }

  doCorrect(): void {
    const m = this.correctTarget();
    if (!m) return;
    this.busy.set(true);
    const done = () => { this.busy.set(false); this.correctVisible = false; this.messages.add({ severity: 'success', summary: 'Corregido', detail: 'Movimiento actualizado.' }); this.reloadDetail(); this.reloadCurrent(); };
    const fail = (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo corregir.' }); };
    if (m.saleId) {
      this.finance.correctSale(m.saleId, this.correctMethod).subscribe({ next: done, error: fail });
    } else {
      if (this.correctMovAmount == null || this.correctMovAmount <= 0 || !this.correctMovConcept.trim()) {
        this.busy.set(false); this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Monto y concepto requeridos.' }); return;
      }
      this.finance.editMovement(m.id, { type: this.correctMovType, amount: this.correctMovAmount, concept: this.correctMovConcept.trim() }).subscribe({ next: done, error: fail });
    }
  }

  reopen(id: string): void {
    if (!confirm('¿Reabrir esta caja? Volverá a estado Abierta.')) return;
    this.finance.reopenSession(id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Caja reabierta', detail: 'El turno está abierto nuevamente.' }); this.detailVisible = false; this.refreshAll(); },
      error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo reabrir.' }),
    });
  }

  /** Exporta el detalle del turno a CSV (descarga en el navegador). */
  downloadDetail(d: CashDetail): void {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(esc(`Caja #${d.session.number ?? ''} (${d.session.status})`));
    lines.push([esc('Hora'), esc('Tipo'), esc('Descripción'), esc('Monto'), esc('Método'), esc('Estado')].join(','));
    for (const m of d.movements) {
      const t = new Date(m.time);
      const hh = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      lines.push([esc(hh), esc(this.typeLabel(m.type)), esc(m.description), esc(m.amount.toFixed(2)), esc(this.methodLabel(m.method)), esc(m.status)].join(','));
    }
    lines.push('');
    lines.push([esc('Efectivo'), esc(d.methodBar.byMethod['CASH'] ?? 0)].join(','));
    lines.push([esc('Yape'), esc(d.methodBar.byMethod['WALLET'] ?? 0)].join(','));
    lines.push([esc('Plin'), esc(d.methodBar.byMethod['TRANSFER'] ?? 0)].join(','));
    lines.push([esc('Tarjeta'), esc(d.methodBar.byMethod['CARD'] ?? 0)].join(','));
    lines.push([esc('Total'), esc(d.methodBar.total)].join(','));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `caja-${d.session.number ?? d.session.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Vista imprimible del cierre (pestaña aparte) ──
  /** Abre el resumen de caja en una pestaña nueva; detallado para administración, simple (entrega) para recepción en modo ciego. */
  viewCuadre(row: CashSessionRow): void {
    this.finance.sessionDetail(row.id).subscribe({
      next: (res) => {
        const d = res.data;
        const html = this.canSeeCuadre() ? this.buildCuadreHtml(d) : this.buildSimpleHtml(d.session, d.session.closingAmount);
        this.openTicketWindow(html);
      },
      error: () => this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo abrir el resumen.' }),
    });
  }

  /** Tras un cierre ciego, imprime el ticket simple de entrega (sin revelar cuadre). */
  private printSimpleTicket(session: CashSession, row: CashSessionRow, delivered: number): void {
    this.openTicketWindow(
      this.buildSimpleHtml(
        { number: row.number, openedAt: row.openedAt, closedAt: session.closedAt ?? new Date().toISOString(), openedByName: row.openedByName, closedByName: this.auth.user()?.name ?? row.openedByName },
        delivered,
      ),
    );
  }

  private openTicketWindow(html: string): void {
    const w = window.open('', '_blank');
    if (!w) { this.messages.add({ severity: 'warn', summary: 'Ventana bloqueada', detail: 'Permite ventanas emergentes para ver/imprimir el ticket.' }); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  private hhmm(v: string): string { const t = new Date(v); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; }
  private escHtml(v: unknown): string { return String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string); }

  // ── Formato de ticket térmico (monospace, ancho fijo) ──
  private readonly TW = 42; // caracteres por línea (impresora 80mm)
  private tLine(ch: string): string { return ch.repeat(this.TW); }
  private tCenter(s: string): string { s = s.slice(0, this.TW); const l = Math.max(0, Math.floor((this.TW - s.length) / 2)); return ' '.repeat(l) + s; }
  private tLR(l: string, r: string): string { const sp = this.TW - l.length - r.length; return l + (sp > 0 ? ' '.repeat(sp) : ' ') + r; }
  // Clave/valor con columna de dos puntos fija (col 27) para que todos los ':' queden alineados.
  private tKV(label: string, value: string): string { return label.slice(0, 26).padEnd(27) + ': ' + value; }
  private tSec(title: string): string { return this.tCenter(`--- ${title} ---`); }
  private tMoney(label: string, amt: number): string { return label.slice(0, 14).padEnd(14) + 'S/ ' + amt.toFixed(2).padStart(6); }
  private ticketMethod(m: string): string {
    return ({ CASH: 'EFECTIVO', CARD: 'TARJETA DE C', TRANSFER: 'TRANSFERENC.', YAPE: 'YAPE', PLIN: 'PLIN', WALLET: 'BILLETERA' } as Record<string, string>)[m] ?? m;
  }
  private ticketMedio(m: string): string {
    return ({ CASH: 'EFEC', CARD: 'TARJ', TRANSFER: 'TRAN', YAPE: 'YAPE', PLIN: 'PLIN', WALLET: 'BILL' } as Record<string, string>)[m] ?? m.slice(0, 4);
  }
  private renCode(desc: string): string {
    if (/upgrade|mejora|\bupg\b/i.test(desc)) return 'UPG';
    if (/extra|extensi/i.test(desc)) return 'EXT';
    return 'REN';
  }

  private ticketHeader(titlePrefix: string, s: { number: number | null; openedAt: string; closedAt: string | null; openedByName: string; closedByName: string | null }): string[] {
    const brand = (this.auth.activeBranch()?.name ?? 'HOTELSUITE').toUpperCase();
    const open = new Date(s.openedAt);
    const close = s.closedAt ? new Date(s.closedAt) : null;
    const ref = close ?? open;
    const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
    const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const shift = open.getHours() < 12 ? 'MAÑANA' : open.getHours() < 19 ? 'TARDE' : 'NOCHE';
    const user = (s.closedByName ?? s.openedByName ?? 'USUARIO').toUpperCase();
    const fullDate = `${dm(ref)}/${ref.getFullYear()}`;
    return [
      this.tLine('='),
      this.tCenter(`${titlePrefix} - ${brand}`),
      this.tLine('='),
      `${dm(open)} ${hm(open)} - CAJA #${s.number ?? '—'} - ${close ? hm(close) : '--:--'}`,
      this.tLine('-'),
      `${fullDate} - ${days[ref.getDay()]} - ${shift} - ${user}`,
      this.tLine('-'),
      '',
    ];
  }

  private ticketPage(title: string, text: string): string {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${this.escHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; color: #000; font-family: 'Courier New', ui-monospace, monospace; }
  .toolbar { position: sticky; top: 0; display: flex; gap: .5rem; justify-content: center; padding: .6rem; background: #0f172a; }
  .toolbar button { border: 0; border-radius: 7px; padding: .5rem 1.1rem; font-weight: 700; font-size: .85rem; cursor: pointer; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
  .toolbar .print { background: #10b981; color: #04130d; }
  .toolbar .close { background: #334155; color: #e2e8f0; }
  .sheet { width: 80mm; max-width: 96vw; margin: 12px auto; background: #fff; padding: 6mm 4mm; box-shadow: 0 2px 14px rgba(0,0,0,.18); }
  pre.ticket { margin: 0; font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; line-height: 1.28; white-space: pre; color: #000; font-weight: 700; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { box-shadow: none; margin: 0; width: auto; padding: 0; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="print" onclick="window.print()">Imprimir</button>
    <button class="close" onclick="window.close()">Cerrar</button>
  </div>
  <div class="sheet"><pre class="ticket">${this.escHtml(text)}</pre></div>
</body></html>`;
  }

  private buildCuadreHtml(d: CashDetail): string {
    const s = d.session;
    const METHODS = ['CASH', 'CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET'];
    const normal = d.movements.filter((m) => m.status === 'NORMAL');
    const sumT = (types: string[]) => normal.filter((m) => types.includes(m.type)).reduce((a, m) => a + m.amount, 0);
    const sumBy = (types: string[], mth: string) => normal.filter((m) => types.includes(m.type) && m.method === mth).reduce((a, m) => a + m.amount, 0);

    const base = s.openingAmount;
    const efTurno = d.methodBar.byMethod['CASH'] || 0;
    const ing = d.methodBar.ingresos, egr = d.methodBar.egresos;
    const esperado = Math.round((base + efTurno + ing - egr) * 100) / 100;
    const contado = s.closingAmount;
    const diff = contado != null ? Math.round((contado - esperado) * 100) / 100 : null;

    const L: string[] = [];
    L.push(...this.ticketHeader('CIERRE DE CAJA', s));

    // Base / esperado / contado
    L.push(this.tKV('CAJA BASE CONFIGURADA', 'S/ ' + base.toFixed(2)));
    L.push(this.tKV('EFECTIVO ESPERADO EN CAJON', 'S/ ' + esperado.toFixed(2)));
    L.push(this.tKV('EFECTIVO CONTADO EN CAJON', 'S/ ' + (contado != null ? contado.toFixed(2) : '--')));
    L.push(this.tLine('='), '');

    // Secciones agregadas por método
    const agg = (title: string, types: string[]) => {
      const tot = sumT(types);
      if (tot <= 0) return;
      L.push(this.tSec(title));
      for (const mth of METHODS) { const v = sumBy(types, mth); if (v > 0) L.push(this.tMoney(this.ticketMethod(mth), v)); }
      L.push(this.tLine('-'), this.tMoney('TOTAL', tot), '');
    };
    agg('HOSPEDAJE / SERVICIOS', ['HOSPEDAJE', 'SERVICIO']);
    agg('PRODUCTOS', ['PRODUCTO']);

    // Renovaciones / upgrades / extras (línea por línea con código)
    const renov = normal.filter((m) => m.type === 'RENOVACION');
    if (renov.length) {
      const rtot = renov.reduce((a, m) => a + m.amount, 0);
      L.push(this.tSec('RENOV / UPG / EXTRA'));
      for (const m of renov) L.push(this.ticketMethod(m.method).slice(0, 9).padEnd(9) + this.renCode(m.description).padEnd(6) + 'S/ ' + m.amount.toFixed(2).padStart(6));
      L.push(this.tLine('-'), 'TOTAL'.padEnd(15) + 'S/ ' + rtot.toFixed(2).padStart(6), '');
    }

    // Resumen por método
    L.push(this.tSec('RESUMEN POR METODO'));
    for (const mth of METHODS) { const v = d.methodBar.byMethod[mth] || 0; if (v > 0) L.push(this.ticketMethod(mth).slice(0, 14).padEnd(14) + 'TOTAL TURNO : S/ ' + v.toFixed(2).padStart(6)); }
    L.push(this.tLine('-'), this.tKV('TOTAL GENERAL', 'S/ ' + d.methodBar.total.toFixed(2)), this.tLine('='), '');

    // Ajustes
    L.push(this.tSec('AJUSTES'));
    if (ing === 0 && egr === 0) L.push('(Sin ajustes operativos)');
    else { if (ing > 0) L.push(this.tKV('Ingresos', '+S/ ' + ing.toFixed(2))); if (egr > 0) L.push(this.tKV('Egresos', '-S/ ' + egr.toFixed(2))); }
    L.push(this.tLine('-'), this.tKV('TOTAL AJUSTES', 'S/ ' + (ing - egr).toFixed(2)), this.tLine('='), '');

    // Cuadre de efectivo
    const cuadreTxt = diff == null ? '--' : diff === 0 ? 'OK' : diff > 0 ? 'SOBRA S/ ' + diff.toFixed(2) : 'FALTA S/ ' + (-diff).toFixed(2);
    L.push(this.tSec('CUADRE DE EFECTIVO'));
    L.push(this.tKV('EFECTIVO (SEGUN SISTEMA)', 'S/ ' + esperado.toFixed(2)));
    L.push(this.tKV('CAJA BASE', '-S/ ' + base.toFixed(2)));
    L.push(this.tLine('-'), this.tKV('TOTAL A ENTREGAR', 'S/ ' + (esperado - base).toFixed(2)), this.tLine('-'));
    L.push(this.tKV('EFECTIVO REAL EN BOLSA', 'S/ ' + (contado != null ? contado.toFixed(2) : '--')));
    L.push(this.tKV('CUADRE', cuadreTxt));
    L.push(this.tLine('='), '', 'FIRMA COLABORADOR', '', '____________________', '');

    // Pagos virtuales
    const vps = d.virtualPayments ?? [];
    if (vps.length) {
      const vrow = (medio: string, hora: string, monto: string, cli: string, conc: string, cod: string) =>
        medio.padEnd(6) + hora.padEnd(6) + monto.padStart(7) + '  ' + cli.padEnd(4) + ' ' + conc.padEnd(4) + ' ' + cod;
      L.push(this.tSec('PAGOS VIRTUALES'));
      L.push(vrow('MEDIO', 'HORA', 'MONTO', 'CLI', 'CONC', 'COD'));
      L.push(this.tLine('-'));
      for (const p of vps) L.push(vrow(this.ticketMedio(p.method), this.hhmm(p.time), p.amount.toFixed(2) + (p.mixed ? '*' : ''), (p.client || '').slice(0, 4).toUpperCase(), p.concept, p.code));
      L.push(this.tLine('-'));
      if (vps.some((p) => p.mixed)) L.push('* = Pago mixto (Hospedaje + Productos)');
      L.push(this.tLine('='));
    }

    return this.ticketPage(`Cierre de Caja #${s.number ?? ''}`, L.join('\n'));
  }

  private buildSimpleHtml(
    s: { number: number | null; openedAt: string; closedAt: string | null; openedByName: string; closedByName: string | null },
    delivered: number | null,
  ): string {
    const L: string[] = [];
    L.push(...this.ticketHeader('ENTREGA DE EFECTIVO', s));
    L.push('', this.tCenter('MONTO QUE ESTOY ENTREGANDO'), '', this.tCenter('S/ ' + (delivered ?? 0).toFixed(2)), '');
    L.push(this.tLine('='), '');
    L.push('FIRMA RECEPCIONISTA', '', '____________________', '');
    L.push('RECIBI CONFORME (ADMINISTRACION)', '', '____________________');
    return this.ticketPage('Entrega de efectivo', L.join('\n'));
  }
}
