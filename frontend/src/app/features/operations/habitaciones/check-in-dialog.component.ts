import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { ClientTier, Rate } from '../../settings/catalogs/catalog.models';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import { OperationsApiService } from '../services/operations-api.service';
import type { CheckInInput, RoomMapItem, Stay } from '../services/operations.models';

type Tab = 'huesped' | 'adicionales' | 'venta' | 'pago';
interface AddGuest { documentType: string; documentNumber: string; name: string; phone: string; notes: string; }
interface PayRow { type: string; amount: number; received: number | null; reference: string; notes: string; }
interface DebtItem { type: string; label: string; amount: number; date: string; }
interface Debts { items: DebtItem[]; total: number; }

const DOC_TYPES = [
  { label: 'DNI (Documento Nacional de Identidad)', value: 'DNI' },
  { label: 'CE (Carné de Extranjería)', value: 'CE' },
  { label: 'Pasaporte', value: 'PASAPORTE' },
  { label: 'RUC', value: 'RUC' },
];
const PAY_TYPES = [
  { value: 'CASH', label: 'Efectivo', commission: 0, ref: false, backend: 'CASH' as const },
  { value: 'CARD_CREDIT', label: 'Tarjeta de crédito', commission: 5, ref: true, backend: 'CARD' as const },
  { value: 'CARD_DEBIT', label: 'Tarjeta de débito', commission: 0, ref: true, backend: 'CARD' as const },
  { value: 'TRANSFER', label: 'Transferencia', commission: 0, ref: true, backend: 'TRANSFER' as const },
  { value: 'WALLET', label: 'Yape/Plin', commission: 0, ref: true, backend: 'WALLET' as const },
];

