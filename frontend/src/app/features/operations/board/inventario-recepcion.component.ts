import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { PrintingService } from '../../../core/printing/printing.service';
import { AuthService } from '../../../core/auth/auth.service';
import { printPdf } from '../../../core/utils/export';

interface InvItem { productId: string; name: string; sku?: string | null; categoryId?: string | null; categoryName?: string | null; stockInicial: number; stock: number; min: number; ingresos: number; salidas: number; ajustes: number; belowMin: boolean; }
interface AdjDetail { id: string; at: string; kind: string; productName: string; quantity: number; counterpart: string | null; room: string | null; reason: string | null; user: string | null; approvedBy: string | null; }
interface TurnInfo { shift: string; businessDate: string; startTime: string; endTime: string; isCurrent: boolean; from?: string; to?: string; }
interface WhOpt { id: string; name: string; type: string; }
interface Req { id: string; status: string; createdAt: string; items: { productId: string; name: string; quantity: number }[]; }
interface PrintJob { id: string; type: string; title: string; status: string; createdAt: string; payload?: string | null; }

@Component({
  selector: 'app-inventario-recepcion',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule, TagModule],
  template: `
    <section class="inv">
      <header class="top">
        <h1>Inventario de Recepción</h1>
        <div class="acts">
          <button class="btn blue" (click)="recVisible = true"><i class="pi pi-inbox"></i> Recepcionar Productos @if (sentRequests().length) { <span class="b">{{ sentRequests().length }}</span> }</button>
          <button class="btn green" [disabled]="selected().size === 0" (click)="openRequest()"><i class="pi pi-plus"></i> Solicitar Seleccionados</button>
          @if (canWriteOff()) {
            <button class="btn red" [disabled]="selected().size === 0" (click)="openWriteOff()"><i class="pi pi-minus"></i> Dar de Baja Seleccionados</button>
          }
          <button class="btn ghost" (click)="report(false)"><i class="pi pi-print"></i> Previsualizar Reporte</button>
          <button class="btn ghost" (click)="report(true)"><i class="pi pi-print"></i> Reporte Verificado</button>
        </div>
      </header>

      <div class="bar">
        <span class="search"><i class="pi pi-search"></i><input pInputText placeholder="Buscar artículos por nombre..." [(ngModel)]="search" /></span>
        <p-select [options]="categoryOptions()" optionLabel="label" optionValue="value" [(ngModel)]="categoryFilter" placeholder="Todas las Categorías" [showClear]="true" styleClass="dk" />
      </div>

      <div class="turno">
        <button class="t-nav" (click)="shiftTurno(-1)"><i class="pi pi-chevron-left"></i> Turno Anterior</button>
        <div class="t-info">
          <strong>{{ turnoDate() | date: 'EEEE, d \\'De\\' MMMM \\'De\\' y' }}</strong>
          <span class="muted">{{ turnoLabel() }} @if (turn()?.isCurrent) { <span class="t-act">ACTUAL</span> }</span>
        </div>
        <button class="t-nav" (click)="shiftTurno(1)" [disabled]="turn()?.isCurrent">Siguiente Turno <i class="pi pi-chevron-right"></i></button>
        <span class="spacer"></span>
        <span class="counts"><i class="pi pi-box"></i> {{ filtered().length }} productos | <span class="low-c"><i class="pi pi-exclamation-triangle"></i> {{ lowStockCount() }} bajo stock</span></span>
      </div>

      <table class="tbl">
        <thead><tr>
          <th class="ck"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" /></th>
          <th>NOMBRE</th><th class="n">STOCK INICIAL</th><th class="n">INGRESOS</th><th class="n">SALIDAS</th><th class="n">AJUSTES</th><th class="n">STOCK ACT./MÍN.</th><th class="g"><i class="pi pi-cog"></i></th>
        </tr></thead>
        <tbody>
          @for (it of filtered(); track it.productId) {
            <tr [class.low]="it.belowMin">
              <td class="ck"><input type="checkbox" [checked]="selected().has(it.productId)" (change)="toggle(it.productId)" /></td>
              <td class="name"><span class="ico"><i class="pi pi-box"></i></span><div><div>{{ it.name }}</div><small class="muted">{{ it.sku || '—' }}</small></div></td>
              <td class="n init">{{ it.stockInicial }}</td>
              <td class="n pos">{{ it.ingresos }}</td>
              <td class="n neg">{{ it.salidas }}</td>
              <td class="n adj" [class.clk]="it.ajustes !== 0" (click)="it.ajustes !== 0 && openAjustes(it)"><span [class.pos]="it.ajustes > 0" [class.neg]="it.ajustes < 0">{{ it.ajustes > 0 ? '+' : '' }}{{ it.ajustes }}</span>@if (it.ajustes !== 0) { <i class="pi pi-search-plus av"></i> }</td>
              <td class="n">@if (it.belowMin) { <span class="warn"><i class="pi pi-exclamation-triangle"></i> {{ it.stock }} u.</span> } @else { <span>{{ it.stock }} u.</span> }</td>
              <td class="g"><button class="gear" (click)="openAdjust(it)" title="Registrar ajuste"><i class="pi pi-sliders-h"></i></button></td>
            </tr>
          } @empty { <tr><td colspan="8" class="muted center">Sin productos.</td></tr> }
        </tbody>
      </table>

      <h3 class="sec">Cola de impresión</h3>
      <div class="queue">
        @for (j of queue(); track j.id) {
          <div class="job">
            <span class="jt">{{ j.title }}</span>
            <span class="muted">{{ j.createdAt | date: 'dd/MM HH:mm' }}</span>
            <p-tag [value]="j.status === 'PENDING' ? 'Pendiente' : 'Impreso'" [severity]="j.status === 'PENDING' ? 'warn' : 'secondary'" />
            <p-button label="Imprimir" icon="pi pi-print" size="small" [text]="true" (onClick)="print(j)" />
          </div>
        } @empty { <p class="muted">Sin impresiones en cola.</p> }
      </div>
    </section>

    <!-- Solicitud Masiva de Productos -->
    <p-dialog [(visible)]="reqVisible" [modal]="true" header="Solicitud Masiva de Productos" [style]="{ width: '36rem', maxWidth: '96vw' }" styleClass="dk-dialog">
      <p class="muted rq-sub">Seleccione los productos y cantidades para solicitar al almacén.</p>
      @for (it of selectedItems(); track it.productId) {
        <div class="rq-line">
          <div class="rq-n"><span class="rq-ico"><i class="pi pi-box"></i></span> {{ it.name }}</div>
          <p-inputNumber [(ngModel)]="qty[it.productId]" [min]="1" inputStyleClass="rq-qty" />
          <button class="rq-x" (click)="removeReqLine(it.productId)" title="Quitar"><i class="pi pi-trash"></i></button>
        </div>
      }
      <div class="rq-notes"><span>Notas</span><input pInputText [(ngModel)]="reqNotes" placeholder="Notas adicionales (opcional)" /></div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="reqVisible = false" />
        <p-button label="Enviar Solicitudes" icon="pi pi-send" [loading]="busy()" [disabled]="selectedItems().length === 0" (onClick)="sendRequest()" />
      </ng-template>
    </p-dialog>

    <!-- Baja Masiva de Productos -->
    <p-dialog [(visible)]="woVisible" [modal]="true" header="Baja Masiva de Productos" [style]="{ width: '36rem', maxWidth: '96vw' }" styleClass="dk-dialog">
      <p class="muted rq-sub">Seleccione los productos y cantidades para dar de baja del inventario.</p>
      @for (it of selectedItems(); track it.productId) {
        <div class="rq-line">
          <div class="rq-n"><span class="rq-ico"><i class="pi pi-box"></i></span> {{ it.name }} <small class="muted">(stock {{ it.stock }})</small></div>
          <p-inputNumber [(ngModel)]="qty[it.productId]" [min]="1" [max]="it.stock" inputStyleClass="rq-qty" />
          <button class="rq-x" (click)="removeReqLine(it.productId)" title="Quitar"><i class="pi pi-trash"></i></button>
        </div>
      }
      <div class="rq-notes"><span>Motivo</span><p-select [options]="motivoOpts" optionLabel="label" optionValue="value" [(ngModel)]="woMotivo" styleClass="mot" appendTo="body" /></div>
      <div class="rq-notes"><span>Notas</span><input pInputText [(ngModel)]="woReason" placeholder="Notas adicionales (opcional)" /></div>
      <p class="mot-help">{{ motivoHelp() }}</p>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="woVisible = false" />
        <p-button label="Dar de Baja" icon="pi pi-check" severity="danger" [disabled]="selectedItems().length === 0" [loading]="busy()" (onClick)="doWriteOff()" />
      </ng-template>
    </p-dialog>

    <!-- Registrar ajuste -->
    <p-dialog [(visible)]="adjVisible" [modal]="true" [header]="'Registrar ajuste' + (adjItem ? ' · ' + adjItem.name : '')" [style]="{ width: '32rem', maxWidth: '96vw' }" styleClass="dk-dialog">
      <div class="form">
        <label>Tipo de ajuste</label>
        <p-select [options]="adjKinds" optionLabel="label" optionValue="value" [(ngModel)]="adjForm.kind" appendTo="body" styleClass="w" />
        <label>Cantidad</label>
        <p-inputNumber [(ngModel)]="adjForm.quantity" [min]="1" [showButtons]="true" styleClass="w" />
        @if (adjForm.kind === 'TRANSFER') {
          <label>Almacén destino</label>
          <p-select [options]="warehouses()" optionLabel="name" optionValue="id" [(ngModel)]="adjForm.toWarehouseId" placeholder="Elegir almacén" appendTo="body" styleClass="w" />
        }
        @if (adjForm.kind === 'VENTA_NO_REGISTRADA') {
          <label>Caja / turno de origen</label>
          <p-select [options]="cajaOpts()" optionLabel="label" optionValue="value" [(ngModel)]="adjForm.sessionId" [filter]="true" filterBy="label" placeholder="Elegir la caja donde ocurrió" appendTo="body" styleClass="w" [loading]="cajasLoading()" />
          <label>Precio unitario (S/)</label>
          <p-inputNumber [(ngModel)]="adjForm.unitPrice" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
          <label>Clasificación del cobro</label>
          <p-select [options]="vnrClassOpts" optionLabel="label" optionValue="value" [(ngModel)]="adjForm.classification" appendTo="body" styleClass="w" />
          @if (adjForm.classification === 'COBRADA') {
            <label>Medio de pago</label>
            <p-select [options]="vnrMethodOpts" optionLabel="label" optionValue="value" [(ngModel)]="adjForm.method" (onChange)="onVnrMethodChange()" appendTo="body" styleClass="w" />
            @if (vnrNeedsCode()) {
              <label>Código de verificación / operación</label>
              <input pInputText [(ngModel)]="adjForm.verifyCode" placeholder="N° de operación (obligatorio)" />
            }
          }
        }
        <label>Motivo / observación</label>
        <input pInputText [(ngModel)]="adjForm.reference" placeholder="Opcional" />
        <p class="adj-hint">
          @switch (adjForm.kind) {
            @case ('SOBRANTE') { <i class="pi pi-info-circle"></i> Retira el excedente del área y lo regresa al Almacén General. }
            @case ('VENCIDO') { <i class="pi pi-info-circle"></i> Baja definitiva por vencimiento (no mueve caja, no regresa a stock). }
            @case ('MERMA') { <i class="pi pi-info-circle"></i> Producto perdido/dañado (baja definitiva, no mueve caja). }
            @case ('FALTANTE') { <i class="pi pi-info-circle"></i> Diferencia (sistema > físico) pendiente de revisión. No genera venta ni descuento. }
            @case ('TRANSFER') { <i class="pi pi-info-circle"></i> Transferencia interna entre almacenes (p. ej. Recepción ↔ Productos-Limpieza). }
            @case ('VENTA_NO_REGISTRADA') { <i class="pi pi-info-circle"></i> Descuenta el producto y registra la venta no registrada en la caja/turno seleccionado. Si la caja estaba cerrada, quedará como AJUSTADA (conserva su cierre). Cobrada = regularizada; No cobrada = deuda del turno; Por verificar = pendiente de revisión. }
          }
        </p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="adjVisible = false" />
        <p-button label="Registrar" icon="pi pi-check" [loading]="busy()" (onClick)="saveAdjust()" />
      </ng-template>
    </p-dialog>

    <!-- Detalle de ajustes -->
    <p-dialog [(visible)]="adjDetailVisible" [modal]="true" [header]="'Ajustes' + (adjDetailItem ? ' · ' + adjDetailItem.name : '')" [style]="{ width: '48rem', maxWidth: '97vw' }" styleClass="dk-dialog">
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Fecha/Hora</th><th>Tipo</th><th class="n">Cant.</th><th>Origen/Destino o Motivo</th><th>Usuario</th>@if (canAttributeLoss()) { <th class="c">Acción</th> }</tr></thead>
          <tbody>
            @for (a of adjDetail(); track a.id) {
              <tr>
                <td>{{ a.at | date: 'dd/MM HH:mm' }}</td>
                <td><span class="adj-tag">{{ adjKindLabel(a.kind) }}</span></td>
                <td class="n"><span [class.pos]="a.quantity > 0" [class.neg]="a.quantity < 0">{{ a.quantity > 0 ? '+' : '' }}{{ a.quantity }}</span></td>
                <td>{{ a.counterpart || a.room || a.reason || '—' }}</td>
                <td>{{ a.user || '—' }}@if (a.approvedBy) { <small class="muted"> · aprobó {{ a.approvedBy }}</small> }</td>
                @if (canAttributeLoss()) {
                  <td class="c">
                    @if (a.kind === 'FALTANTE') { <button class="mini warn" (click)="openAttribute(a)"><i class="pi pi-user"></i> Atribuir</button> }
                    @else if (a.kind === 'PERDIDA_COLABORADOR') { <span class="adj-tag ok">Atribuido</span> }
                  </td>
                }
              </tr>
            } @empty { <tr><td [attr.colspan]="canAttributeLoss() ? 6 : 5" class="muted center">Sin ajustes en el turno.</td></tr> }
          </tbody>
        </table>
      </div>
    </p-dialog>

    <!-- Atribuir pérdida al colaborador -->
    <p-dialog [(visible)]="attrVisible" [modal]="true" header="Atribuir pérdida al colaborador" [style]="{ width: '30rem', maxWidth: '96vw' }" styleClass="dk-dialog">
      <div class="form">
        <p class="muted">Reclasifica un faltante de inventario como pérdida atribuida a un colaborador. No mueve caja ni stock; queda registrado con tu aprobación.</p>
        <label>Colaborador</label>
        <input pInputText [(ngModel)]="attrForm.collaborator" placeholder="Nombre del responsable" />
        <label>Importe estimado (S/) — opcional</label>
        <p-inputNumber [(ngModel)]="attrForm.amount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label>Observación</label>
        <input pInputText [(ngModel)]="attrForm.note" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="attrVisible = false" />
        <p-button label="Atribuir" icon="pi pi-check" [loading]="busy()" (onClick)="saveAttribute()" />
      </ng-template>
    </p-dialog>

    <!-- Recepcionar -->
    <p-dialog [(visible)]="recVisible" [modal]="true" header="Recepcionar productos" [style]="{ width: '34rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (r of sentRequests(); track r.id) {
          <div class="req">
            <div class="req-head"><span>Solicitud {{ r.id.slice(0,8) }}</span><span class="muted">{{ r.createdAt | date: 'dd/MM HH:mm' }}</span></div>
            <div class="req-items">@for (i of r.items; track i.productId) { <span class="chip">{{ i.name }} x{{ i.quantity }}</span> }</div>
            <p-button label="Confirmar recepción" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="receive(r.id)" />
          </div>
        } @empty { <p class="muted">No hay productos enviados por recepcionar.</p> }
      </div>
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="recVisible = false" /></ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .inv { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; } h3.sec { margin: 1.5rem 0 0.6rem; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      .acts { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .btn { border: 0; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; font-weight: 700; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.4rem; color: #fff; }
      .btn.blue { background: #2563eb; } .btn.green { background: #10b981; color: #04130d; } .btn.red { background: #dc2626; }
      .btn.ghost { background: #131d2b; border: 1px solid #243245; color: #cdd8e6; }
      .btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .btn .b { background: rgba(0,0,0,0.3); border-radius: 999px; padding: 0 0.4rem; font-size: 0.72rem; }
      .bar { display: flex; gap: 0.6rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
      .search { position: relative; flex: 1; min-width: 240px; } .search i { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .search input { width: 100%; background: #131d2b; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.6rem 0.7rem 0.6rem 2rem; }
      :host ::ng-deep .dk .p-select { background: #131d2b; border-color: #243245; min-width: 220px; }
      .turno { display: flex; align-items: center; gap: 1rem; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 0.8rem 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .t-nav { background: #131d2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.82rem; }
      .t-nav:disabled { opacity: 0.4; cursor: not-allowed; }
      .t-info { text-align: center; } .t-info strong { display: block; text-transform: capitalize; }
      .t-act { background: #10b981; color: #04130d; font-size: 0.66rem; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: 999px; margin-left: 0.3rem; }
      .spacer { flex: 1; } .counts { color: #cdd8e6; font-size: 0.85rem; } .low-c { color: #fbbf24; }
      .name { display: flex; align-items: center; gap: 0.6rem; } .name .ico { background: #1a2333; padding: 0.35rem; border-radius: 7px; color: #8b97a8; }
      .init { color: #60a5fa; font-weight: 700; }
      .warn { color: #fbbf24; font-weight: 700; display: inline-flex; align-items: center; gap: 0.3rem; }
      .g { text-align: center; width: 3rem; } .gear { background: transparent; border: 0; color: #8b97a8; cursor: pointer; } .gear:hover { color: #fff; }
      .muted { color: #8b97a8; } .center { text-align: center; } .c { text-align: center; } .n { text-align: right; } .pos { color: #34d399; } .neg { color: #f87171; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.3rem 0.6rem; font-size: 0.74rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; }
      .mini.warn { background: #78350f; color: #fcd34d; border-color: #b45309; }
      .adj-tag.ok { background: rgba(52,211,153,0.18); color: #34d399; }
      .adj.clk { cursor: pointer; } .adj.clk:hover { background: rgba(96,165,250,0.08); } .adj .av { font-size: 0.72rem; color: #93c5fd; margin-left: 0.3rem; }
      .adj-hint { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0.6rem 0 0; font-size: 0.8rem; color: #8b97a8; }
      .adj-tag { font-size: 0.72rem; font-weight: 700; padding: 0.12rem 0.5rem; border-radius: 6px; background: rgba(148,163,184,0.18); color: #cbd5e1; }
      :host ::ng-deep .form .w { width: 100%; }
      .tbl-wrap { overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; background: #131d2b; border: 1px solid #243245; border-radius: 10px; overflow: hidden; }
      .tbl th { text-align: left; padding: 0.6rem 0.8rem; background: #0e1622; color: #9fb0c3; font-size: 0.8rem; }
      .tbl td { padding: 0.6rem 0.8rem; border-top: 1px solid #1c2a3a; font-size: 0.9rem; }
      .tbl th.n, .tbl td.n { text-align: right; } .ck { width: 2.2rem; text-align: center; }
      .tbl tr.low td { background: rgba(245,158,11,0.08); }
      .queue { display: flex; flex-direction: column; gap: 0.4rem; }
      .job { display: flex; align-items: center; gap: 0.8rem; background: #131d2b; border: 1px solid #243245; border-radius: 8px; padding: 0.5rem 0.8rem; }
      .jt { flex: 1; }
      .form { display: flex; flex-direction: column; gap: 0.5rem; }
      .form label { font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      :host ::ng-deep .form input { width: 100%; }
      .qrow { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
      .rq-sub { color: #8b97a8; font-size: 0.82rem; margin: 0 0 0.8rem; }
      .rq-line { display: flex; align-items: center; gap: 0.7rem; background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.5rem; }
      .rq-n { flex: 1; display: flex; align-items: center; gap: 0.5rem; font-weight: 600; } .rq-ico { background: #16233a; padding: 0.3rem; border-radius: 6px; color: #8b97a8; }
      :host ::ng-deep .rq-qty { width: 5rem; text-align: center; }
      .rq-x { background: transparent; border: 0; color: #f87171; cursor: pointer; }
      .rq-notes { display: flex; align-items: center; gap: 0.7rem; margin-top: 0.6rem; } .rq-notes span { color: #8aa0bd; font-size: 0.85rem; min-width: 3.4rem; } .rq-notes input { flex: 1; } :host ::ng-deep .rq-notes .mot { flex: 1; }
      .mot-help { color: #8b97a8; font-size: 0.78rem; margin: 0.6rem 0 0; font-style: italic; }
      .req { border: 1px solid #243245; border-radius: 8px; padding: 0.7rem; margin-bottom: 0.6rem; }
      .req-head { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
      .req-items { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
      .chip { background: #1b2433; border: 1px solid #2a3850; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.78rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class InventarioRecepcionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly printing = inject(PrintingService);
  private readonly auth = inject(AuthService);
  /** Solo gerente/admin (permiso inventory:delete) pueden dar de baja productos. */
  canWriteOff(): boolean { return this.auth.can('inventory', 'delete'); }

  readonly items = signal<InvItem[]>([]);
  readonly requests = signal<Req[]>([]);
  readonly queue = signal<PrintJob[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  qty: Record<string, number> = {};
  woReason = '';
  reqNotes = '';
  woMotivo: 'VENCIDO' | 'PERDIDO' | 'SOBRANTE' = 'VENCIDO';
  // Frecuencia del aviso de stock mínimo (Configuración Operativa); recuerda cada N horas.
  private stockAlertEveryHours = 24;
  readonly motivoOpts = [
    { label: 'Vencido', value: 'VENCIDO' }, { label: 'Perdido', value: 'PERDIDO' }, { label: 'Sobrante', value: 'SOBRANTE' },
  ];
  motivoHelp(): string {
    if (this.woMotivo === 'SOBRANTE') return 'Sobrante: la cantidad regresa al Almacén de Productos general.';
    if (this.woMotivo === 'PERDIDO') return 'Perdido: sale del inventario; queda el rastro para descontar.';
    return 'Vencido: sale del inventario y del sistema (queda registro).';
  }
  reqVisible = false; woVisible = false; recVisible = false;

  search = '';
  categoryFilter: string | null = null;
  // Turno seleccionado (día + turno). El backend calcula el actual en la 1ª carga.
  readonly turn = signal<TurnInfo | null>(null);
  readonly whId = signal<string>('');
  // Registrar ajuste
  readonly warehouses = signal<WhOpt[]>([]);
  adjVisible = false;
  adjItem: InvItem | null = null;
  adjForm: { kind: 'SOBRANTE' | 'VENCIDO' | 'MERMA' | 'FALTANTE' | 'TRANSFER' | 'VENTA_NO_REGISTRADA'; quantity: number; reference: string; toWarehouseId: string | null; classification: 'COBRADA' | 'NO_COBRADA' | 'POR_VERIFICAR'; unitPrice: number | null; method: string; sessionId: string | null; verifyCode: string } = { kind: 'SOBRANTE', quantity: 1, reference: '', toWarehouseId: null, classification: 'COBRADA', unitPrice: null, method: 'CASH', sessionId: null, verifyCode: '' };
  // Cajas/turnos seleccionables para "Venta no registrada" (abiertas, cerradas y ajustadas).
  readonly cajas = signal<{ id: string; number: number | null; status: string; openedAt: string; closedAt: string | null; openedByName: string }[]>([]);
  readonly cajasLoading = signal(false);
  readonly cajaOpts = computed(() => this.cajas().map((c) => ({ value: c.id, label: this.cajaLabel(c) })));
  readonly adjKinds = [
    { label: 'Sobrante (regresa a Almacén General)', value: 'SOBRANTE' },
    { label: 'Vencido', value: 'VENCIDO' },
    { label: 'Perdido / Merma', value: 'MERMA' },
    { label: 'Faltante de inventario', value: 'FALTANTE' },
    { label: 'Transferencia interna', value: 'TRANSFER' },
    { label: 'Venta no registrada', value: 'VENTA_NO_REGISTRADA' },
  ];
  readonly vnrClassOpts = [
    { label: 'Cobrada (con medio de pago)', value: 'COBRADA' },
    { label: 'No cobrada (incidencia del colaborador)', value: 'NO_COBRADA' },
    { label: 'Por verificar (revisión de administración)', value: 'POR_VERIFICAR' },
  ];
  readonly vnrMethodOpts = [
    { label: 'Efectivo', value: 'CASH' }, { label: 'Tarjeta', value: 'CARD' }, { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Yape', value: 'YAPE' }, { label: 'Plin', value: 'PLIN' }, { label: 'Billetera', value: 'WALLET' },
  ];
  // Detalle interactivo de ajustes
  adjDetailVisible = false;
  adjDetailItem: InvItem | null = null;
  readonly adjDetail = signal<AdjDetail[]>([]);
  readonly ADJ_LABEL: Record<string, string> = { TRANSFER: 'Transferencia interna', SOBRANTE: 'Sobrante', VENCIDO: 'Vencido', MERMA: 'Perdido/Merma', FALTANTE: 'Faltante', VENTA_NO_REGISTRADA: 'Venta no registrada', PERDIDA_COLABORADOR: 'Pérdida atribuida', ADJUST: 'Ajuste' };
  private fDay: string | null = null;
  private curShift: string | null = null;
  private readonly SHIFTS = ['MANANA', 'TARDE', 'NOCHE'];
  private readonly SHIFT_NAME: Record<string, string> = { MANANA: 'Turno Mañana', TARDE: 'Turno Tarde', NOCHE: 'Turno Noche' };

  readonly sentRequests = computed(() => this.requests().filter((r) => r.status === 'SENT'));
  readonly selectedItems = computed(() => this.items().filter((i) => this.selected().has(i.productId)));

  categoryOptions(): { label: string; value: string }[] {
    const map = new Map<string, string>();
    for (const it of this.items()) if (it.categoryId && it.categoryName) map.set(it.categoryId, it.categoryName);
    return [...map].map(([value, label]) => ({ label, value }));
  }

  filtered(): InvItem[] {
    const q = this.search.toLowerCase();
    return this.items().filter((it) => {
      if (q && !(it.name.toLowerCase().includes(q) || (it.sku ?? '').toLowerCase().includes(q))) return false;
      if (this.categoryFilter && it.categoryId !== this.categoryFilter) return false;
      return true;
    });
  }

  lowStockCount(): number { return this.filtered().filter((it) => it.belowMin).length; }
  stockInicial(it: InvItem): number { return it.stockInicial; }

  allSelected(): boolean { const f = this.filtered(); return f.length > 0 && f.every((it) => this.selected().has(it.productId)); }
  toggleAll(): void {
    if (this.allSelected()) this.selected.set(new Set());
    else { const s = new Set<string>(); for (const it of this.filtered()) { s.add(it.productId); this.qty[it.productId] = this.qty[it.productId] || 1; } this.selected.set(s); }
  }

  // Navegación turno por turno (usa la ventana real del backend por config de Horarios).
  turnoDate(): Date { return new Date((this.turn()?.businessDate ?? this.fDay ?? '') + 'T12:00:00'); }
  turnoLabel(): string {
    const t = this.turn();
    if (!t) return '';
    return `${this.SHIFT_NAME[t.shift] ?? t.shift} - ${t.startTime} - ${t.endTime}`;
  }
  shiftTurno(dir: number): void {
    const t = this.turn();
    if (!t) return;
    if (dir > 0 && t.isCurrent) return;
    let idx = this.SHIFTS.indexOf(t.shift) + dir;
    let day = new Date(t.businessDate + 'T12:00:00');
    if (idx > 2) { idx = 0; day.setDate(day.getDate() + 1); }
    if (idx < 0) { idx = 2; day.setDate(day.getDate() - 1); }
    this.fDay = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    this.curShift = this.SHIFTS[idx];
    this.reload();
  }

  report(verified: boolean): void {
    const rows = this.filtered().map((it) =>
      `<tr><td>${it.sku ?? ''}</td><td>${it.name}</td><td class="num">${this.stockInicial(it)}</td><td class="num">${it.ingresos}</td><td class="num">${it.salidas}</td><td class="num">${it.stock}/${it.min}</td></tr>`,
    ).join('');
    const body = `<div class="meta">${this.turnoLabel()} · ${verified ? 'VERIFICADO' : 'Previsualización'}</div>
      <table><thead><tr><th>Código</th><th>Artículo</th><th class="num">Inicial</th><th class="num">Ingresos</th><th class="num">Salidas</th><th class="num">Act./Mín</th></tr></thead><tbody>${rows}</tbody></table>`;
    printPdf('Inventario de Recepción · RIZZOS', body);
  }

  adjKindLabel(k: string): string { return this.ADJ_LABEL[k] ?? k; }

  openAdjust(it: InvItem): void {
    this.adjItem = it;
    this.adjForm = { kind: 'SOBRANTE', quantity: 1, reference: '', toWarehouseId: null, classification: 'COBRADA', unitPrice: null, method: 'CASH', sessionId: null, verifyCode: '' };
    if (!this.warehouses().length) {
      this.http.get<ApiResponse<WhOpt[]>>(`${this.api}/warehouses`, { params: { pageSize: '100' } }).subscribe((r) => this.warehouses.set(r.data ?? []));
    }
    this.loadCajas();
    this.adjVisible = true;
  }

  /** Carga cajas seleccionables (abiertas, cerradas y ajustadas) para "Venta no registrada". */
  private loadCajas(): void {
    this.cajasLoading.set(true);
    this.http.get<ApiResponse<{ id: string; number: number | null; status: string; openedAt: string; closedAt: string | null; openedByName: string }[]>>(`${this.api}/cash/sessions`, { params: { pageSize: '50' } }).subscribe({
      next: (r) => {
        const list = r.data ?? [];
        this.cajas.set(list);
        // Default: la caja abierta actual (si hay); si no, no fuerza selección (se elige la histórica).
        const open = list.find((c) => c.status === 'OPEN');
        this.adjForm.sessionId = open?.id ?? null;
        this.cajasLoading.set(false);
      },
      error: () => this.cajasLoading.set(false),
    });
  }

  /** Formatea fecha/hora sin DatePipe (evita depender de un locale registrado). */
  private fmtDT(iso: string, withDate = true): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
    return withDate ? `${p(d.getDate())}/${p(d.getMonth() + 1)} ${time}` : time;
  }
  cajaLabel(c: { number: number | null; status: string; openedAt: string; closedAt: string | null; openedByName: string }): string {
    const est = c.status === 'OPEN' ? 'Abierta' : c.status === 'AJUSTADA' ? 'Ajustada' : 'Cerrada';
    const ini = this.fmtDT(c.openedAt, true);
    const fin = c.closedAt ? this.fmtDT(c.closedAt, false) : '—';
    return `Caja #${c.number ?? '—'} · ${ini}–${fin} · ${c.openedByName} · ${est}`;
  }

  /** Regla general: los medios distintos de efectivo requieren código de verificación. */
  vnrNeedsCode(): boolean { return this.adjForm.classification === 'COBRADA' && this.adjForm.method !== 'CASH'; }
  onVnrMethodChange(): void { if (this.adjForm.method === 'CASH') this.adjForm.verifyCode = ''; }

  // ── Pérdida atribuida al colaborador (reclasifica un FALTANTE; solo administración) ──
  attrVisible = false;
  attrTarget: AdjDetail | null = null;
  attrForm: { collaborator: string; amount: number | null; note: string } = { collaborator: '', amount: null, note: '' };
  canAttributeLoss(): boolean { return this.auth.can('settings', 'edit'); }

  openAttribute(a: AdjDetail): void {
    this.attrTarget = a;
    this.attrForm = { collaborator: '', amount: null, note: '' };
    this.attrVisible = true;
  }

  saveAttribute(): void {
    const a = this.attrTarget;
    if (!a) return;
    this.busy.set(true);
    const body: Record<string, unknown> = { movementId: a.id, collaborator: this.attrForm.collaborator || undefined, amount: this.attrForm.amount ?? undefined, note: this.attrForm.note || undefined };
    this.http.post<ApiResponse<unknown>>(`${this.api}/reconciliation/attribute-loss`, body).subscribe({
      next: () => {
        this.busy.set(false); this.attrVisible = false;
        this.toast.add({ severity: 'success', summary: 'Pérdida atribuida', detail: 'El faltante quedó atribuido al colaborador.' });
        if (this.adjDetailItem) this.openAjustes(this.adjDetailItem);
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo atribuir la pérdida.' }); },
    });
  }

  saveAdjust(): void {
    const it = this.adjItem;
    if (!it || !this.whId()) return;
    if (!this.adjForm.quantity || this.adjForm.quantity < 1) { this.toast.add({ severity: 'warn', summary: 'Cantidad', detail: 'Indica una cantidad válida.' }); return; }
    if (this.adjForm.kind === 'TRANSFER' && !this.adjForm.toWarehouseId) { this.toast.add({ severity: 'warn', summary: 'Destino', detail: 'Elige el almacén destino.' }); return; }

    // Venta no registrada: crea la venta marcada en la CAJA/TURNO seleccionado (fuente única).
    if (this.adjForm.kind === 'VENTA_NO_REGISTRADA') {
      if (!this.adjForm.sessionId) { this.toast.add({ severity: 'warn', summary: 'Caja', detail: 'Elige la caja/turno de origen.' }); return; }
      if (!this.adjForm.unitPrice || this.adjForm.unitPrice <= 0) { this.toast.add({ severity: 'warn', summary: 'Precio', detail: 'Indica el precio unitario.' }); return; }
      if (this.vnrNeedsCode() && !this.adjForm.verifyCode.trim()) { this.toast.add({ severity: 'warn', summary: 'Código', detail: 'Ingresa el código de verificación del pago.' }); return; }
      this.busy.set(true);
      const vnr: Record<string, unknown> = {
        sessionId: this.adjForm.sessionId,
        productId: it.productId, warehouseId: this.whId(), quantity: this.adjForm.quantity, unitPrice: this.adjForm.unitPrice,
        classification: this.adjForm.classification, note: this.adjForm.reference || undefined,
      };
      if (this.adjForm.classification === 'COBRADA') {
        vnr['method'] = this.adjForm.method;
        if (this.vnrNeedsCode()) vnr['reference'] = this.adjForm.verifyCode.trim();
      }
      this.http.post<ApiResponse<unknown>>(`${this.api}/reconciliation/unregistered-sale`, vnr).subscribe({
        next: () => { this.busy.set(false); this.adjVisible = false; this.toast.add({ severity: 'success', summary: 'Venta registrada', detail: `Venta no registrada · ${it.name}` }); this.reload(); },
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar la venta.' }); },
      });
      return;
    }

    this.busy.set(true);
    const body: Record<string, unknown> = { kind: this.adjForm.kind, productId: it.productId, warehouseId: this.whId(), quantity: this.adjForm.quantity, reference: this.adjForm.reference || undefined };
    if (this.adjForm.kind === 'TRANSFER') body['toWarehouseId'] = this.adjForm.toWarehouseId;
    this.http.post<ApiResponse<unknown>>(`${this.api}/adjustments`, body).subscribe({
      next: () => { this.busy.set(false); this.adjVisible = false; this.toast.add({ severity: 'success', summary: 'Ajuste registrado', detail: `${this.adjKindLabel(this.adjForm.kind)} · ${it.name}` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar el ajuste.' }); },
    });
  }

  openAjustes(it: InvItem): void {
    this.adjDetailItem = it;
    this.adjDetail.set([]);
    this.adjDetailVisible = true;
    const t = this.turn();
    const params: Record<string, string> = { warehouseId: this.whId(), productId: it.productId };
    if (t?.from) params['from'] = t.from;
    if (t?.to) params['to'] = t.to;
    this.http.get<ApiResponse<AdjDetail[]>>(`${this.api}/adjustments/detail`, { params }).subscribe((r) => this.adjDetail.set(r.data ?? []));
  }

  ngOnInit(): void {
    this.http.get<ApiResponse<{ stockAlertEveryHours?: number }>>(`${this.api}/operations-config`)
      .subscribe((r) => { if (r.data?.stockAlertEveryHours != null) this.stockAlertEveryHours = r.data.stockAlertEveryHours; });
    this.reload();
  }

  /** Recuerda con un aviso cuando hay productos bajo el mínimo, re-emitiendo cada N horas. */
  private maybeAlertLowStock(items: InvItem[]): void {
    const low = items.filter((it) => it.belowMin);
    if (!low.length) return;
    const hours = this.stockAlertEveryHours;
    if (hours <= 0) return; // 0 = sin recordatorios recurrentes
    const key = `lowStockAlert:${this.auth.activeBranchId() ?? 'default'}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < hours * 3_600_000) return;
    localStorage.setItem(key, String(Date.now()));
    this.toast.add({ severity: 'warn', summary: 'Stock bajo mínimo', detail: `${low.length} producto(s) por debajo del mínimo. Solicita reposición.`, life: 6000 });
  }

  reload(): void {
    const params: Record<string, string> = {};
    if (this.fDay && this.curShift) { params['date'] = this.fDay; params['shift'] = this.curShift; }
    this.http.get<ApiResponse<{ items: InvItem[]; turn: TurnInfo; warehouseId: string }>>(`${this.api}/reception-inventory`, { params }).subscribe((r) => {
      if (r.data?.warehouseId) this.whId.set(r.data.warehouseId);
      this.items.set(r.data?.items ?? []);
      this.maybeAlertLowStock(r.data?.items ?? []);
      if (r.data?.turn) { this.turn.set(r.data.turn); this.fDay = r.data.turn.businessDate; this.curShift = r.data.turn.shift; }
    });
    this.http.get<ApiResponse<Req[]>>(`${this.api}/reception-inventory/requests`).subscribe((r) => this.requests.set(r.data ?? []));
    this.http.get<ApiResponse<PrintJob[]>>(`${this.api}/reception-inventory/print-queue`).subscribe((r) => this.queue.set(r.data ?? []));
  }

  toggle(id: string): void {
    const s = new Set(this.selected());
    if (s.has(id)) s.delete(id); else { s.add(id); this.qty[id] = this.qty[id] || 1; }
    this.selected.set(s);
  }

  openRequest(): void { for (const it of this.selectedItems()) this.qty[it.productId] = this.qty[it.productId] || 1; this.reqVisible = true; }
  openWriteOff(): void { for (const it of this.selectedItems()) this.qty[it.productId] = this.qty[it.productId] || 1; this.woReason = ''; this.woVisible = true; }

  removeReqLine(id: string): void { const s = new Set(this.selected()); s.delete(id); this.selected.set(s); }
  sendRequest(): void {
    this.busy.set(true);
    const items = this.selectedItems().map((it) => ({ productId: it.productId, quantity: this.qty[it.productId] || 1 }));
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/requests`, { items, notes: this.reqNotes || undefined }).subscribe({
      next: () => { this.busy.set(false); this.reqVisible = false; this.selected.set(new Set()); this.reqNotes = ''; this.toast.add({ severity: 'success', summary: 'Solicitud enviada', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  doWriteOff(): void {
    // Solo se puede dar de baja lo que hay en recepción; se omiten los de stock 0.
    const items = this.selectedItems().filter((it) => it.stock > 0);
    const sinStock = this.selectedItems().length - items.length;
    if (!items.length) {
      this.toast.add({ severity: 'warn', summary: 'Sin stock en recepción', detail: 'Los productos seleccionados no tienen stock en recepción para dar de baja.' });
      return;
    }
    this.busy.set(true);
    let done = 0; const errors: string[] = [];
    const next = (i: number) => {
      if (i >= items.length) {
        this.busy.set(false); this.woVisible = false; this.selected.set(new Set());
        const extra = sinStock ? ` · ${sinStock} sin stock omitido(s)` : '';
        this.toast.add({
          severity: errors.length ? 'warn' : 'success',
          summary: 'Bajas',
          detail: `${done} dada(s) de baja${errors.length ? ` · ${errors.length} con error: ${errors[0]}` : ''}${extra}`,
        });
        this.reload(); return;
      }
      const it = items[i];
      const qty = Math.min(this.qty[it.productId] || 1, it.stock); // nunca más que el stock
      this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/write-off`, { productId: it.productId, quantity: qty, motivo: this.woMotivo, notes: this.woReason || undefined }).subscribe({
        next: () => { done++; next(i + 1); },
        error: (e: { error?: { error?: { message?: string } } }) => { errors.push(e.error?.error?.message ?? 'error'); next(i + 1); },
      });
    };
    next(0);
  }

  /** Construye el comprobante e intenta imprimir por QZ; si no está, abre la vista previa del navegador. */
  async print(j: PrintJob): Promise<void> {
    const html = this.buildReceipt(j);
    try {
      await this.printing.printHtml(html); // QZ Tray (impresión directa)
      this.toast.add({ severity: 'success', summary: 'Impresión', detail: 'Enviado a QZ Tray.' });
    } catch {
      // QZ no disponible → vista previa del navegador (el usuario elige impresora).
      this.printing.printViaBrowser(html);
    }
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/print-queue/${j.id}/printed`, {}).subscribe({
      next: () => this.reload(),
      error: () => undefined,
    });
  }

  private buildReceipt(j: PrintJob): string {
    let rows = '';
    try {
      const items = JSON.parse(j.payload ?? '[]') as { name?: string; productId?: string; quantity: number }[];
      rows = items
        .map((i) => `<tr><td>${i.name ?? i.productId ?? 'Ítem'}</td><td style="text-align:right">${i.quantity}</td></tr>`)
        .join('');
    } catch {
      rows = '';
    }
    const now = new Date().toLocaleString('es-PE');
    return `
      <div style="font-family: 'Courier New', monospace; width: 280px; color: #000;">
        <h3 style="text-align:center; margin:0 0 4px;">RIZZOS</h3>
        <div style="text-align:center; font-size:12px; margin-bottom:8px;">${j.title}</div>
        <div style="font-size:11px;">Fecha: ${now}</div>
        <hr />
        <table style="width:100%; font-size:12px; border-collapse:collapse;">
          <thead><tr><th style="text-align:left">Producto</th><th style="text-align:right">Cant.</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="2">Sin detalle</td></tr>'}</tbody>
        </table>
        <hr />
        <div style="text-align:center; font-size:11px;">Comprobante interno de recepción</div>
      </div>`;
  }

  receive(id: string): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/requests/${id}/receive`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Recepcionado', detail: 'Stock actualizado.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
