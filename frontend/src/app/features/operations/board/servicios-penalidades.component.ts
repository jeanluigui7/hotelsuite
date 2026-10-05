import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import { buildSaleReceipt } from '../../finance/tickets/receipt';
import type { Sale } from '../../finance/services/finance.models';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';

type Tipo = 'SERVICIO' | 'PENALIDAD';
interface TreeConcept {
  id: string; name: string; price: number; unit: string;
  attentionMode: 'NONE' | 'LINEN_EXTRA';
  inventoryOrigin: 'ROPA' | 'AMENITY' | null; inventoryCategoryId: string | null; inventoryCategoryName: string | null;
  articleScope: string; allowCourtesy: boolean; allowFreeAmount: boolean;
}
interface TreeGroup { id: string; name: string; concepts: TreeConcept[]; }
interface TreeCat { id: string; name: string; groups: TreeGroup[]; }
interface CartLine {
  key: string; conceptId: string; name: string; unitPrice: number; basePrice: number; quantity: number;
  isLinen: boolean; courtesy: boolean; courtesyReason: string; freeAmount: boolean; categoryName: string | null; tipo: Tipo;
}
interface Pay { method: 'CASH' | 'CARD' | 'TRANSFER' | 'YAPE' | 'PLIN'; amount: number; reference?: string; }