@Component({
  selector: 'app-check-in-dialog',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, ToggleSwitchModule],
  template: `
    <p-dialog [visible]="visible" (visibleChange)="onVisibleChange($event)" [modal]="true"
              [style]="{ width: '960px', maxWidth: '97vw' }" header="Cambiar Estado de Habitación" styleClass="ci-dialog">
      <p class="sub">Selecciona el nuevo estado para la habitación {{ room?.roomType?.name }} - {{ room?.number }}.</p>

      <!-- Habitación actual / cambiar a -->
      <div class="room-card">
        <div><span class="lbl">Habitación Actual</span><strong>{{ room?.number }} - {{ room?.roomType?.name }}</strong></div>
        <div class="change"><span>Cambiar a:</span>
          <p-select [options]="freeRooms()" [(ngModel)]="targetRoomId" optionValue="id" styleClass="w sm">
            <ng-template let-r pTemplate="item">{{ r.number }} - {{ r.roomType.name }}</ng-template>
            <ng-template let-r pTemplate="selectedItem">{{ r.number }} - {{ r.roomType.name }}</ng-template>
          </p-select>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button [class.on]="tab() === 'huesped'" (click)="tab.set('huesped')">Datos del Huésped</button>
        <button [class.on]="tab() === 'adicionales'" (click)="tab.set('adicionales')">Huéspedes Adicionales @if (addGuests().length) { <span class="tbadge">{{ addGuests().length }}</span> }</button>
        <button [class.on]="tab() === 'venta'" (click)="tab.set('venta')">Venta Productos (Opcional) @if (lines().length) { <span class="tbadge">{{ lines().length }}</span> }</button>
        <button [class.on]="tab() === 'pago'" (click)="tab.set('pago')">Métodos de Pago</button>
      </div>

      <!-- TAB 1: Datos del huésped -->
      @if (tab() === 'huesped') {
        <div class="grid2">
          <div class="fld"><label>Documento</label>
            <div class="doc-row">
              <input pInputText [(ngModel)]="docNumber" placeholder="Número de documento" (keyup.enter)="lookupDoc(); reniec()" (blur)="lookupDoc()" />
              @if (docType === 'DNI') {
                <button type="button" class="reniec-btn" [disabled]="reniecBusy()" (click)="reniec()" title="Buscar en RENIEC">
                  <i class="pi" [class.pi-search]="!reniecBusy()" [class.pi-spin]="reniecBusy()" [class.pi-spinner]="reniecBusy()"></i> RENIEC
                </button>
              }
              @if (debts().items.length) { <span class="doc-badge" title="Observaciones de deuda"><i class="pi pi-exclamation-triangle"></i> {{ debts().items.length }}</span> }
            </div>
          </div>
          <div class="fld"><label>Tipo de Documento</label><p-select [options]="docTypes" optionLabel="label" optionValue="value" [(ngModel)]="docType" styleClass="w" /></div>

          @if (debts().total > 0) {
            <div class="debt span2">
              <div class="debt-head"><span><i class="pi pi-exclamation-triangle"></i> CLIENTE CON DEUDA PENDIENTE</span><strong>S/ {{ debts().total | number: '1.2-2' }}</strong></div>
              <ul>
                @for (d of debts().items; track $index) {
                  <li>• {{ d.label }} — <strong>S/ {{ d.amount | number: '1.2-2' }}</strong></li>
                }
              </ul>
            </div>
          }
          <div class="fld"><label>Nombre del Huésped</label><input pInputText [(ngModel)]="guestName" placeholder="Nombre completo (se autocompleta)" /></div>
          <div class="fld"><label>Teléfono</label><input pInputText [(ngModel)]="phone" placeholder="Número de contacto" /></div>
          <div class="fld"><label>Placa de vehículo (opcional)</label><input pInputText [(ngModel)]="vehiclePlate" placeholder="ABC-123" style="text-transform:uppercase" /></div>
          <div class="fld"><label>Duración / Tarifa</label>
            <p-select [options]="rateOptions()" [(ngModel)]="selectedRateId" optionValue="id" (onChange)="onRate()" placeholder="Seleccionar tarifa" styleClass="w">
              <ng-template let-r pTemplate="item">
                @if (r.id === CUSTOM_RATE) { <span class="rate-it"><i class="pi pi-cog"></i> {{ r.label }}</span> }
                @else { <span class="rate-it">{{ r.label }} @if (isPernocta(r)) { <span class="pn-badge">🌙 Pernoctación</span> } @if (r.special) { <span class="sp-badge">★ Especial</span> } <strong>S/ {{ +r.price | number: '1.2-2' }}</strong></span> }
              </ng-template>
              <ng-template let-r pTemplate="selectedItem">
                @if (r.id === CUSTOM_RATE) { <span><i class="pi pi-cog"></i> {{ r.label }}</span> }
                @else { {{ r.label }} @if (isPernocta(r)) { <span class="pn-badge">🌙 Pernoctación</span> } · S/ {{ +r.price | number: '1.2-2' }} }
              </ng-template>
            </p-select>
          </div>
          <div class="fld"><label>Tier (opcional)</label><p-select [options]="tiers()" optionLabel="name" optionValue="id" [(ngModel)]="selectedTierId" [showClear]="true" (onChange)="onRate()" placeholder="Sin tier" styleClass="w" /></div>

          @if (isPernoctaRate()) {
            <!-- Noches de estadía (día hotelero) -->
            <div class="nights span2">
              <div class="n-head"><span><i class="pi pi-moon"></i> Noches de estadía</span><span class="n-out">Salida: 12:00 hrs</span></div>
              <div class="n-opts">
                @for (n of nightOptions; track n) {
                  <button [class.on]="nights === n && !manualNights" (click)="setNights(n)">{{ n }} {{ n === 1 ? 'noche' : 'noches' }}</button>
                }
                <button class="pers" [class.on]="manualNights" (click)="manualNights = true">Personalizar</button>
              </div>
              @if (manualNights) {
                <div class="n-manual"><label>Noches:</label><p-inputNumber [(ngModel)]="nights" [min]="1" [max]="60" [showButtons]="true" buttonLayout="horizontal" (onInput)="recomputeNights()" /></div>
              }
              <div class="n-dates">
                <div><span>Check-in:</span><strong>{{ now | date: 'dd/MM/yyyy HH:mm' }}</strong></div>
                <div><span>Check-out:</span><strong class="out">{{ checkoutDate() | date: 'dd/MM/yyyy HH:mm' }}</strong></div>
              </div>
              <div class="n-price">
                <div class="np-calc">{{ nights }} {{ nights === 1 ? 'noche' : 'noches' }} × S/ {{ ratePrice() | number: '1.2-2' }} <span class="eq">= S/ {{ nights * ratePrice() | number: '1.2-2' }}</span></div>
                <div class="np-final"><label>Precio final:</label><span class="cur">S/</span><input type="number" [(ngModel)]="finalPrice" min="0" /></div>
              </div>
            </div>

            <!-- Early Check-in (solo pernoctación) -->
            <div class="early span2">
              <div class="e-head"><i class="pi pi-moon"></i> Early Check-in (Opcional)</div>
              <p class="e-desc">Reconoce la pernoctación hasta las {{ CUTOFF_HOUR }}:00 del <b>día siguiente</b> aunque ingrese antes de la hora de corte. El monto (o cortesía) se define en la pestaña "Métodos de Pago".</p>
              <label class="e-chk"><input type="checkbox" [(ngModel)]="applyEarly" (change)="recomputeNights()" /> <span>Aplicar Early Check-in</span></label>
            </div>
          }

          @if (isCustom()) {
            <!-- Configurar Tarifa Personalizada -->
            <div class="custom span2">
              <div class="c-head"><i class="pi pi-cog"></i> Configurar Tarifa Personalizada</div>
              <div class="c-grid">
                <div class="c-fld"><label>Fecha y Hora de Salida</label><input type="datetime-local" [(ngModel)]="checkoutAt" /><small>Check-out: {{ checkoutAt ? (checkoutAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</small></div>
                <div class="c-fld"><label>Precio a Cobrar (S/)</label><div class="c-price"><span>S/</span><input type="number" [(ngModel)]="customPrice" min="0" /></div><small>Ingrese el monto total a cobrar por esta estadía</small></div>
              </div>
              <div class="c-tot"><div><span>Duración estimada:</span><strong>{{ customDurationLabel() }}</strong></div><div class="r"><span>Total a cobrar:</span><strong class="amt">S/ {{ (customPrice || 0) | number: '1.2-2' }}</strong></div></div>
            </div>
          }

          @if (!isCustom()) { <div class="fld"><label>Fecha y hora de salida</label><input type="datetime-local" [(ngModel)]="checkoutAt" /></div> }
          <div class="fld span2"><label>Notas Adicionales</label><textarea [(ngModel)]="notes" rows="3" placeholder="Alergias, preferencias, motivo de estancia, solicitudes especiales..."></textarea></div>
        </div>
      }

      <!-- TAB 2: Huéspedes adicionales -->
      @if (tab() === 'adicionales') {
        <div class="adic">
          <div class="adic-head">
            <div><span class="ti"><i class="pi pi-users"></i></span> <strong>HUÉSPEDES ADICIONALES</strong> <span class="muted">{{ addGuests().length }} registrado(s)</span></div>
            <button class="add-btn" (click)="addGuest()"><i class="pi pi-plus"></i> Agregar Huésped</button>
          </div>
          @for (g of addGuests(); track $index; let i = $index) {
            <div class="adic-row">
              <span class="num">{{ i + 2 }}</span>
              <div class="ag-grid">
                <div class="fld"><label>Tipo</label><p-select [options]="docTypes" optionLabel="value" optionValue="value" [(ngModel)]="g.documentType" styleClass="w sm" /></div>
                <div class="fld"><label>Número</label><input pInputText [(ngModel)]="g.documentNumber" placeholder="Documento" /></div>
                <div class="fld"><label>Nombre</label><input pInputText [(ngModel)]="g.name" placeholder="Automático desde API" /></div>
                <div class="fld"><label>Teléfono</label><input pInputText [(ngModel)]="g.phone" placeholder="Opcional" /></div>
                <div class="fld"><label>Notas</label><input pInputText [(ngModel)]="g.notes" placeholder="Opcional" /></div>
              </div>
              <button class="del" (click)="removeGuest(i)"><i class="pi pi-trash"></i></button>
            </div>
          } @empty { <p class="muted">Sin huéspedes adicionales. Usa "Agregar Huésped".</p> }
        </div>
      }

      <!-- TAB 3: Venta de productos -->
      @if (tab() === 'venta') {
        <div class="venta">
          <div class="vcol">
            <h4>Productos Disponibles</h4>
            <div class="vbox">
              <strong>Seleccionar Producto</strong><p class="muted">Busca y selecciona un producto del inventario</p>
              <div class="vfilters">
                <input pInputText placeholder="Buscar por nombre o código..." [(ngModel)]="prodSearch" />
                <p-select [options]="categoryOptions()" [(ngModel)]="categoryFilter" placeholder="Todas" [showClear]="true" styleClass="w sm" />
              </div>
              <div class="plist">
                @for (p of filteredProducts(); track p.id) {
                  <button class="pcard" (click)="addProduct(p)" [disabled]="p.stock <= 0">
                    <div><div class="pn">{{ p.name }}</div>@if (p.category) { <div class="pc">Categoría: {{ p.category.name }}</div> }</div>
                    <div class="pr"><div class="pp">S/ {{ +p.salePrice | number: '1.2-2' }}</div><div class="ps">Stock: {{ p.stock }}</div><div class="pm">Mín: {{ p.reorderPoint }}</div></div>
                  </button>
                } @empty { <p class="muted">Sin productos.</p> }
              </div>
            </div>
          </div>
          <div class="vcol">
            <h4>Productos Seleccionados</h4>
            @if (lines().length) {
              <table class="seltbl">
                <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio Unit.</th><th>Subtotal</th><th></th></tr></thead>
                <tbody>
                  @for (l of lines(); track l.product.id) {
                    <tr>
                      <td>{{ l.product.name }}</td>
                      <td><p-inputNumber [(ngModel)]="l.quantity" [min]="1" [max]="l.product.stock" [showButtons]="true" buttonLayout="horizontal" (onInput)="touch()" /></td>
                      <td>S/ {{ +l.product.salePrice | number: '1.2-2' }}</td>
                      <td>S/ {{ +l.product.salePrice * l.quantity | number: '1.2-2' }}</td>
                      <td><button class="elim" (click)="removeLine(l.product.id)">Eliminar</button></td>
                    </tr>
                  }
                </tbody>
              </table>
              <div class="vtotal">Total: <strong>S/ {{ totalProductos() | number: '1.2-2' }}</strong></div>
            } @else {
              <div class="empty"><i class="pi pi-box"></i><p>No hay productos seleccionados</p><span class="muted">Selecciona un producto de la lista de la izquierda.</span></div>
            }
          </div>
        </div>
      }

      <!-- TAB 4: Métodos de pago -->
      @if (tab() === 'pago') {
        <div class="pago">
          <div class="caja-ok"><i class="pi pi-check-circle"></i> <div><strong>Caja abierta</strong><br><span class="muted">Los pagos pueden ser procesados normalmente.</span></div></div>
          <div class="comp">
            <p class="comp-q">¿Desea generar comprobante electrónico?</p>
            <div class="comp-row"><strong>{{ comprobante ? 'Sí, generar' : 'No, sin comprobante' }}</strong>
              <p-toggleSwitch [(ngModel)]="comprobante" />
              <span class="muted">{{ comprobante ? '✓ Se generará comprobante' : '✕ No se generará ningún comprobante electrónico' }}</span></div>
          </div>

          <div class="pago-grid">
            <div class="resumen">
              <h4>Resumen de Pago</h4>
              <div class="kv"><span>Tarifa seleccionada:</span><strong>{{ rateLabel() }}</strong></div>
              <div class="kv"><span>Precio base:</span><strong>S/ {{ precioBase() | number: '1.2-2' }}</strong></div>
              @if (isPernoctaRate() && applyEarly) {
                <div class="early-charge">
                  <div class="ec-head"><i class="pi pi-moon"></i> Early Check-in</div>
                  <label class="ec-cort"><input type="checkbox" [(ngModel)]="earlyCortesia" (change)="onEarlyCortesia()" /> Cortesía (S/ 0.00)</label>
                  <div class="ec-amt"><label>Monto Early Check-in</label><span class="cur">S/</span><input type="number" [(ngModel)]="earlyAmount" [disabled]="earlyCortesia" min="0" placeholder="0.00" /></div>
                </div>
                <div class="kv"><span>Early Check-in:</span><strong>S/ {{ (earlyCortesia ? 0 : (earlyAmount || 0)) | number: '1.2-2' }}{{ earlyCortesia ? ' (cortesía)' : '' }}</strong></div>
              }
              <div class="kv"><span>Total Productos:</span><strong>S/ {{ totalProductos() | number: '1.2-2' }}</strong></div>
              @if (commissionTotal() > 0) { <div class="kv comm"><span>💳 Comisión POS:</span><strong>S/ {{ commissionTotal() | number: '1.2-2' }}</strong></div> }
              <div class="kv"><span>Total a pagar:</span><strong>S/ {{ totalAPagar() | number: '1.2-2' }}</strong></div>
              <div class="kv"><span>Total pagado:</span><strong>S/ {{ totalPagado() | number: '1.2-2' }}</strong></div>
              @if (pendiente() > 0.001) {
                <div class="status warn"><i class="pi pi-exclamation-triangle"></i> Pendiente por pagar <span>S/ {{ pendiente() | number: '1.2-2' }}</span></div>
              } @else {
                <div class="status ok"><i class="pi pi-check-circle"></i> Pagado completamente</div>
              }
            </div>

            <div class="metodos">
              <div class="mh"><h4>Métodos de Pago</h4><button class="add-btn" (click)="addPay()"><i class="pi pi-plus"></i> Añadir método de pago</button></div>
              @for (p of pays(); track $index; let i = $index) {
                <div class="mcard">
                  <div class="mtop"><span>Método de pago #{{ i + 1 }}</span><button class="del" (click)="removePay(i)"><i class="pi pi-times"></i></button></div>
                  <div class="m-grid">
                    <div class="fld"><label>Tipo de pago</label>
                      <p-select [options]="payTypes" optionValue="value" [(ngModel)]="p.type" styleClass="w">
                        <ng-template let-t pTemplate="item">{{ t.label }} @if (t.commission) { <span class="cm">(+{{ t.commission }}%)</span> }</ng-template>
                        <ng-template let-t pTemplate="selectedItem">{{ t.label }} @if (t.commission) { <span class="cm">(+{{ t.commission }}%)</span> }</ng-template>
                      </p-select>
                    </div>
                    <div class="fld"><label>{{ payMeta(p.type).commission ? 'Monto (incluye ' + payMeta(p.type).commission + '% comisión)' : 'Monto a cobrar' }}</label>
                      <p-inputNumber [(ngModel)]="p.amount" (onInput)="onPayAmount(i, $event.value)" mode="decimal" [minFractionDigits]="2" [min]="0" /></div>
                    @if (payMeta(p.type).value === 'CASH') {
                      <div class="fld"><label>💰 Con cuánto paga el cliente</label><p-inputNumber [(ngModel)]="p.received" mode="decimal" [minFractionDigits]="2" [min]="0" /></div>
                      <div class="fld"><label>🔁 Vuelto a entregar</label><div class="vuelto">S/ {{ vuelto(p) | number: '1.2-2' }}</div></div>
                    } @else {
                      <div class="fld span2"><label>Referencia *</label><input pInputText [(ngModel)]="p.reference" placeholder="Obligatorio - N° de transacción, voucher, etc." /></div>
                    }
                    <div class="fld span2"><label>Notas</label><input pInputText [(ngModel)]="p.notes" placeholder="Notas adicionales del pago" /></div>
                  </div>
                </div>
              } @empty { <p class="muted">Agrega uno o más métodos de pago.</p> }
            </div>
          </div>
        </div>
      }

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="onVisibleChange(false)" />
        @if (tab() !== 'pago') { <p-button label="Siguiente" icon="pi pi-arrow-right" iconPos="right" severity="secondary" (onClick)="nextTab()" /> }
        <p-button label="Confirmar Check-in" icon="pi pi-check" [loading]="saving()" (onClick)="confirm()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .ci-dialog .p-dialog-content, :host ::ng-deep .ci-dialog .p-dialog-header, :host ::ng-deep .ci-dialog .p-dialog-footer { background: #0b1220; color: #e6edf5; }
      .sub { color: #8aa0bd; margin: 0 0 1rem; font-size: 0.85rem; }
      .room-card { display: flex; justify-content: space-between; align-items: center; gap: 1rem; background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .room-card .lbl { display: block; font-size: 0.72rem; color: #8aa0bd; } .room-card strong { font-size: 1.15rem; }
      .change { display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem; color: #8aa0bd; }
      :host ::ng-deep .w .p-select { width: 100%; } :host ::ng-deep .w.sm .p-select { min-width: 220px; }

      .tabs { display: flex; gap: 0.3rem; background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 10px; padding: 4px; margin-bottom: 1.1rem; flex-wrap: wrap; }
      .tabs button { flex: 1; background: transparent; border: 0; color: #8aa0bd; padding: 0.65rem 0.8rem; cursor: pointer; font-size: 0.85rem; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }
      .tabs button.on { background: #0b1220; color: #fff; font-weight: 700; box-shadow: 0 0 0 1px #1c2c44; }
      .tbadge { background: #10b981; color: #04130d; border-radius: 999px; font-size: 0.68rem; font-weight: 700; padding: 0.05rem 0.4rem; }

      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem 1.2rem; }
      .fld { display: flex; flex-direction: column; gap: 0.3rem; } .fld.span2 { grid-column: 1 / -1; }
      label { font-size: 0.82rem; color: #cdd8e6; }
      input[pInputText], input[type=datetime-local], textarea { width: 100%; background: #0f1a2b; border: 1px solid #1c2c44; color: #e6edf5; border-radius: 8px; padding: 0.6rem 0.7rem; font: inherit; }
      .rate-it { display: flex; justify-content: space-between; gap: 1rem; width: 100%; }
      .muted { color: #8aa0bd; font-size: 0.82rem; }
      .pn-badge { background: #5b21b6; color: #e9d5ff; font-size: 0.66rem; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: 999px; }
      .nights { background: #fbfbfe; color: #1e1b4b; border: 1px solid #c4b5fd; border-radius: 14px; padding: 1rem; }
      .sp-badge { background: rgba(168,85,247,0.16); color: #a855f7; font-size: 0.66rem; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: 999px; margin-left: 0.3rem; }
      .early { background: linear-gradient(135deg, #2a1a4a, #1c1233); border: 1px solid #6d28d9; border-radius: 14px; padding: 1rem; color: #e9d5ff; }
      .early .e-head { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; color: #fbbf24; }
      .early .e-desc { font-size: 0.8rem; color: #c4b5fd; margin: 0.4rem 0 0.6rem; }
      .early .e-chk { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
      .early-charge { background: rgba(124,58,237,0.08); border: 1px solid #c4b5fd; border-radius: 10px; padding: 0.7rem 0.8rem; margin: 0.5rem 0; }
      .early-charge .ec-head { display: flex; align-items: center; gap: 0.4rem; font-weight: 700; color: #7c3aed; font-size: 0.85rem; }
      .early-charge .ec-cort { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; margin: 0.4rem 0; cursor: pointer; }
      .early-charge .ec-amt { display: flex; align-items: center; gap: 0.4rem; } .early-charge .ec-amt label { flex: 1; font-size: 0.82rem; } .early-charge .ec-amt .cur { font-weight: 700; }
      .early-charge .ec-amt input { width: 90px; padding: 0.35rem 0.5rem; border: 1px solid #c4b5fd; border-radius: 6px; }
      .custom { background: #0e1622; border: 1px solid #3a2a12; border-radius: 14px; padding: 1rem; color: #e6efe9; }
      .custom .c-head { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; color: #f59e0b; margin-bottom: 0.7rem; }
      .custom .c-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .custom .c-fld { display: flex; flex-direction: column; gap: 0.3rem; } .custom .c-fld label { font-size: 0.82rem; color: #f59e0b; }
      .custom .c-fld input, .custom .c-price input { width: 100%; background: #0b1220; border: 1px solid #3a2a12; color: #fff; border-radius: 8px; padding: 0.55rem 0.7rem; }
      .custom .c-fld small { color: #f59e0b; font-size: 0.74rem; }
      .custom .c-price { display: flex; align-items: center; gap: 0.4rem; } .custom .c-price span { color: #f59e0b; font-weight: 700; }
      .custom .c-tot { display: flex; justify-content: space-between; align-items: center; background: #0b1220; border: 1px solid #3a2a12; border-radius: 10px; padding: 0.8rem 1rem; margin-top: 0.8rem; }
      .custom .c-tot .r { text-align: right; } .custom .c-tot span { display: block; font-size: 0.78rem; color: #8aa499; } .custom .c-tot .amt { color: #f59e0b; font-size: 1.3rem; }
      .n-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.7rem; }
      .n-head > span:first-child { color: #6d28d9; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem; }
      .n-out { color: #7c3aed; font-size: 0.82rem; }
      .n-opts { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .n-opts button { background: #1e1b4b; color: #c4b5fd; border: 0; border-radius: 10px; padding: 0.55rem 0.9rem; cursor: pointer; font-weight: 700; font-size: 0.85rem; }
      .n-opts button.on { background: #7c3aed; color: #fff; }
      .n-opts button.pers { background: #2e1065; }
      .n-manual { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.6rem; color: #4c1d95; }
      .n-dates { background: #1e1b4b; color: #ddd6fe; border-radius: 10px; padding: 0.7rem 0.9rem; margin-top: 0.7rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .n-dates > div { display: flex; justify-content: space-between; font-size: 0.85rem; } .n-dates .out { color: #a78bfa; }
      .n-price { background: #ede9fe; border-radius: 10px; padding: 0.7rem 0.9rem; margin-top: 0.6rem; }
      .np-calc { display: flex; justify-content: space-between; color: #4c1d95; font-size: 0.88rem; } .np-calc .eq { font-weight: 700; }
      .np-final { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; color: #4c1d95; }
      .np-final input { flex: 1; background: #fff; border: 1px solid #c4b5fd; color: #1e1b4b; border-radius: 8px; padding: 0.5rem 0.7rem; font-weight: 700; }
      .np-final .cur { font-weight: 700; }
      .doc-row { display: flex; gap: 0.5rem; align-items: stretch; }
      .doc-row input { flex: 1; }
      .reniec-btn { flex: 0 0 auto; background: #13243a; border: 1px solid #274468; color: #a9c7ef; border-radius: 8px; padding: 0 0.8rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; white-space: nowrap; }
      .reniec-btn:hover:not(:disabled) { background: #1a2f4a; } .reniec-btn:disabled { opacity: 0.6; cursor: default; }
      .doc-badge { display: inline-flex; align-items: center; gap: 0.3rem; background: #78350f; color: #fcd34d; border: 1px solid #b45309; border-radius: 8px; padding: 0 0.6rem; font-weight: 700; font-size: 0.85rem; }
      .debt { background: rgba(120,53,15,0.25); border: 1px solid #b45309; border-radius: 10px; padding: 0.8rem 1rem; }
      .debt-head { display: flex; justify-content: space-between; align-items: center; color: #fbbf24; font-weight: 700; }
      .debt ul { margin: 0.5rem 0 0; padding: 0; list-style: none; color: #fcd9a8; font-size: 0.82rem; }
      .debt li { padding: 0.15rem 0; } .debt li strong { color: #fbbf24; }

      .adic-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem; }
      .ti { background: rgba(16,185,129,0.15); color: #10b981; padding: 0.35rem; border-radius: 8px; }
      .add-btn { background: #10b981; color: #04130d; border: 0; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; }
      .adic-row { display: flex; align-items: flex-start; gap: 0.8rem; background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; margin-bottom: 0.6rem; }
      .adic-row .num { width: 1.8rem; height: 1.8rem; border-radius: 50%; background: #142339; color: #34d399; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; }
      .ag-grid { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
      .del { background: transparent; border: 0; color: #f87171; cursor: pointer; }

      .venta { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      h4 { margin: 0 0 0.6rem; font-size: 1rem; }
      .vbox { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; }
      .vfilters { display: flex; gap: 0.5rem; margin: 0.6rem 0; }
      .plist { display: flex; flex-direction: column; gap: 0.5rem; max-height: 320px; overflow-y: auto; }
      .pcard { display: flex; justify-content: space-between; gap: 1rem; text-align: left; background: #0b1220; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; cursor: pointer; color: #e6edf5; }
      .pcard:hover:not(:disabled) { border-color: #10b981; } .pcard:disabled { opacity: 0.45; }
      .pn { font-weight: 600; } .pc { font-size: 0.72rem; color: #8aa0bd; } .pr { text-align: right; }
      .pp { color: #34d399; font-weight: 700; } .ps { font-size: 0.72rem; color: #34d399; } .pm { font-size: 0.72rem; color: #8aa0bd; }
      .seltbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .seltbl th { text-align: left; color: #8aa0bd; font-weight: 600; padding: 0.4rem; border-bottom: 1px solid #1c2c44; }
      .seltbl td { padding: 0.4rem; border-bottom: 1px solid #16202e; }
      .elim { background: transparent; border: 0; color: #f87171; cursor: pointer; font-size: 0.8rem; }
      .vtotal { text-align: right; margin-top: 0.6rem; } .vtotal strong { color: #34d399; font-size: 1.1rem; }
      .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; color: #8aa0bd; border: 1px dashed #1c2c44; border-radius: 12px; padding: 3rem 1rem; text-align: center; }
      .empty .pi { font-size: 2rem; }

      .caja-ok { display: flex; align-items: center; gap: 0.6rem; background: rgba(16,185,129,0.1); border: 1px solid #14633f; color: #6ee7b7; border-radius: 10px; padding: 0.8rem 1rem; }
      .comp { border: 1px solid #14633f; border-radius: 10px; padding: 1rem; margin: 0.9rem 0; text-align: center; }
      .comp-q { color: #34d399; font-weight: 700; margin: 0 0 0.6rem; }
      .comp-row { display: flex; align-items: center; justify-content: center; gap: 0.8rem; }
      .pago-grid { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 1.2rem; }
      .resumen { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; align-self: start; }
      .kv { display: flex; justify-content: space-between; padding: 0.4rem 0; font-size: 0.88rem; } .kv.comm strong { color: #fbbf24; } .kv.comm span { color: #fbbf24; }
      .status { margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px solid #1c2c44; display: flex; align-items: center; gap: 0.4rem; font-weight: 700; }
      .status.ok { color: #34d399; } .status.warn { color: #fbbf24; justify-content: space-between; }
      .mh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
      .mcard { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; margin-bottom: 0.7rem; }
      .mtop { display: flex; justify-content: space-between; color: #8aa0bd; font-size: 0.85rem; margin-bottom: 0.6rem; }
      .m-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; } .m-grid .span2 { grid-column: 1 / -1; }
      .cm { color: #fbbf24; } .vuelto { background: #0b1220; border: 1px solid #14633f; color: #34d399; border-radius: 8px; padding: 0.6rem 0.7rem; font-weight: 700; }
      @media (max-width: 760px) { .grid2, .venta, .pago-grid, .m-grid { grid-template-columns: 1fr; } .ag-grid { grid-template-columns: 1fr 1fr; } }
    `,
  ],
})
export class CheckInDialogComponent {
  private readonly catalog = inject(CatalogApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly inventory = inject(InventoryApiService);
  private readonly finance = inject(FinanceApiService);
  private readonly messages = inject(MessageService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  private _room: RoomMapItem | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  @Input() set room(value: RoomMapItem | null) {
    this._room = value;
    if (value) this.init(value);
  }
  get room(): RoomMapItem | null { return this._room; }
  @Input() prefillGuestId: string | null = null;

  readonly docTypes = DOC_TYPES;
  readonly payTypes = PAY_TYPES;

  readonly tab = signal<Tab>('huesped');
  readonly rates = signal<Rate[]>([]);
  readonly tiers = signal<ClientTier[]>([]);
  readonly freeRooms = signal<RoomMapItem[]>([]);
  readonly products = signal<Product[]>([]);
  readonly lines = signal<{ product: Product; quantity: number }[]>([]);
  readonly addGuests = signal<AddGuest[]>([]);
  readonly pays = signal<PayRow[]>([]);
  readonly debts = signal<Debts>({ items: [], total: 0 });
  readonly reniecBusy = signal(false);
  readonly saving = signal(false);
  private foundGuestId: string | null = null;

  targetRoomId: string | null = null;
  docType = 'DNI';
  docNumber = '';
  guestName = '';
  phone = '';
  vehiclePlate = '';
  selectedRateId: string | null = null;
  selectedTierId: string | null = null;
  checkoutAt = '';
  notes = '';
  prodSearch = '';
  categoryFilter: string | null = null;
  comprobante = false;
  readonly now = new Date();
  readonly nightOptions = [1, 2, 3, 5, 7];
  nights = 1;
  manualNights = false;
  finalPrice: number | null = null;
  // Tarifa personalizada + early check-in
  readonly CUSTOM_RATE = '__custom__';
  customPrice: number | null = null;
  applyEarly = false;
  earlyAmount: number | null = null;
  earlyCortesia = false;
  readonly rateOptions = computed<Rate[]>(() => [
    ...this.rates(),
    { id: this.CUSTOM_RATE, roomTypeId: '', label: 'Tarifa personalizada', durationMinutes: 0, price: 0, status: 'active' } as Rate,
  ]);
  isCustom(): boolean { return this.selectedRateId === this.CUSTOM_RATE; }

  private init(room: RoomMapItem): void {
    this.tab.set('huesped');
    this.targetRoomId = room.id;
    this.docType = 'DNI'; this.docNumber = ''; this.guestName = ''; this.phone = ''; this.vehiclePlate = '';
    this.selectedRateId = null; this.selectedTierId = null; this.checkoutAt = ''; this.notes = '';
    this.customPrice = null; this.applyEarly = false; this.finalPrice = null;
    this.earlyAmount = null; this.earlyCortesia = false;
    this.prodSearch = ''; this.categoryFilter = null; this.comprobante = false;
    this.nights = 1; this.manualNights = false; this.finalPrice = null;
    this.lines.set([]); this.addGuests.set([]); this.pays.set([]); this.debts.set({ items: [], total: 0 }); this.foundGuestId = null;

    this.catalog.rates.list({ roomTypeId: room.roomType.id }).subscribe((res) => this.rates.set(res.data ?? []));
    this.catalog.clientTiers.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.tiers.set(res.data ?? []));
    this.inventory.products.list({ pageSize: 300, status: 'active', area: 'RECEPTION' }).subscribe((res) => this.products.set(res.data ?? []));
    this.ops.map().subscribe((res) => this.freeRooms.set((res.data ?? []).filter((r) => r.status === 'FREE' || r.id === room.id)));

    if (this.prefillGuestId) {
      this.catalog.guests.get(this.prefillGuestId).subscribe((res) => {
        const g = res.data;
        if (g) { this.docType = g.documentType; this.docNumber = g.documentNumber; this.guestName = `${g.firstName} ${g.lastName ?? ''}`.trim(); this.phone = g.phone ?? ''; }
      });
    }
  }

  /** Busca el huésped por documento: autocompleta nombre/teléfono y carga deudas. */
  lookupDoc(): void {
    const doc = this.docNumber.trim();
    if (!doc) { this.debts.set({ items: [], total: 0 }); this.foundGuestId = null; return; }
    this.http.get<ApiResponse<{ guest: { id: string; firstName: string; lastName?: string | null; phone?: string | null } | null; debts: Debts }>>(
      `${this.apiUrl}/guests-lookup`, { params: { documentNumber: doc } },
    ).subscribe((res) => {
      const g = res.data?.guest;
      this.foundGuestId = g?.id ?? null;
      if (g) {
        if (!this.guestName) this.guestName = `${g.firstName} ${g.lastName ?? ''}`.trim();
        if (!this.phone && g.phone) this.phone = g.phone;
      }
      this.debts.set(res.data?.debts ?? { items: [], total: 0 });
    });
  }

  /** Consulta RENIEC por DNI y autocompleta el nombre del huésped. */
  reniec(): void {
    const doc = this.docNumber.trim();
    if (this.docType !== 'DNI' || !/^\d{8}$/.test(doc)) {
      this.messages.add({ severity: 'warn', summary: 'DNI inválido', detail: 'Ingresa un DNI de 8 dígitos.' });
      return;
    }
    this.reniecBusy.set(true);
    this.http.get<ApiResponse<{ firstName: string; lastName: string; fullName: string; documentNumber: string }>>(
      `${this.apiUrl}/reniec/dni`, { params: { numero: doc } },
    ).subscribe({
      next: (res) => {
        this.reniecBusy.set(false);
        const d = res.data;
        if (d) {
          this.guestName = d.fullName || `${d.firstName} ${d.lastName}`.trim();
          this.messages.add({ severity: 'success', summary: 'RENIEC', detail: this.guestName });
        }
      },
      error: (e: HttpErrorResponse) => {
        this.reniecBusy.set(false);
        this.messages.add({ severity: 'error', summary: 'RENIEC', detail: e.error?.error?.message ?? 'No se pudo consultar el DNI.' });
      },
    });
  }

  // --- Pernoctación / noches de estadía ---
  isPernocta(r: Rate): boolean {
    // La pernoctación la define el flag (el sistema obvia la duración listada). El texto
    // queda como respaldo solo para tarifas antiguas sin el flag.
    return !!r.pernocta || /hotelero|pernocta|pernoctaci/i.test(r.label);
  }
  selectedRate(): Rate | undefined {
    return this.rates().find((r) => r.id === this.selectedRateId);
  }
  isPernoctaRate(): boolean {
    const r = this.selectedRate();
    return !!r && this.isPernocta(r);
  }
  ratePrice(): number {
    return Number(this.selectedRate()?.price ?? 0);
  }
  readonly CUTOFF_HOUR = 12; // hora de corte de pernoctación (12:00)
  /**
   * Salida de pernoctación: hora fija de corte (12:00). Si ingresa después del corte, sale
   * mañana; si ingresa hasta el corte sin early, sale hoy; con early, sale mañana. Cada
   * noche adicional suma un día.
   */
  checkoutDate(): Date {
    const d = new Date(this.now);
    const tod = d.getHours() + d.getMinutes() / 60;
    const offset = tod > this.CUTOFF_HOUR ? 1 : (this.applyEarly ? 1 : 0);
    d.setDate(d.getDate() + offset + (this.nights - 1));
    d.setHours(this.CUTOFF_HOUR, 0, 0, 0);
    return d;
  }
  setNights(n: number): void {
    this.nights = n;
    this.manualNights = false;
    this.recomputeNights();
  }
  recomputeNights(): void {
    this.finalPrice = Math.round(this.nights * this.ratePrice() * 100) / 100;
    this.syncCheckoutInput(this.checkoutDate());
  }
  private syncCheckoutInput(out: Date): void {
    const pad = (n: number): string => String(n).padStart(2, '0');
    this.checkoutAt = `${out.getFullYear()}-${pad(out.getMonth() + 1)}-${pad(out.getDate())}T${pad(out.getHours())}:${pad(out.getMinutes())}`;
  }

  onRate(): void {
    this.applyEarly = false;
    if (this.isCustom()) {
      // Tarifa personalizada: el usuario define salida y precio.
      this.finalPrice = null;
      this.customPrice = this.customPrice ?? 0;
      if (!this.checkoutAt) this.syncCheckoutInput(new Date(Date.now() + 60 * 60_000));
      return;
    }
    const rate = this.selectedRate();
    if (!rate) return;
    if (this.isPernocta(rate)) {
      // Pernoctación = hasta la próxima hora de corte (1). No se deriva de la duración.
      this.nights = 1;
      this.manualNights = false;
      this.recomputeNights();
    } else {
      this.finalPrice = null;
      this.syncCheckoutInput(new Date(Date.now() + rate.durationMinutes * 60_000));
    }
  }

  /** Duración estimada (texto) entre ahora y la salida elegida (tarifa personalizada). */
  customDurationLabel(): string {
    if (!this.checkoutAt) return '—';
    const mins = Math.max(0, Math.round((new Date(this.checkoutAt).getTime() - Date.now()) / 60_000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h} hora${h === 1 ? '' : 's'}${m ? ' ' + m + ' min' : ''}` : `${m} min`;
  }
  rateLabel(): string { return this.isCustom() ? 'Tarifa personalizada' : (this.rates().find((r) => r.id === this.selectedRateId)?.label ?? '—'); }
  precioBase(): number {
    if (this.isCustom()) return this.customPrice ?? 0;
    const rate = this.rates().find((r) => r.id === this.selectedRateId);
    if (!rate) return 0;
    // Pernoctación: usa el precio final (noches × tarifa, editable).
    if (this.isPernocta(rate) && this.finalPrice != null) return this.finalPrice;
    const tier = this.tiers().find((t) => t.id === this.selectedTierId);
    const disc = tier ? Number(tier.discountPercent) : 0;
    return Math.round(Number(rate.price) * (1 - disc / 100) * 100) / 100;
  }

  // Productos
  categoryOptions(): string[] { return [...new Set(this.products().map((p) => p.category?.name).filter((c): c is string => !!c))].sort(); }
  filteredProducts(): Product[] {
    const q = this.prodSearch.toLowerCase();
    return this.products().filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!this.categoryFilter || p.category?.name === this.categoryFilter));
  }
  addProduct(p: Product): void {
    const ex = this.lines().find((l) => l.product.id === p.id);
    if (ex) { if (ex.quantity < p.stock) ex.quantity += 1; this.lines.set([...this.lines()]); }
    else this.lines.set([...this.lines(), { product: p, quantity: 1 }]);
  }
  removeLine(id: string): void { this.lines.set(this.lines().filter((l) => l.product.id !== id)); }
  touch(): void { this.lines.set([...this.lines()]); }
  totalProductos(): number { return this.lines().reduce((a, l) => a + Number(l.product.salePrice) * l.quantity, 0); }

  // Huéspedes adicionales
  addGuest(): void { this.addGuests.set([...this.addGuests(), { documentType: 'DNI', documentNumber: '', name: '', phone: '', notes: '' }]); }
  removeGuest(i: number): void { const n = [...this.addGuests()]; n.splice(i, 1); this.addGuests.set(n); }

  // Pagos
  payMeta(type: string): (typeof PAY_TYPES)[number] { return PAY_TYPES.find((t) => t.value === type) ?? PAY_TYPES[0]; }
  addPay(): void { this.pays.set([...this.pays(), { type: 'CASH', amount: Math.max(0, this.baseTotal() - this.totalPagado()), received: null, reference: '', notes: '' }]); }
  removePay(i: number): void { const n = [...this.pays()]; n.splice(i, 1); this.pays.set(n); }

  /** Al cambiar el monto de un método, el último método absorbe automáticamente el restante. */
  onPayAmount(i: number, val: number | string | null): void {
    const rows = this.pays();
    if (rows[i]) rows[i].amount = Number(val) || 0;
    this.redistribute(i);
  }
  private redistribute(editedIndex: number): void {
    const rows = this.pays();
    if (rows.length < 2) return;
    const last = rows.length - 1;
    // Si se edita el último método, se respeta su valor manual (no se sobreescribe).
    if (editedIndex === last) return;
    const sumOthers = rows.reduce((a, p, idx) => (idx === last ? a : a + (p.amount || 0)), 0);
    rows[last].amount = Math.max(0, Math.round((this.baseTotal() - sumOthers) * 100) / 100);
  }
  /** Cargo manual de early check-in (0 si es cortesía o no aplica). */
  earlyCharge(): number { return this.isPernoctaRate() && this.applyEarly && !this.earlyCortesia ? Math.max(0, this.earlyAmount || 0) : 0; }
  onEarlyCortesia(): void { if (this.earlyCortesia) this.earlyAmount = 0; }
  baseTotal(): number { return Math.round((this.precioBase() + this.totalProductos() + this.earlyCharge()) * 100) / 100; }
  commissionTotal(): number { return Math.round(this.pays().reduce((a, p) => a + (p.amount || 0) * this.payMeta(p.type).commission / 100, 0) * 100) / 100; }
  totalAPagar(): number { return Math.round((this.baseTotal() + this.commissionTotal()) * 100) / 100; }
  totalPagado(): number { return Math.round(this.pays().reduce((a, p) => a + (p.amount || 0), 0) * 100) / 100; }
  pendiente(): number { return Math.round((this.totalAPagar() - this.totalPagado()) * 100) / 100; }
  vuelto(p: PayRow): number { return Math.max(0, Math.round(((p.received ?? 0) - (p.amount || 0)) * 100) / 100); }

  nextTab(): void {
    const order: Tab[] = ['huesped', 'adicionales', 'venta', 'pago'];
    this.tab.set(order[Math.min(order.length - 1, order.indexOf(this.tab()) + 1)]);
  }
  onVisibleChange(value: boolean): void { this.visible = value; this.visibleChange.emit(value); }

  confirm(): void {
    if (!this.room) return;
    if (!this.selectedRateId) { this.tab.set('huesped'); this.messages.add({ severity: 'warn', summary: 'Falta tarifa', detail: 'Selecciona una tarifa.' }); return; }
    if (this.isCustom() && (!this.checkoutAt || this.customPrice == null)) { this.tab.set('huesped'); this.messages.add({ severity: 'warn', summary: 'Tarifa personalizada', detail: 'Indica la fecha de salida y el precio a cobrar.' }); return; }
    if (!this.docNumber || !this.guestName) { this.tab.set('huesped'); this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa documento y nombre del huésped.' }); return; }
    const badRef = this.pays().find((p) => this.payMeta(p.type).ref && !p.reference.trim());
    if (badRef) { this.tab.set('pago'); this.messages.add({ severity: 'warn', summary: 'Falta referencia', detail: 'Los pagos con tarjeta/transferencia requieren referencia.' }); return; }
    // Debe registrarse el pago del cliente antes de confirmar.
    if (this.totalAPagar() > 0 && this.totalPagado() <= 0) {
      this.tab.set('pago'); this.messages.add({ severity: 'warn', summary: 'Falta el pago', detail: 'Agrega el método e ingresa con cuánto paga el cliente.' }); return;
    }
    // Efectivo: exige "con cuánto paga el cliente" (recibido) y que cubra el monto a cobrar.
    const badCash = this.pays().find((p) => this.payMeta(p.type).value === 'CASH' && (p.amount || 0) > 0 && (p.received == null || p.received < (p.amount || 0)));
    if (badCash) { this.tab.set('pago'); this.messages.add({ severity: 'warn', summary: 'Falta el efectivo recibido', detail: 'Ingresa con cuánto paga el cliente (debe cubrir el monto a cobrar).' }); return; }

    this.saving.set(true);
    // 1. Crear huéspedes adicionales (los que tengan documento) y luego check-in.
    const toCreate = this.addGuests().filter((g) => g.documentNumber.trim());
    const creates = toCreate.map((g) =>
      this.catalog.guests.create({ documentType: g.documentType, documentNumber: g.documentNumber.trim(), firstName: g.name || g.documentNumber, lastName: '', phone: g.phone || undefined } as never),
    );
    forkJoin(creates.length ? creates : [of(null)]).subscribe({
      next: (res) => {
        const addIds = creates.length ? res.map((r) => (r as { data?: { id: string } } | null)?.data?.id).filter((x): x is string => !!x) : [];
        this.doCheckIn(addIds);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.tab.set('huesped');
        this.messages.add({ severity: 'error', summary: 'Huésped adicional', detail: err.error?.error?.message ?? 'No se pudo registrar un huésped adicional.' });
      },
    });
  }

  private doCheckIn(additionalGuestIds: string[]): void {
    const custom = this.isCustom();
    const input: CheckInInput = {
      roomId: this.targetRoomId ?? this.room!.id,
      rateId: custom ? undefined : this.selectedRateId!,
      tierId: this.selectedTierId ?? null,
      additionalGuestIds,
      adults: 1 + additionalGuestIds.length,
      children: 0,
      vehiclePlate: this.vehiclePlate || undefined,
      notes: this.notes || undefined,
      nights: this.isPernoctaRate() ? this.nights : undefined,
      priceOverride: custom ? (this.customPrice ?? 0) : (this.isPernoctaRate() && this.finalPrice != null ? this.finalPrice : undefined),
      earlyCheckin: this.isPernoctaRate() && this.applyEarly ? true : undefined,
      customCheckoutAt: custom && this.checkoutAt ? new Date(this.checkoutAt).toISOString() : undefined,
    };
    // Si el documento ya existe en la BD, usamos su id; si no, creamos huésped nuevo.
    if (this.foundGuestId) {
      input.guestId = this.foundGuestId;
      // El huésped puede haber cambiado de teléfono: actualizamos el dato del registro
      // existente (antes se quedaba el teléfono anterior).
      if (this.phone.trim()) {
        this.catalog.guests.update(this.foundGuestId, { phone: this.phone.trim() } as never).subscribe({ error: () => {} });
      }
    } else {
      input.newGuest = { documentType: this.docType as never, documentNumber: this.docNumber, firstName: this.guestName, lastName: '', phone: this.phone || '', email: '' };
    }
    this.ops.checkIn(input).subscribe({
      next: (res) => {
        const stay = res.data as Stay | undefined;
        const items = [
          { description: `Tarifa: ${this.rateLabel()}`, unitPrice: this.precioBase(), quantity: 1 },
          ...(this.earlyCharge() > 0 ? [{ description: 'Early Check-in', unitPrice: this.earlyCharge(), quantity: 1 }] : []),
          ...this.lines().map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        ];
        const payments = this.pays().filter((p) => (p.amount || 0) > 0).map((p) => ({ method: this.payMeta(p.type).backend, amount: p.amount }));
        // Se registra SIEMPRE el cargo de la estancia (deja rastro en el folio), con o sin pago.
        if (stay?.id) {
          this.finance.createSale({ stayId: stay.id, items, payments, sourceArea: 'RECEPTION' }).subscribe({
            next: () => this.finish(payments.length ? 'Habitación ocupada. Pago registrado.' : 'Habitación ocupada. Cargo pendiente de cobro.'),
            error: () => this.finish('Check-in hecho. El cargo no se pudo registrar.'),
          });
        } else {
          this.finish('Habitación ocupada.');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar el check-in.' });
      },
    });
  }

  private finish(detail: string): void {
    this.saving.set(false);
    this.messages.add({ severity: 'success', summary: 'Check-in', detail });
    this.onVisibleChange(false);
    this.done.emit();
  }
}