const METHODS = [
  { label: 'Efectivo', value: 'CASH' }, { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' }, { label: 'Yape', value: 'YAPE' }, { label: 'Plin', value: 'PLIN' },
];
const round = (n: number): number => Math.round(n * 100) / 100;

@Component({
  selector: 'app-servicios-penalidades',
  standalone: true,
  imports: [DecimalPipe, FormsModule, DialogModule, SelectModule, InputNumberModule, InputTextModule, ToggleSwitchModule, ButtonModule],
  template: `
    <p-dialog [(visible)]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" header="SERVICIOS / PENALIDADES"
              [style]="{ width: '72rem', maxWidth: '96vw' }" styleClass="dk-dialog" (onShow)="load()">
      <div class="grid">
        <!-- ───────── Columna izquierda: estadía + condiciones ───────── -->
        <div class="left">
          <div class="box">
            <label>Habitación</label>
            <p-select [options]="stays()" [(ngModel)]="stayId" (onChange)="onStayChange()" optionValue="id" [filter]="true" filterBy="room.number" placeholder="Selecciona una habitación ocupada" styleClass="w" appendTo="body">
              <ng-template let-s pTemplate="item">{{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
              <ng-template let-s pTemplate="selectedItem">Habitación {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
            </p-select>
            @if (currentStay(); as s) { <div class="guest"><i class="pi pi-user"></i> {{ s.guest.firstName }} {{ s.guest.lastName }}</div> }
          </div>

          <div class="box">
            <div class="box-t">Condiciones del servicio</div>
            <div class="cond-row"><div><b>Generar comprobante</b><small>Boleta / Factura electrónica</small></div><p-toggleswitch [(ngModel)]="genComp" (onChange)="onGenComp()" /></div>
            @if (genComp) {
              <div class="comp-body">
                @if (stayId) { <label class="chk"><input type="checkbox" [(ngModel)]="compUseGuest" (change)="applyGuestData()" /> Usar los datos del huésped</label> }
                <div class="seg2">
                  <button [class.on]="compDocType === 'DNI'" (click)="compDocType = 'DNI'">DNI (Boleta)</button>
                  <button [class.on]="compDocType === 'RUC'" (click)="compDocType = 'RUC'">RUC (Factura)</button>
                </div>
                <input pInputText [(ngModel)]="compDocNumber" [readonly]="compUseGuest && !!stayId" placeholder="N° de documento" />
                <input pInputText [(ngModel)]="compName" [readonly]="compUseGuest && !!stayId" placeholder="Nombre / Razón social" />
                <input pInputText [(ngModel)]="compAddress" placeholder="Dirección (opcional)" />
                @if (compError()) { <p class="err"><i class="pi pi-exclamation-triangle"></i> {{ compError() }}</p> }
              </div>
            }

            <!-- Cortesía (morado) -->
            <div class="cortesia" [class.on]="courtesy">
              <div class="cond-row"><div><b><i class="pi pi-gift"></i> Cortesía</b><small>Sin costo para el huésped.</small></div><p-toggleswitch [(ngModel)]="courtesy" [disabled]="tab() === 'PENALIDAD'" /></div>
              @if (courtesy) {
                <label class="c-lbl">Motivo de la cortesía</label>
                <input pInputText [(ngModel)]="courtesyReason" placeholder="Ej. Desayuno incluido — Matrimonial premium" />
                <div class="c-note"><i class="pi pi-info-circle"></i> El ítem se registrará con importe S/ 0.00; no genera deuda.</div>
              }
            </div>

            <div class="cond-row"><div><b>Monto libre</b><small>Permite ingresar un importe personalizado{{ freeAllowed() ? '' : ' (sin permiso)' }}.</small></div><p-toggleswitch [(ngModel)]="freeAmount" [disabled]="!freeAllowed()" /></div>
          </div>

          @if (!allCourtesy()) {
            <div class="box">
              <div class="box-t">Tipo de cobro</div>
              <div class="cobro-seg">
                <button [class.on]="cobro === 'TOTAL'" (click)="setCobro('TOTAL')"><i class="pi pi-credit-card"></i> Pago total</button>
                <button [class.on]="cobro === 'PARCIAL'" (click)="setCobro('PARCIAL')"><i class="pi pi-money-bill"></i> Parcial</button>
                <button [class.on]="cobro === 'ADEUDO'" (click)="setCobro('ADEUDO')"><i class="pi pi-ban"></i> Adeudo</button>
              </div>
              @if (cobro !== 'ADEUDO') {
                <div class="pays-head"><span>Métodos de pago</span><button class="addpay" (click)="addPay()"><i class="pi pi-plus"></i> Agregar</button></div>
                @for (p of pays(); track $index; let i = $index) {
                  <div class="payrow">
                    <p-select [options]="methods" [(ngModel)]="p.method" (onChange)="onMethodChange(p)" optionLabel="label" optionValue="value" styleClass="w sm" appendTo="body" />
                    <p-inputNumber [(ngModel)]="p.amount" mode="decimal" [minFractionDigits]="2" [min]="0" placeholder="Monto" inputStyleClass="amt" [class.err]="!(p.amount > 0)" />
                    <button class="del" (click)="rmPay(i)"><i class="pi pi-times"></i></button>
                  </div>
                  @if (needsRef(p.method)) { <div class="payref"><i class="pi pi-hashtag"></i><input pInputText [(ngModel)]="p.reference" placeholder="Código de operación (obligatorio)" /></div> }
                }
                <div class="paid-note">Importe ingresado: S/ {{ paid() | number: '1.2-2' }}</div>
                @if (commission() > 0) { <div class="comm"><span>Comisión POS</span><b>+S/ {{ commission() | number: '1.2-2' }}</b></div> }
                @if (payError()) { <p class="err"><i class="pi pi-exclamation-triangle"></i> {{ payError() }}</p> }
              } @else {
                <div class="adeudo-note"><i class="pi pi-info-circle"></i> El total (<b>S/ {{ total() | number: '1.2-2' }}</b>) quedará como <strong>adeudo</strong> de la habitación.</div>
              }
            </div>
          }

          <div class="box">
            <label>Observaciones</label>
            <textarea [(ngModel)]="notes" maxlength="250" rows="2" placeholder="Agregar una observación (opcional)."></textarea>
            <div class="count">{{ notes.length }}/250</div>
          </div>
        </div>

        <!-- ───────── Columna derecha: catálogo + resumen ───────── -->
        <div class="right">
          <div class="tabs">
            <button class="tab" [class.on]="tab() === 'SERVICIO'" (click)="setTab('SERVICIO')"><i class="pi pi-shopping-cart"></i> SERVICIOS</button>
            <button class="tab pen" [class.on]="tab() === 'PENALIDAD'" (click)="setTab('PENALIDAD')"><i class="pi pi-exclamation-triangle"></i> PENALIDADES</button>
          </div>

          <div class="box">
            <div class="box-t">{{ tab() === 'SERVICIO' ? 'Seleccionar servicio' : 'Seleccionar penalidad' }}</div>
            <div class="sel2">
              <div><label>Categoría</label><p-select [options]="catOpts()" optionLabel="name" optionValue="id" [(ngModel)]="categoryId" (onChange)="onCategory()" appendTo="body" styleClass="w" placeholder="Categoría" /></div>
              <div><label>Grupo</label><p-select [options]="groupOpts()" optionLabel="name" optionValue="id" [(ngModel)]="groupId" (onChange)="onGroup()" appendTo="body" styleClass="w" placeholder="Grupo" /></div>
            </div>
            <label>Concepto</label>
            <p-select [options]="conceptOpts()" optionLabel="name" optionValue="id" [(ngModel)]="conceptId" (onChange)="onConcept()" appendTo="body" styleClass="w" placeholder="Concepto" />

            @if (concept(); as c) {
              <div class="cpanel">
                <div class="cp-top">
                  <div><b>{{ availName() || c.name }}</b>
                    @if (isLinen(c)) {
                      @if (avail() === null) { <span class="chip">Calculando…</span> }
                      @else if (availIssue()) { <span class="chip warn">Config</span> }
                      @else { <span class="chip ok">Disponibles: {{ avail() }}</span> }
                    }
                  </div>
                  <div class="cp-price">{{ tab() === 'PENALIDAD' ? 'Precio unitario' : (courtesy && c.allowCourtesy ? 'Cortesía' : 'Precio unitario') }}<b>S/ {{ effUnitPrice(c) | number: '1.2-2' }}</b></div>
                </div>

                @if (freeAmount && c.allowFreeAmount && freeAllowed() && !(courtesy && c.allowCourtesy)) {
                  <div class="cp-free"><label>Importe personalizado (S/)</label><p-inputNumber [(ngModel)]="freePrice" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w sm" /></div>
                }

                <div class="cp-qty">
                  <div><label>Cantidad</label><p-inputNumber [(ngModel)]="qty" [min]="1" [showButtons]="true" buttonLayout="horizontal" inputStyleClass="qty" /></div>
                  @if (tab() === 'PENALIDAD') { <div class="imp"><label>Importe</label><div class="imp-v">S/ {{ effUnitPrice(c) * qty | number: '1.2-2' }}</div></div> }
                  @else { <div class="imp"><label>Importe</label><div class="imp-v">S/ {{ effUnitPrice(c) * qty | number: '1.2-2' }}</div></div> }
                </div>

                @if (isLinen(c)) { <div class="cp-note"><i class="pi pi-info-circle"></i> Limpieza confirmará la prenda al entregar.</div> }
                @if (availIssue()) { <p class="err"><i class="pi pi-exclamation-triangle"></i> {{ availIssue() }}</p> }

                <button class="add" [disabled]="!canAdd()" (click)="addLine(c)"><i class="pi pi-plus"></i> Agregar a la lista</button>
              </div>
            } @else { <p class="muted">Elige categoría, grupo y concepto.</p> }
          </div>

          <!-- Resumen -->
          <div class="box summary">
            <div class="box-t">Resumen de la operación <span class="badge">{{ lines().length }} ítem(s)</span></div>
            @for (l of lines(); track l.key; let i = $index) {
              <div class="sline">
                <button class="rm" (click)="rm(i)"><i class="pi pi-times"></i></button>
                <div class="sl-main"><b>{{ l.name }}</b><small>{{ l.quantity }} × S/ {{ l.unitPrice | number: '1.2-2' }}@if (l.courtesy) { · Cortesía } @if (l.isLinen) { · Pendiente de entrega }</small></div>
                <div class="sl-amt" [class.free]="l.courtesy">S/ {{ l.unitPrice * l.quantity | number: '1.2-2' }}</div>
              </div>
            } @empty { <p class="muted center">Agrega conceptos a la lista.</p> }
            <div class="tot-row"><span>Total a cobrar</span><strong>S/ {{ total() | number: '1.2-2' }}</strong></div>
            @if (!allCourtesy()) {
              <div class="tot-row sm"><span>Pago actual</span><span>S/ {{ Math.min(paid(), total()) | number: '1.2-2' }}</span></div>
              <div class="tot-row sm"><span>Saldo pendiente</span><span>S/ {{ owed() | number: '1.2-2' }}</span></div>
            } @else if (lines().length) {
              <div class="c-badge"><i class="pi pi-gift"></i> Operación en cortesía — no requiere pago</div>
            }
          </div>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <div class="foot-note"><i class="pi pi-info-circle"></i> {{ footNote() }}</div>
        <p-button label="Cancelar" [text]="true" (onClick)="close()" />
        <p-button [label]="allCourtesy() && lines().length ? 'Registrar cortesía' : 'Confirmar operación'" icon="pi pi-check" [disabled]="!canSubmit()" [loading]="saving()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0b1220; color: #e6e9ef; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
    .muted { color: #8b97a8; } .center { text-align: center; }
    .box { background: #0e1726; border: 1px solid #1c2a3a; border-radius: 12px; padding: 0.8rem; margin-bottom: 0.7rem; }
    .box-t { font-weight: 700; color: #cfe0f5; margin-bottom: 0.5rem; font-size: 0.9rem; }
    label { font-size: 0.78rem; color: #9fb0c3; display: block; margin: 0.25rem 0 0.2rem; }
    :host ::ng-deep .w .p-select { width: 100%; background: #0f1a2b; border-color: #243245; }
    .guest { margin-top: 0.4rem; font-size: 0.85rem; color: #cdd8e6; } .guest .pi { color: #60a5fa; }
    textarea { width: 100%; background: #0f1a2b; border: 1px solid #243245; color: #e6edf5; border-radius: 8px; padding: 0.5rem; font: inherit; resize: vertical; } .count { text-align: right; font-size: 0.7rem; color: #64748b; }
    input[pInputText] { width: 100%; background: #0f1a2b; border: 1px solid #243245; color: #e6edf5; border-radius: 8px; padding: 0.5rem 0.6rem; font: inherit; } input[readonly] { opacity: .7; }
    .cond-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.45rem 0; }
    .cond-row b { display: block; font-size: 0.86rem; color: #e6edf5; } .cond-row small { color: #8b97a8; font-size: 0.74rem; }
    .comp-body { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.3rem 0 0.5rem; }
    .chk { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #cdd8e6; cursor: pointer; } .chk input { width: auto; }
    .seg2 { display: flex; gap: 0.4rem; } .seg2 button { flex: 1; background: #0f1a2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.45rem; cursor: pointer; font-size: 0.8rem; } .seg2 button.on { background: rgba(16,185,129,.14); border-color: #10b981; color: #34d399; }
    .cortesia { border: 1px solid #3b2a57; background: rgba(124,58,237,.1); border-radius: 10px; padding: 0.3rem 0.6rem; margin: 0.5rem 0; } .cortesia.on { border-color: #8b5cf6; }
    .cortesia b, .cortesia .pi-gift { color: #c4b5fd; } .c-lbl { color: #c4b5fd; } .c-note { font-size: 0.74rem; color: #c4b5fd; margin: 0.3rem 0; }
    .cobro-seg { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.4rem; margin-bottom: 0.5rem; }
    .cobro-seg button { background: #0f1a2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 9px; padding: 0.55rem 0.3rem; cursor: pointer; font-size: 0.78rem; font-weight: 700; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
    .cobro-seg button.on { background: rgba(16,185,129,.14); border-color: #10b981; color: #34d399; }
    .pays-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: #9fb0c3; margin-bottom: 0.3rem; }
    .addpay { background: transparent; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.25rem 0.6rem; cursor: pointer; font-size: 0.78rem; }
    .payrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.4rem; align-items: center; margin-top: 0.35rem; }
    :host ::ng-deep .payrow .err .p-inputnumber-input { border-color: #ef4444 !important; }
    .payref { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.3rem; } .payref .pi { color: #8aa0bd; }
    .del { background: transparent; border: 0; color: #f87171; cursor: pointer; }
    .paid-note { font-size: 0.78rem; color: #9fb0c3; margin-top: 0.4rem; }
    .comm { display: flex; justify-content: space-between; font-size: 0.8rem; color: #f0b866; margin-top: 0.3rem; } .comm b { color: #f0b866; }
    .adeudo-note { background: #2a1d12; border: 1px solid #6b4f2a; color: #fbbf24; padding: 0.5rem 0.6rem; border-radius: 8px; font-size: 0.8rem; } .adeudo-note b { color: #fff; }
    .err { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: #fca5a5; background: rgba(180,35,35,.1); border: 1px solid rgba(180,35,35,.35); border-radius: 8px; padding: 0.4rem 0.55rem; margin: 0.45rem 0 0; }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 0.7rem; }
    .tab { flex: 1; background: #0f1a2b; border: 1px solid #243245; color: #a9bcd6; border-radius: 10px; padding: 0.6rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
    .tab.on { background: #10b981; border-color: #10b981; color: #052e22; } .tab.pen.on { background: #f59e0b; border-color: #f59e0b; color: #241a05; }
    .sel2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
    .cpanel { border-top: 1px solid #1c2a3a; margin-top: 0.6rem; padding-top: 0.6rem; }
    .cp-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.6rem; } .cp-top b { color: #e6edf5; }
    .chip { font-size: 0.7rem; border-radius: 999px; padding: 0.1rem 0.5rem; background: #1b2a3f; color: #9fb0c3; margin-left: 0.4rem; } .chip.ok { background: rgba(16,185,129,.18); color: #34d399; } .chip.warn { background: rgba(245,158,11,.18); color: #fbbf24; }
    .cp-price { text-align: right; font-size: 0.72rem; color: #8b97a8; } .cp-price b { display: block; color: #34d399; font-size: 1rem; }
    .cp-free { margin-top: 0.4rem; } .cp-qty { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; align-items: end; margin-top: 0.5rem; }
    .imp-v { background: #0f1a2b; border: 1px solid #243245; border-radius: 8px; padding: 0.5rem; text-align: right; font-weight: 700; color: #34d399; }
    .cp-note { font-size: 0.74rem; color: #8aa0bd; margin-top: 0.4rem; }
    .add { width: 100%; margin-top: 0.6rem; background: #10b981; border: 0; color: #052e22; border-radius: 10px; padding: 0.6rem; font-weight: 800; cursor: pointer; } .add:disabled { opacity: .5; cursor: default; }
    .summary .badge { font-size: 0.7rem; color: #9fb0c3; background: #16263f; border-radius: 999px; padding: 0.1rem 0.5rem; margin-left: 0.4rem; }
    .sline { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.5rem; padding: 0.35rem 0; border-bottom: 1px solid #16233a; }
    .sl-main b { font-size: 0.85rem; } .sl-main small { display: block; color: #8b97a8; font-size: 0.73rem; } .sl-amt { font-weight: 700; } .sl-amt.free { color: #c4b5fd; }
    .rm { background: transparent; border: 0; color: #f87171; cursor: pointer; }
    .tot-row { display: flex; justify-content: space-between; align-items: center; padding-top: 0.5rem; } .tot-row strong { color: #34d399; font-size: 1.2rem; } .tot-row.sm { font-size: 0.82rem; color: #cdd8e6; padding-top: 0.2rem; }
    .c-badge { margin-top: 0.5rem; background: rgba(124,58,237,.14); border: 1px solid #8b5cf6; color: #c4b5fd; border-radius: 8px; padding: 0.45rem 0.6rem; font-size: 0.8rem; text-align: center; }
    .foot-note { flex: 1; text-align: left; font-size: 0.76rem; color: #8aa0bd; } .foot-note .pi { color: #60a5fa; }
    :host ::ng-deep .dk-dialog .p-dialog-footer { display: flex; align-items: center; gap: 0.6rem; }
  `],
})
export class ServiciosPenalidadesComponent {
  @Input() visible = false;
  @Input() preselectStayId: string | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly printing = inject(PrintingService);
  private readonly finance = inject(FinanceApiService);
  private readonly toast = inject(MessageService);

  readonly Math = Math;
  readonly methods = METHODS;
  readonly stays = signal<(Stay & { label?: string })[]>([]);
  readonly treeServ = signal<TreeCat[]>([]);
  readonly treePen = signal<TreeCat[]>([]);
  readonly lines = signal<CartLine[]>([]);
  readonly pays = signal<Pay[]>([]);
  readonly saving = signal(false);
  readonly tab = signal<Tipo>('SERVICIO');

  stayId: string | null = null;
  categoryId: string | null = null;
  groupId: string | null = null;
  conceptId: string | null = null;
  qty = 1;
  courtesy = false;
  courtesyReason = '';
  freeAmount = false;
  freePrice: number | null = null;
  notes = '';
  cobro: 'TOTAL' | 'PARCIAL' | 'ADEUDO' = 'TOTAL';
  private opToken = '';

  // Disponibilidad de ropa del concepto seleccionado
  readonly avail = signal<number | null>(null);
  readonly availIssue = signal<string>('');
  readonly availName = signal<string>('');

  // Comprobante
  genComp = false; compUseGuest = true; compDocType: 'DNI' | 'RUC' = 'DNI'; compDocNumber = ''; compName = ''; compAddress = '';

  freeAllowed(): boolean { return this.auth.can('settings', 'edit') || this.auth.can('finance', 'edit'); }
  currentStay() { return this.stays().find((s) => s.id === this.stayId) ?? null; }

  // ── Catálogo (árbol del tipo activo) ──
  tree(): TreeCat[] { return this.tab() === 'SERVICIO' ? this.treeServ() : this.treePen(); }
  readonly catOpts = computed(() => this.tree().map((c) => ({ id: c.id, name: c.name })));
  groupOpts(): { id: string; name: string }[] { const c = this.tree().find((x) => x.id === this.categoryId); return (c?.groups ?? []).map((g) => ({ id: g.id, name: g.name })); }
  conceptOpts(): { id: string; name: string }[] { const g = this.tree().find((x) => x.id === this.categoryId)?.groups.find((x) => x.id === this.groupId); return (g?.concepts ?? []).map((c) => ({ id: c.id, name: c.name })); }
  concept(): TreeConcept | null { const g = this.tree().find((x) => x.id === this.categoryId)?.groups.find((x) => x.id === this.groupId); return g?.concepts.find((c) => c.id === this.conceptId) ?? null; }
  isLinen(c: TreeConcept): boolean { return c.attentionMode === 'LINEN_EXTRA'; }
  effUnitPrice(c: TreeConcept): number {
    if (this.courtesy && c.allowCourtesy && this.tab() === 'SERVICIO') return 0;
    if (this.freeAmount && c.allowFreeAmount && this.freeAllowed() && this.freePrice != null) return this.freePrice;
    return c.price;
  }

  // ── Totales ──
  readonly total = computed(() => round(this.lines().reduce((a, l) => a + l.unitPrice * l.quantity, 0)));
  allCourtesy(): boolean { return this.lines().length > 0 && this.lines().every((l) => l.courtesy || l.unitPrice === 0); }
  paid(): number { return round(this.pays().reduce((a, p) => a + (p.amount || 0), 0)); }
  owed(): number { return Math.max(0, round(this.total() - this.paid())); }

  // Comisión POS
  readonly commEnabled = signal(false);
  readonly posRates = signal<Record<string, number>>({});
  rateFor(m: string): number { return this.commEnabled() ? (this.posRates()[m] ?? 0) : 0; }
  commission(): number { return round(this.pays().reduce((a, p) => a + (p.amount || 0) * this.rateFor(p.method) / 100, 0)); }

  needsRef(m: string): boolean { return m !== 'CASH'; }
  onMethodChange(p: Pay): void { if (p.method === 'CASH') p.reference = ''; this.pays.set([...this.pays()]); }

  load(): void {
    this.lines.set([]); this.pays.set([]); this.tab.set('SERVICIO');
    this.categoryId = this.groupId = this.conceptId = null; this.qty = 1;
    this.courtesy = false; this.courtesyReason = ''; this.freeAmount = false; this.freePrice = null; this.notes = '';
    this.cobro = 'TOTAL'; this.genComp = false; this.compUseGuest = true; this.compDocType = 'DNI'; this.compDocNumber = ''; this.compName = ''; this.compAddress = '';
    this.avail.set(null); this.availIssue.set(''); this.availName.set('');
    this.opToken = (crypto as { randomUUID?: () => string }).randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.loadCommissions();
    this.ops.stays({ status: 'OPEN', pageSize: 200 }).subscribe((r) => {
      this.stays.set(r.data ?? []);
      if (this.preselectStayId && (r.data ?? []).some((s) => s.id === this.preselectStayId)) { this.stayId = this.preselectStayId; }
    });
    this.http.get<ApiResponse<TreeCat[]>>(`${this.api}/services/catalog-tree?tipo=SERVICIO`).subscribe((res) => this.treeServ.set(res.data ?? []));
    this.http.get<ApiResponse<TreeCat[]>>(`${this.api}/services/catalog-tree?tipo=PENALIDAD`).subscribe((res) => this.treePen.set(res.data ?? []));
  }
  private loadCommissions(): void {
    this.http.get<ApiResponse<{ commissionsEnabled: boolean; pos: Record<string, { enabled: boolean; pct: number }> }>>(`${this.api}/operations-config`).subscribe((res) => {
      const c = res.data; this.commEnabled.set(!!c?.commissionsEnabled); const pos = c?.pos ?? {};
      const card = pos['credit']?.enabled ? pos['credit'] : pos['debit'];
      this.posRates.set({ TRANSFER: pos['transfer']?.enabled ? pos['transfer'].pct : 0, YAPE: pos['yape']?.enabled ? pos['yape'].pct : 0, PLIN: pos['plin']?.enabled ? pos['plin'].pct : 0, CARD: card?.enabled ? card.pct : 0 });
    });
  }

  setTab(t: Tipo): void { this.tab.set(t); if (t === 'PENALIDAD') this.courtesy = false; this.categoryId = this.groupId = this.conceptId = null; this.resetConceptState(); }
  setCobro(c: 'TOTAL' | 'PARCIAL' | 'ADEUDO'): void { this.cobro = c; if (c === 'ADEUDO') this.pays.set([]); else if (c === 'TOTAL') this.pays.set([{ method: 'CASH', amount: this.total() }]); else if (!this.pays().length) this.pays.set([{ method: 'CASH', amount: 0 }]); }
  onStayChange(): void { this.refreshAvailability(); }
  onCategory(): void { this.groupId = null; this.conceptId = null; this.resetConceptState(); }
  onGroup(): void { this.conceptId = null; this.resetConceptState(); }
  onConcept(): void { this.qty = 1; this.freePrice = this.concept()?.price ?? null; this.refreshAvailability(); }
  private resetConceptState(): void { this.qty = 1; this.freePrice = null; this.avail.set(null); this.availIssue.set(''); this.availName.set(''); }

  private refreshAvailability(): void {
    const c = this.concept();
    this.avail.set(null); this.availIssue.set(''); this.availName.set('');
    if (!c || !this.isLinen(c) || !this.stayId) return;
    this.http.get<ApiResponse<{ available: number | null; unitPrice: number; categoryName: string; issue: string | null }>>(
      `${this.api}/services/availability?stayId=${this.stayId}&conceptId=${c.id}`,
    ).subscribe({
      next: (r) => { const d = r.data; this.avail.set(d?.available ?? 0); this.availIssue.set(d?.issue ?? ''); this.availName.set(d?.categoryName ?? ''); },
      error: () => { this.avail.set(0); this.availIssue.set('No se pudo calcular la disponibilidad.'); },
    });
  }

  canAdd(): boolean {
    const c = this.concept();
    if (!c || !this.stayId || this.qty < 1) return false;
    if (this.isLinen(c)) { if (this.availIssue()) return false; if (this.avail() !== null && this.qty > (this.avail() as number)) return false; }
    if (this.courtesy && this.tab() === 'SERVICIO' && c.allowCourtesy && !this.courtesyReason.trim()) return false;
    return true;
  }
  addLine(c: TreeConcept): void {
    if (!this.canAdd()) {
      if (this.isLinen(c) && this.avail() !== null && this.qty > (this.avail() as number)) this.toast.add({ severity: 'warn', summary: 'Sin stock', detail: `Solo hay ${this.avail()} ${this.availName() || 'unidad(es)'} disponible(s) para esta habitación.` });
      return;
    }
    const isCourt = this.courtesy && this.tab() === 'SERVICIO' && c.allowCourtesy;
    const isFree = !isCourt && this.freeAmount && c.allowFreeAmount && this.freeAllowed() && this.freePrice != null;
    const unitPrice = isCourt ? 0 : (isFree ? (this.freePrice as number) : c.price);
    this.lines.set([...this.lines(), {
      key: `${c.id}-${Date.now()}`, conceptId: c.id, name: c.name, unitPrice, basePrice: c.price, quantity: this.qty,
      isLinen: this.isLinen(c), courtesy: isCourt, courtesyReason: isCourt ? this.courtesyReason.trim() : '', freeAmount: isFree,
      categoryName: c.inventoryCategoryName, tipo: this.tab(),
    }]);
    // Reset selección del concepto y recalcular pago total.
    this.conceptId = null; this.resetConceptState();
    if (this.cobro === 'TOTAL') this.pays.set([{ method: 'CASH', amount: this.total() }]);
  }
  rm(i: number): void { const n = [...this.lines()]; n.splice(i, 1); this.lines.set(n); if (this.cobro === 'TOTAL') this.pays.set([{ method: 'CASH', amount: this.total() }]); }
  addPay(): void { this.pays.set([...this.pays(), { method: 'CASH', amount: this.owed() }]); }
  rmPay(i: number): void { const n = [...this.pays()]; n.splice(i, 1); this.pays.set(n); }

  onGenComp(): void { if (this.genComp) this.applyGuestData(); }
  applyGuestData(): void {
    if (!(this.genComp && this.compUseGuest && this.stayId)) return;
    const s = this.currentStay(); if (!s) return;
    this.compName = `${s.guest.firstName} ${s.guest.lastName ?? ''}`.trim();
    this.compDocNumber = s.guest.documentNumber ?? '';
    this.compDocType = (s.guest.documentNumber ?? '').trim().length === 11 ? 'RUC' : 'DNI';
  }
  compError(): string {
    if (!this.genComp) return '';
    if (!this.compName.trim()) return 'Ingresa el nombre / razón social.';
    if (!this.compDocNumber.trim()) return 'Ingresa el número de documento.';
    if (this.compDocType === 'RUC' && this.compDocNumber.trim().length !== 11) return 'El RUC debe tener 11 dígitos.';
    return '';
  }
  payError(): string {
    if (this.allCourtesy() || this.total() <= 0 || this.cobro === 'ADEUDO') return '';
    const ps = this.pays();
    if (!ps.length) return 'Agrega un método de pago.';
    for (const p of ps) { if (!(p.amount > 0)) return 'Ingresa el monto de cada método.'; if (this.needsRef(p.method) && !p.reference?.trim()) return 'Ingresa el código de operación de los pagos virtuales.'; }
    const paid = this.paid(); const total = this.total();
    if (this.cobro === 'TOTAL' && paid + 0.001 < total) return `El pago no cubre el total (faltan S/ ${(total - paid).toFixed(2)}).`;
    if (this.cobro === 'PARCIAL' && paid <= 0) return 'Ingresa el pago inicial.';
    if (this.cobro === 'PARCIAL' && paid > total + 0.001) return 'El pago parcial no puede superar el total.';
    return '';
  }
  footNote(): string {
    if (this.lines().some((l) => l.isLinen)) return 'Se enviará una solicitud a limpieza.';
    if (this.allCourtesy() && this.lines().length) return 'Se registrará el servicio como cortesía.';
    return 'El cargo quedará registrado en la estadía.';
  }
  canSubmit(): boolean { return !this.saving() && !!this.stayId && this.lines().length > 0 && this.payError() === '' && this.compError() === ''; }

  submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    const items = this.lines().map((l) => ({
      conceptId: l.conceptId, quantity: l.quantity,
      ...(l.courtesy ? { isCourtesy: true, courtesyReason: l.courtesyReason || undefined } : {}),
      ...(l.freeAmount ? { unitPrice: l.unitPrice } : {}),
    }));
    const payments: { method: Pay['method']; amount: number; reference?: string }[] = [];
    if (!this.allCourtesy() && this.cobro !== 'ADEUDO') {
      let remaining = this.total();
      for (const p of this.pays()) { if (!(p.amount > 0) || remaining <= 0) continue; const amt = Math.min(p.amount, remaining); payments.push({ method: p.method, amount: round(amt), reference: p.reference?.trim() || undefined }); remaining = round(remaining - amt); }
    }
    this.http.post<ApiResponse<{ sale: Sale; owed: number }>>(`${this.api}/services/charge`, { stayId: this.stayId, items, payments, opToken: this.opToken }).subscribe({
      next: (res) => {
        const sale = res.data?.sale;
        const finishOk = () => {
          this.saving.set(false);
          this.toast.add({ severity: 'success', summary: this.allCourtesy() ? 'Cortesía registrada' : 'Operación confirmada', detail: this.allCourtesy() ? 'Sin cobro.' : 'Adeudo: S/ ' + (res.data?.owed ?? 0).toFixed(2) });
          if (sale && !this.allCourtesy()) this.printing.printViaBrowser(buildSaleReceipt(sale, this.auth.activeBranch()?.name ?? 'HotelSuite'));
          this.done.emit(); this.close();
        };
        if (this.genComp && sale && !this.allCourtesy()) {
          this.finance.issueInvoice({ saleId: sale.id, type: this.compDocType === 'DNI' ? 'BOLETA' : 'FACTURA', customerName: this.compName.trim(), customerDoc: this.compDocNumber.trim(), customerAddress: this.compAddress.trim() || undefined })
            .subscribe({ next: () => finishOk(), error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'warn', summary: 'Operación confirmada, comprobante NO emitido', detail: e.error?.error?.message ?? 'Revisa folios o permisos.' }); this.done.emit(); this.close(); } });
        } else finishOk();
      },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo procesar.' }); },
    });
  }

  close(): void { this.visible = false; this.visibleChange.emit(false); }
}
