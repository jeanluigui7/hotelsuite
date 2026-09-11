import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import { buildSaleReceipt } from '../../finance/tickets/receipt';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';

interface Pay { method: 'CASH' | 'CARD' | 'TRANSFER' | 'YAPE' | 'PLIN' | 'WALLET' | 'VUELTO'; amount: number; reference?: string; }

const METHODS = [
  { label: 'Efectivo', value: 'CASH' },
  { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' },
  { label: 'Yape', value: 'YAPE' },
  { label: 'Plin', value: 'PLIN' },
];
const DOC_TYPES = [
  { label: 'DNI', value: 'DNI' },
  { label: 'CE', value: 'CE' },
  { label: 'Pasaporte', value: 'Pasaporte' },
];

@Component({
  selector: 'app-venta-productos',
  standalone: true,
  imports: [DecimalPipe, FormsModule, DialogModule, SelectModule, InputNumberModule, InputTextModule, ButtonModule, ToggleSwitchModule],
  template: `
    <p-dialog [(visible)]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" header="Venta de Productos"
              [style]="{ width: '80rem', maxWidth: '97vw' }" styleClass="dk-dialog" (onShow)="load()">
      <p class="sub">Selecciona los productos de recepción disponibles en stock para la venta.</p>
      <div class="grid">
        <!-- Izquierda: cliente + pago -->
        <div class="client">
          <h4>Tipo de Cliente</h4>
          <label class="radio"><input type="radio" name="ct" value="ROOM" [(ngModel)]="clientType" (ngModelChange)="onClientTypeChange()" /> Asociar a habitación ocupada</label>
          <label class="radio"><input type="radio" name="ct" value="EXTERNAL" [(ngModel)]="clientType" (ngModelChange)="onClientTypeChange()" /> Cliente Externo</label>

          @if (clientType === 'ROOM') {
            <div class="field">
              <label>Habitación ocupada</label>
              <p-select [options]="stays()" [(ngModel)]="stayId" (onChange)="onStayChange()" optionValue="id" [filter]="true" filterBy="room.number" placeholder="Selecciona habitación" styleClass="w">
                <ng-template let-s pTemplate="item">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
                <ng-template let-s pTemplate="selectedItem">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
              </p-select>
            </div>
          } @else {
            <div class="ext">
              <div class="ext-title"><i class="pi pi-id-card"></i> Venta Directa (Identificada)</div>
              <div class="seg2">
                <button [class.on]="idMode === 'DOC'" (click)="idMode = 'DOC'"><i class="pi pi-id-card"></i> Documento</button>
                <button [class.on]="idMode === 'PLATE'" (click)="idMode = 'PLATE'"><i class="pi pi-car"></i> Placa Vehicular</button>
              </div>
              @if (idMode === 'DOC') {
                <label>Tipo de Documento</label>
                <p-select [options]="docTypes" [(ngModel)]="docType" optionLabel="label" optionValue="value" styleClass="w" />
                <label>Número de Documento</label>
                <input pInputText [(ngModel)]="docNumber" (ngModelChange)="onDocInput()" placeholder="12345678" />
              } @else {
                <label>Placa Vehicular</label>
                <input pInputText [(ngModel)]="plate" placeholder="ABC-123" style="text-transform:uppercase" />
              }
              <label>Nombre</label>
              <input pInputText [(ngModel)]="customerName" placeholder="Nombre del cliente" />
            </div>
          }

          <div class="total">Total a cobrar <strong>{{ total() | number: '1.2-2' }}</strong></div>

          <!-- Tipo de Cobro (parcial/adeudo solo para habitación: el saldo va a la deuda del folio). -->
          @if (clientType === 'ROOM') {
            <div class="cobro-lbl">Tipo de Cobro</div>
            <div class="cobro-seg">
              <button [class.on]="cobro === 'TOTAL'" (click)="setCobro('TOTAL')"><i class="pi pi-check-circle"></i> Pago Total</button>
              <button [class.on]="cobro === 'PARCIAL'" (click)="setCobro('PARCIAL')"><i class="pi pi-hourglass"></i> Parcial</button>
              <button [class.on]="cobro === 'ADEUDO'" (click)="setCobro('ADEUDO')"><i class="pi pi-ban"></i> Adeudo</button>
            </div>
          }

          @if (cobro !== 'ADEUDO') {
            <div class="pays">
              <div class="pays-head"><span>{{ cobro === 'PARCIAL' ? 'Pago inicial' : 'Método de pago' }}</span><button class="addpay" (click)="addPay()"><i class="pi pi-plus"></i> Añadir</button></div>
              @for (p of pays(); track $index; let i = $index) {
                <div class="payrow">
                  <p-select [options]="methodOptions()" [(ngModel)]="p.method" (onChange)="onMethodChange(p)" optionLabel="label" optionValue="value" styleClass="w sm" />
                  <p-inputNumber [(ngModel)]="p.amount" mode="decimal" [minFractionDigits]="2" [min]="0" placeholder="Monto" inputStyleClass="amt" [class.err]="!(p.amount > 0)" [disabled]="cobro === 'TOTAL' && pays().length === 1 && p.method !== 'VUELTO'" />
                  <button class="del" (click)="removePay(i)"><i class="pi pi-times"></i></button>
                </div>
                @if (needsRef(p.method)) {
                  <div class="payref">
                    <i class="pi pi-hashtag"></i>
                    <input pInputText [(ngModel)]="p.reference" placeholder="Código de verificación / N° de operación (obligatorio)" />
                  </div>
                }
              }
              @if (!pays().length) { <p class="pay-hint"><i class="pi pi-info-circle"></i> Agrega un método de pago para poder cobrar.</p> }
              @if (commission() > 0) {
                <div class="comm"><span><i class="pi pi-percentage"></i> Comisión POS</span><b>+S/ {{ commission() | number: '1.2-2' }}</b></div>
                <div class="comm total-comm"><span>Total a cobrar (con comisión)</span><b>S/ {{ grandTotal() | number: '1.2-2' }}</b></div>
              }
              <div class="paid">
                <span>Pagado: <b>S/ {{ paid() | number: '1.2-2' }}</b></span>
                <span class="vuelto" [class.on]="change() > 0">Vuelto: <b>S/ {{ change() | number: '1.2-2' }}</b></span>
              </div>
              @if (cobro === 'PARCIAL' && saldo() > 0) { <div class="saldo"><i class="pi pi-wallet"></i> Saldo a deuda del folio: <b>S/ {{ saldo() | number: '1.2-2' }}</b></div> }
              @if (payError()) { <p class="pay-err"><i class="pi pi-exclamation-triangle"></i> {{ payError() }}</p> }
            </div>
          } @else {
            <div class="adeudo-note"><i class="pi pi-info-circle"></i> Todo el monto (<b>S/ {{ total() | number: '1.2-2' }}</b>) quedará como <b>deuda</b> en el folio de la habitación. Se cobra al hacer el check-out.</div>
          }

          <!-- Generar Comprobante electrónico -->
          <div class="comp">
            <div class="comp-head">
              <p-toggleswitch [(ngModel)]="genComp" (onChange)="onGenComp()" />
              <span>Generar Comprobante</span>
            </div>
            @if (genComp) {
              <div class="comp-body">
                <div class="comp-t">Datos para comprobante electrónico</div>
                @if (clientType === 'ROOM' && stayId) { <label class="chk"><input type="checkbox" [(ngModel)]="compUseGuest" (change)="applyGuestData()" /> Usar los mismos datos del huésped</label> }
                <label>Tipo de Documento</label>
                <div class="seg2">
                  <button [class.on]="compDocType === 'DNI'" (click)="compDocType = 'DNI'"><i class="pi pi-id-card"></i> DNI (Boleta)</button>
                  <button [class.on]="compDocType === 'RUC'" (click)="compDocType = 'RUC'"><i class="pi pi-briefcase"></i> RUC (Factura)</button>
                </div>
                <label>Número de Documento</label>
                <input pInputText [(ngModel)]="compDocNumber" [readonly]="compUseGuest && clientType === 'ROOM' && !!stayId" placeholder="76418493" />
                <label>Nombre / Razón Social</label>
                <input pInputText [(ngModel)]="compName" [readonly]="compUseGuest && clientType === 'ROOM' && !!stayId" placeholder="Nombre o razón social" />
                <label>Dirección (Opcional)</label>
                <input pInputText [(ngModel)]="compAddress" placeholder="Dirección fiscal" />
                @if (compError()) { <p class="pay-err"><i class="pi pi-exclamation-triangle"></i> {{ compError() }}</p> }
              </div>
            }
          </div>
        </div>

        <!-- Derecha: catálogo en tabla -->
        <div class="catalog">
          <div class="cat-filters">
            <span class="search"><i class="pi pi-barcode"></i><input #scanInput pInputText placeholder="Buscar o escanear código de barras…" [ngModel]="search" (ngModelChange)="onSearchInput($event)" (keyup.enter)="onScan()" autocomplete="off" /></span>
            <p-select [options]="categoryOptions()" [(ngModel)]="categoryFilter" placeholder="Todas" [showClear]="true" styleClass="w sm" />
          </div>
          <p class="scan-hint"><i class="pi pi-info-circle"></i> Coincidencia exacta: agrega +1 automáticamente y limpia el campo.</p>
          <label class="lowstock"><p-toggleSwitch [(ngModel)]="lowStockOnly" /> Solo productos con bajo stock</label>
          <div class="two-pan">
            <!-- Productos Disponibles (catálogo para buscar/seleccionar) -->
            <div class="pan">
              <div class="pan-h"><span class="pan-t"><i class="pi pi-box"></i> Productos Disponibles</span><span class="pan-s">Busca y selecciona un producto del inventario</span></div>
              <div class="plist">
                @for (p of filteredProducts(); track p.id) {
                  <button class="pcard" [class.low]="isLow(p)" (click)="inc(p)" [disabled]="(qty[p.id]||0) >= p.stock">
                    <div class="pc-l"><div class="pn">{{ p.name }}</div>@if (p.category) { <div class="pc">Categoría: {{ p.category.name }}</div> }</div>
                    <div class="pc-r"><div class="pp">S/ {{ +p.salePrice | number: '1.2-2' }}</div><div class="ps" [class.low]="isLow(p)">Stock: {{ p.stock }}</div></div>
                    <span class="pc-add"><i class="pi pi-plus"></i></span>
                  </button>
                } @empty { <p class="muted center">Sin productos.</p> }
              </div>
            </div>
            <!-- Productos Seleccionados (bolsa de despacho) -->
            <div class="pan">
              <div class="pan-h"><span class="pan-t"><i class="pi pi-shopping-cart"></i> Productos Seleccionados @if (selectedCount()) { <span class="pan-badge">{{ selectedCount() }}</span> }</span><span class="pan-s">Revisa los productos y cantidades</span></div>
              @if (selectedLines().length) {
                <div class="bagwrap">
                  <table class="bagtbl">
                    <thead><tr><th>Producto</th><th class="qc">Cantidad</th><th>Precio Unit.</th><th>Subtotal</th><th></th></tr></thead>
                    <tbody>
                      @for (l of selectedLines(); track l.p.id) {
                        <tr>
                          <td class="bn">{{ l.p.name }}</td>
                          <td class="qc"><div class="stepper"><button (click)="dec(l.p)">-</button><span>{{ l.qty }}</span><button (click)="inc(l.p)" [disabled]="l.qty >= l.p.stock">+</button></div></td>
                          <td class="price">S/ {{ +l.p.salePrice | number: '1.2-2' }}</td>
                          <td class="sub">S/ {{ (+l.p.salePrice) * l.qty | number: '1.2-2' }}</td>
                          <td><button class="bagdel" (click)="removeLine(l.p)" title="Eliminar"><i class="pi pi-trash"></i></button></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                  <div class="bagtotal">Total: <strong>S/ {{ total() | number: '1.2-2' }}</strong></div>
                </div>
              } @else {
                <div class="bagempty"><i class="pi pi-shopping-cart"></i><p>No hay productos seleccionados</p><span>Escanea o selecciona un producto de la izquierda.</span></div>
              }
            </div>
          </div>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="close()" />
        <p-button label="Procesar Venta" icon="pi pi-check" [disabled]="!canSubmit()" [loading]="saving()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      .sub { color: #8b97a8; margin: 0 0 1rem; font-size: 0.85rem; }
      .grid { display: grid; grid-template-columns: 0.7fr 1.7fr; gap: 1.1rem; min-height: 440px; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
      .muted { color: #8b97a8; } .center { text-align: center; }
      h4 { margin: 0 0 0.6rem; color: #fff; font-size: 0.95rem; }
      .client { background: #0b1119; border: 1px solid #1c2a3a; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
      .radio { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; cursor: pointer; }
      .field { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.4rem; }
      label { font-size: 0.8rem; color: #9fb0c3; margin-top: 0.3rem; }
      .ext { border: 1px solid #1f4e8a; border-radius: 10px; padding: 0.8rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .ext-title { color: #60a5fa; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; }
      .seg2 { display: flex; gap: 0.4rem; margin: 0.3rem 0; }
      .seg2 button { flex: 1; background: #131d2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.4rem; cursor: pointer; font-size: 0.8rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem; }
      .seg2 button.on { border-color: #3b82f6; color: #93c5fd; }
      :host ::ng-deep .w .p-select, :host ::ng-deep .client input[pInputText] { width: 100%; background: #131d2b; border-color: #243245; color: #e6e9ef; }
      .total { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1c2a3a; padding-top: 0.6rem; margin-top: 0.5rem; font-size: 1rem; }
      .total strong { color: #34d399; font-size: 1.2rem; }
      .pays-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      .addpay { background: transparent; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.8rem; }
      .payrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.4rem; align-items: center; margin-top: 0.4rem; }
      :host ::ng-deep .amt { width: 100%; }
      .del { background: transparent; border: 0; color: #f87171; cursor: pointer; }
      .payref { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.35rem; }
      .payref .pi { color: #8aa0bd; font-size: 0.8rem; }
      .payref input { flex: 1; background: #0f1a2b; border: 1px solid #1c2c44; color: #e6edf5; border-radius: 8px; padding: 0.5rem 0.7rem; font: inherit; font-size: 0.85rem; }
      .payref input.err { border-color: #ef4444; }
      :host ::ng-deep .payrow .err .p-inputnumber-input, :host ::ng-deep .payrow .err input { border-color: #ef4444 !important; }
      .paid { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #cdd8e6; margin-top: 0.6rem; border-top: 1px dashed #1c2a3a; padding-top: 0.5rem; }
      .paid b { color: #e6edf5; } .paid .vuelto.on b { color: #34d399; }
      .comm { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #f0b866; margin-top: 0.4rem; }
      .comm b { color: #f0b866; } .comm.total-comm { color: #e6edf5; font-weight: 700; border-top: 1px dashed #1c2a3a; padding-top: 0.4rem; } .comm.total-comm b { color: #34d399; font-size: 1.05rem; }
      .pay-hint { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #8aa0bd; margin: 0.4rem 0 0; }
      .pay-err { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #fca5a5; background: rgba(180,35,35,0.1); border: 1px solid rgba(180,35,35,0.35); border-radius: 8px; padding: 0.45rem 0.6rem; margin: 0.5rem 0 0; }
      .cobro-lbl { font-size: 0.8rem; color: #9fb0c3; margin: 0.7rem 0 0.3rem; font-weight: 600; }
      .cobro-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
      .cobro-seg button { background: #0f1a2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 9px; padding: 0.55rem 0.3rem; cursor: pointer; font-size: 0.8rem; font-weight: 700; display: inline-flex; flex-direction: column; align-items: center; gap: 0.2rem; }
      .cobro-seg button .pi { font-size: 0.95rem; }
      .cobro-seg button.on { background: rgba(16,185,129,0.14); border-color: #10b981; color: #34d399; }
      .saldo { margin-top: 0.5rem; font-size: 0.82rem; color: #fbbf24; display: flex; align-items: center; gap: 0.4rem; } .saldo b { color: #fff; }
      .adeudo-note { margin-top: 0.6rem; font-size: 0.82rem; color: #cdd8e6; background: rgba(180,35,35,0.1); border: 1px solid rgba(180,35,35,0.3); border-radius: 10px; padding: 0.7rem 0.8rem; display: flex; align-items: flex-start; gap: 0.45rem; } .adeudo-note .pi { color: #f87171; margin-top: 0.1rem; } .adeudo-note b { color: #fff; }
      .comp { margin-top: 0.9rem; border-top: 1px solid #1c2a3a; padding-top: 0.7rem; }
      .comp-head { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; color: #e6edf5; }
      .comp-body { margin-top: 0.7rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .comp-t { color: #34d399; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.2rem; }
      .comp-body label { font-size: 0.8rem; color: #9fb0c3; margin-top: 0.35rem; }
      .comp-body input[pInputText] { background: #0f1a2b; border: 1px solid #1c2c44; color: #e6edf5; border-radius: 8px; padding: 0.55rem 0.7rem; font: inherit; }
      .comp-body input[readonly] { opacity: 0.7; }
      .chk { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.85rem; color: #cdd8e6; cursor: pointer; margin-bottom: 0.2rem; }
      .comp .seg2 { display: flex; gap: 0.4rem; } .comp .seg2 button { flex: 1; background: #0f1a2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem; cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; } .comp .seg2 button.on { background: rgba(16,185,129,0.14); border-color: #10b981; color: #34d399; }

      .catalog { display: flex; flex-direction: column; gap: 0.6rem; }
      .cat-filters { display: flex; gap: 0.5rem; }
      .search { position: relative; flex: 1; }
      .search i { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .search input { width: 100%; background: #131d2b; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.55rem 0.7rem 0.55rem 2rem; }
      .lowstock { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: #9fb0c3; }
      .scan-hint { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-size: 0.78rem; color: #7fb0d8; background: rgba(37,99,235,0.08); border: 1px solid rgba(37,99,235,0.22); border-radius: 8px; padding: 0.4rem 0.6rem; }
      .scan-hint .pi { color: #60a5fa; }
      .two-pan { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
      @media (max-width: 1000px) { .two-pan { grid-template-columns: 1fr; } }
      .pan { display: flex; flex-direction: column; gap: 0.5rem; background: #0b1119; border: 1px solid #1c2a3a; border-radius: 12px; padding: 0.8rem; }
      .pan-h { display: flex; flex-direction: column; gap: 0.1rem; }
      .pan-t { display: inline-flex; align-items: center; gap: 0.45rem; font-weight: 700; color: #fff; font-size: 0.92rem; }
      .pan-t .pi { color: #34d399; }
      .pan-s { font-size: 0.74rem; color: #8b97a8; }
      .pan-badge { background: #10b981; color: #04130d; border-radius: 999px; font-size: 0.68rem; font-weight: 700; padding: 0.05rem 0.45rem; }
      .plist { display: flex; flex-direction: column; gap: 0.45rem; max-height: 340px; overflow-y: auto; }
      .pcard { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; text-align: left; background: #101a28; border: 1px solid #1c2a3a; border-radius: 10px; padding: 0.6rem 0.75rem; cursor: pointer; color: #e6e9ef; }
      .pcard:hover:not(:disabled) { border-color: #10b981; }
      .pcard:disabled { opacity: 0.45; cursor: not-allowed; }
      .pc-l { min-width: 0; } .pc-l .pn { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pc-r { text-align: right; white-space: nowrap; }
      .pp { color: #34d399; font-weight: 700; font-size: 0.85rem; } .ps { font-size: 0.72rem; color: #8b97a8; } .ps.low { color: #fbbf24; }
      .pc-add { flex: 0 0 auto; width: 1.7rem; height: 1.7rem; border-radius: 7px; background: #13233a; border: 1px solid #274468; color: #93c5fd; display: inline-flex; align-items: center; justify-content: center; }
      .bagwrap { display: flex; flex-direction: column; gap: 0.5rem; }
      .bagtbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .bagtbl th { text-align: left; padding: 0.4rem 0.5rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1c2a3a; }
      .bagtbl td { padding: 0.45rem 0.5rem; border-bottom: 1px solid #16202e; vertical-align: middle; }
      .bagtbl .bn { font-weight: 600; }
      .bagtotal { text-align: right; font-size: 1rem; color: #cdd8e6; } .bagtotal strong { color: #34d399; font-size: 1.2rem; margin-left: 0.4rem; }
      .bagdel { background: transparent; border: 0; color: #f87171; cursor: pointer; }
      .bagempty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.35rem; color: #8b97a8; border: 1px dashed #1c2a3a; border-radius: 10px; padding: 2.4rem 1rem; text-align: center; }
      .bagempty .pi { font-size: 1.8rem; } .bagempty p { margin: 0; color: #cdd8e6; font-weight: 600; } .bagempty span { font-size: 0.76rem; }
      .pn { font-weight: 600; } .pc { font-size: 0.72rem; color: #8b97a8; }
      .price { color: #cdd8e6; white-space: nowrap; }
      .qc { text-align: center; } th.qc { text-align: center; }
      .stepper { display: inline-flex; align-items: center; gap: 0.3rem; }
      .stepper button { width: 1.7rem; height: 1.7rem; border-radius: 6px; border: 1px solid #243245; background: #131d2b; color: #e6e9ef; cursor: pointer; font-weight: 700; }
      .stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
      .stepper span { min-width: 1.4rem; text-align: center; }
      .sub { color: #34d399; font-weight: 600; white-space: nowrap; }
    `,
  ],
})
export class VentaProductosComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly inventory = inject(InventoryApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly finance = inject(FinanceApiService);
  // Comisiones POS (Configuración Operativa): recargo por método de pago.
  readonly commEnabled = signal(false);
  readonly posRates = signal<Record<string, number>>({});
  private readonly auth = inject(AuthService);
  private readonly printing = inject(PrintingService);
  private readonly toast = inject(MessageService);

  readonly products = signal<Product[]>([]);
  readonly stays = signal<(Stay & { label?: string })[]>([]);
  readonly pays = signal<Pay[]>([]);
  readonly saving = signal(false);

  readonly methods = METHODS;
  readonly vueltoAvailable = signal(0); // saldo de vuelto pendiente de la estancia seleccionada

  /** Opciones de método: agrega "Vuelto (S/X)" solo si la estancia tiene saldo de vuelto pendiente. */
  methodOptions(): { label: string; value: string }[] {
    const v = this.vueltoAvailable();
    return v > 0 ? [...METHODS, { label: `Vuelto (S/ ${v.toFixed(2)})`, value: 'VUELTO' }] : METHODS;
  }

  /** Al elegir habitación, consulta su saldo de vuelto pendiente para ofrecerlo como pago. */
  onStayChange(): void {
    if (!this.stayId) { this.vueltoAvailable.set(0); return; }
    this.http.get<ApiResponse<{ remaining: number }>>(`${this.api}/change-credits/by-stay/${this.stayId}`).subscribe({
      next: (r) => this.vueltoAvailable.set(r.data?.remaining ?? 0),
      error: () => this.vueltoAvailable.set(0),
    });
  }
  readonly docTypes = DOC_TYPES;
  clientType: 'EXTERNAL' | 'ROOM' = 'ROOM';
  idMode: 'DOC' | 'PLATE' = 'DOC';
  docType = 'DNI';
  docNumber = '';
  plate = '';
  stayId: string | null = null;
  customerName = '';
  // Tipo de cobro: pago total, parcial (queda saldo) o adeudo (todo a deuda de la habitación).
  cobro: 'TOTAL' | 'PARCIAL' | 'ADEUDO' = 'TOTAL';
  // Comprobante electrónico (al activar "Generar Comprobante").
  genComp = false;
  compUseGuest = true;
  compDocType: 'DNI' | 'RUC' = 'DNI';
  compDocNumber = '';
  compName = '';
  compAddress = '';
  search = '';
  categoryFilter: string | null = null;
  lowStockOnly = false;
  qty: Record<string, number> = {};
  private readonly qtyTick = signal(0);

  readonly categoryOptions = computed(() => [...new Set(this.products().map((p) => p.category?.name).filter((c): c is string => !!c))].sort());

  // Método (no computed) para que reaccione a búsqueda/categoría/bajo-stock (props no-signal).
  filteredProducts(): Product[] {
    const q = this.search.toLowerCase().trim();
    return this.products().filter((p) => {
      if (q && !(p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || this.codesOf(p).some((c) => c.toLowerCase().includes(q)))) return false;
      if (this.categoryFilter && p.category?.name !== this.categoryFilter) return false;
      if (this.lowStockOnly && !this.isLow(p)) return false;
      return true;
    }).sort((a, b) => (a.sku ?? '').localeCompare(b.sku ?? '')); // orden por código, no alfabético
  }

  /**
   * Escaneo con lector (Zebra DS22 = teclado: teclea el código + Enter). Al presionar Enter, si el texto
   * coincide EXACTO con el código de barras (o SKU) de un producto, agrega 1 unidad y limpia para el
   * siguiente escaneo. Si no hay coincidencia exacta, solo filtra (se puede elegir a mano).
   */
  /**
   * Se dispara con CADA cambio del buscador (incluye lo que teclea la Zebra). La Zebra NO necesita
   * enviar Enter: se espera un breve lapso a que termine de escribir el código completo y, si coincide
   * EXACTO con un producto, se agrega solo. Texto manual sin coincidencia exacta → solo filtra.
   */
  onSearchInput(v: string): void {
    this.search = v;
    const code = v.trim();
    if (!code) return;
    // Coincidencia EXACTA inmediata: en cuanto la Zebra completa el código (o se teclea completo),
    // se agrega +1 y se limpia el buscador. NO depende de Enter. Texto parcial → solo filtra.
    this.tryExactAdd(code);
  }
  /** Enter (si la Zebra lo envía): agrega de inmediato. No duplica: si ya se agregó, el campo está vacío. */
  onScan(): void {
    const code = this.search.trim();
    if (!code) return;
    if (!this.tryExactAdd(code) && /^\d{8,}$/.test(code)) {
      this.toast.add({ severity: 'warn', summary: 'No encontrado', detail: `Sin producto con el código "${code}".` });
    }
  }
  /** Busca coincidencia EXACTA (código de barras o SKU) y agrega +1. Devuelve true si agregó. */
  private tryExactAdd(code: string): boolean {
    const prod = this.products().find((p) => this.codesOf(p).some((c) => c.trim() === code))
      ?? this.products().find((p) => (p.sku ?? '').trim().toLowerCase() === code.toLowerCase());
    if (!prod) return false; // no es un código exacto: queda como búsqueda/filtro manual
    this.addByScan(prod); // agrega +1, limpia el buscador y reenfoca
    return true;
  }
  /** Todos los códigos de barras del producto (usa `barcodes`; cae al legacy `barcode` si aplica). */
  private codesOf(p: Product): string[] { return p.barcodes ?? (p.barcode ? [p.barcode] : []); }
  private addByScan(prod: Product): void {
    const before = this.qty[prod.id] || 0;
    this.inc(prod); // inc ya respeta el stock disponible
    if ((this.qty[prod.id] || 0) === before) this.toast.add({ severity: 'warn', summary: 'Sin stock', detail: `${prod.name}: sin stock disponible.` });
    else this.toast.add({ severity: 'success', summary: 'Escaneado', detail: `${prod.name} · S/ ${Number(prod.salePrice).toFixed(2)}` });
    this.search = ''; // listo para el siguiente escaneo
    // Fuerza el vaciado del input nativo (además del modelo) y devuelve el foco al buscador.
    setTimeout(() => { const el = this.scanInput?.nativeElement; if (el) { el.value = ''; el.focus(); } }, 0);
  }

  /** Venta Directa: un EAN-13 (13 dígitos) NO es un documento de identidad; se rechaza. */
  onDocInput(): void {
    if (/^\d{13}$/.test((this.docNumber || '').trim())) {
      this.docNumber = '';
      this.toast.add({ severity: 'warn', summary: 'Código no válido', detail: 'Código no válido para documento de identidad.' });
    }
  }

  readonly total = computed(() => {
    void this.qtyTick();
    return this.products().reduce((a, p) => a + Number(p.salePrice) * (this.qty[p.id] || 0), 0);
  });
  readonly paid = computed(() => this.pays().reduce((a, p) => a + (p.amount || 0), 0));
  change = (): number => Math.max(0, this.paid() - this.total());

  /** Comisión POS estimada (recargo al cliente) según método(s) de pago. El backend recalcula el valor final. */
  rateFor(method: string): number { return this.commEnabled() ? (this.posRates()[method] ?? 0) : 0; }
  commission(): number { return Math.round(this.pays().reduce((a, p) => a + (p.amount || 0) * this.rateFor(p.method) / 100, 0) * 100) / 100; }
  grandTotal(): number { return Math.round((this.total() + this.commission()) * 100) / 100; }

  isLow(p: Product): boolean {
    return p.stock <= (p.reorderPoint ?? 0);
  }

  load(): void {
    this.pays.set([]); this.customerName = ''; this.stayId = null; this.clientType = 'ROOM'; this.vueltoAvailable.set(0);
    this.idMode = 'DOC'; this.docType = 'DNI'; this.docNumber = ''; this.plate = '';
    this.cobro = 'TOTAL'; this.genComp = false; this.compUseGuest = true; this.compDocType = 'DNI'; this.compDocNumber = ''; this.compName = ''; this.compAddress = '';
    this.search = ''; this.categoryFilter = null; this.lowStockOnly = false; this.qty = {};
    // Muestra el stock del almacén de RECEPCIÓN (lo que se puede vender aquí), no el general.
    this.inventory.products.list({ pageSize: 300, status: 'active', area: 'RECEPTION' }).subscribe((r) => this.products.set(r.data ?? []));
    this.ops.stays({ status: 'OPEN', pageSize: 200 }).subscribe((r) => this.stays.set(r.data ?? []));
    this.loadCommissions();
    // Enfoca la barra de búsqueda/escaneo para que el lector (Zebra DS22) funcione sin clic previo.
    setTimeout(() => this.scanInput?.nativeElement.focus(), 350);
  }
  @ViewChild('scanInput') private scanInput?: ElementRef<HTMLInputElement>;

  private loadCommissions(): void {
    this.http.get<ApiResponse<{ commissionsEnabled: boolean; pos: Record<string, { enabled: boolean; pct: number }> }>>(`${this.api}/operations-config`).subscribe((res) => {
      const c = res.data;
      this.commEnabled.set(!!c?.commissionsEnabled);
      const pos = c?.pos ?? {};
      const card = pos['credit']?.enabled ? pos['credit'] : pos['debit'];
      this.posRates.set({
        TRANSFER: pos['transfer']?.enabled ? pos['transfer'].pct : 0,
        YAPE: pos['yape']?.enabled ? pos['yape'].pct : 0,
        PLIN: pos['plin']?.enabled ? pos['plin'].pct : 0,
        CARD: card?.enabled ? card.pct : 0,
      });
    });
  }

  inc(p: Product): void { if ((this.qty[p.id] || 0) < p.stock) { this.qty[p.id] = (this.qty[p.id] || 0) + 1; this.qtyTick.update((v) => v + 1); this.syncTotalPay(); } }
  dec(p: Product): void { if ((this.qty[p.id] || 0) > 0) { this.qty[p.id] = this.qty[p.id] - 1; this.qtyTick.update((v) => v + 1); this.syncTotalPay(); } }
  /** Quita una línea completa de la bolsa (cantidad a 0). */
  removeLine(p: Product): void { this.qty[p.id] = 0; this.qtyTick.update((v) => v + 1); this.syncTotalPay(); }
  /** Productos en la bolsa de despacho (cantidad > 0), con su cantidad. */
  selectedLines(): { p: Product; qty: number }[] {
    void this.qtyTick();
    return this.products().filter((p) => (this.qty[p.id] || 0) > 0).map((p) => ({ p, qty: this.qty[p.id] }));
  }
  /** Total de unidades en la bolsa (para el contador del panel). */
  selectedCount(): number { void this.qtyTick(); return this.products().reduce((a, p) => a + (this.qty[p.id] || 0), 0); }
  /** En "Pago Total" con un solo medio (no Vuelto), el monto NO es editable: se fija al total a cobrar. */
  private syncTotalPay(): void {
    if (this.cobro !== 'TOTAL') return;
    const ps = this.pays();
    if (ps.length === 1 && ps[0].method !== 'VUELTO') {
      const t = Math.round(this.total() * 100) / 100;
      if (Math.abs((ps[0].amount || 0) - t) > 0.001) { const n = [...ps]; n[0] = { ...n[0], amount: t }; this.pays.set(n); }
    }
  }

  addPay(): void { this.pays.set([...this.pays(), { method: 'CASH', amount: this.remaining() }]); this.syncTotalPay(); }
  removePay(i: number): void { const n = [...this.pays()]; n.splice(i, 1); this.pays.set(n); this.syncTotalPay(); }
  private remaining(): number { return Math.max(0, Math.round((this.total() - this.paid()) * 100) / 100); }

  private lines(): { productId: string; quantity: number }[] {
    return this.products().filter((p) => (this.qty[p.id] || 0) > 0).map((p) => ({ productId: p.id, quantity: this.qty[p.id] }));
  }

  /** Los pagos virtuales (no efectivo) requieren código/referencia para su rastreo. */
  needsRef(method: string): boolean { return method !== 'CASH' && method !== 'VUELTO'; }
  /** Al pasar a Efectivo/Vuelto se limpia la referencia; el Vuelto se topa al saldo disponible. */
  onMethodChange(p: Pay): void {
    if (p.method === 'CASH' || p.method === 'VUELTO') p.reference = '';
    if (p.method === 'VUELTO') {
      const cap = Math.min(this.vueltoAvailable(), Math.max(0, this.remaining() + (p.amount || 0)));
      p.amount = Math.round(cap * 100) / 100;
    }
    this.pays.set([...this.pays()]);
    this.syncTotalPay();
  }

  /** Saldo que quedaría como deuda (parcial). */
  saldo(): number { return Math.max(0, Math.round((this.total() - this.paid()) * 100) / 100); }

  /** Cliente Externo no admite parcial/adeudo (no hay folio donde dejar la deuda). */
  onClientTypeChange(): void {
    if (this.clientType === 'EXTERNAL') { this.setCobro('TOTAL'); this.compUseGuest = false; }
    else this.compUseGuest = true;
  }

  setCobro(c: 'TOTAL' | 'PARCIAL' | 'ADEUDO'): void {
    this.cobro = c;
    if (c === 'ADEUDO') { this.pays.set([]); }
    else if (!this.pays().length) { this.pays.set([{ method: 'CASH', amount: c === 'TOTAL' ? this.total() : 0 }]); }
    this.syncTotalPay(); // Pago Total con un medio: fija el monto al total (no editable)
  }

  /** Al activar "Generar Comprobante", precarga los datos del huésped si aplica. */
  onGenComp(): void { if (this.genComp) this.applyGuestData(); }
  applyGuestData(): void {
    if (!(this.genComp && this.compUseGuest && this.clientType === 'ROOM' && this.stayId)) return;
    const s = this.stays().find((x) => x.id === this.stayId);
    if (!s) return;
    this.compName = `${s.guest.firstName} ${s.guest.lastName ?? ''}`.trim();
    this.compDocNumber = s.guest.documentNumber ?? '';
    this.compDocType = (s.guest.documentNumber ?? '').trim().length === 11 ? 'RUC' : 'DNI';
  }

  /** Validación del comprobante (vacío = ok o desactivado). */
  compError(): string {
    if (!this.genComp) return '';
    if (!this.compName.trim()) return 'Ingresa el nombre / razón social del comprobante.';
    if (!this.compDocNumber.trim()) return 'Ingresa el número de documento del comprobante.';
    if (this.compDocType === 'RUC' && this.compDocNumber.trim().length !== 11) return 'El RUC debe tener 11 dígitos.';
    return '';
  }

  /** Mensaje del primer problema con los pagos (vacío = todo correcto). */
  payError(): string {
    if (this.total() <= 0) return '';
    if (this.cobro === 'ADEUDO') return ''; // sin pago: todo a deuda del folio
    const ps = this.pays();
    if (!ps.length) return 'Agrega un método de pago para cobrar.';
    for (const p of ps) {
      if (!(p.amount > 0)) return 'Ingresa el monto de cada método de pago.';
      // Pago virtual (no efectivo): el código de verificación/operación es OBLIGATORIO.
      if (this.needsRef(p.method) && !(p.reference?.trim())) return 'Ingresa el código de verificación de los pagos con Yape, Plin, Transferencia o Tarjeta.';
    }
    const paid = this.paid();
    const total = this.total();
    if (this.cobro === 'TOTAL' && paid + 0.001 < total) return `El pago no cubre el total (faltan S/ ${(total - paid).toFixed(2)}).`;
    if (this.cobro === 'PARCIAL') {
      if (paid <= 0) return 'Ingresa el pago inicial.';
      if (paid > total + 0.001) return 'El pago parcial no puede superar el total (usa Pago Total).';
    }
    return '';
  }

  canSubmit(): boolean {
    if (this.saving() || this.lines().length === 0) return false;
    if (this.clientType === 'ROOM' && !this.stayId) return false;
    if (this.payError() !== '' || this.compError() !== '') return false;
    return true;
  }

  private externalName(): string {
    const name = this.customerName.trim() || 'Cliente externo';
    if (this.idMode === 'PLATE' && this.plate.trim()) return `${name} (Placa ${this.plate.trim().toUpperCase()})`;
    if (this.idMode === 'DOC' && this.docNumber.trim()) return `${name} (${this.docType} ${this.docNumber.trim()})`;
    return name;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    // Pagos registrados: topados al total (el efectivo de más es VUELTO, no se registra).
    // ADEUDO → sin pagos; PARCIAL → lo ingresado (< total, el saldo queda como deuda del folio).
    const recorded: { method: Pay['method']; amount: number; reference?: string }[] = [];
    if (this.cobro !== 'ADEUDO') {
      let remaining = this.total();
      for (const p of this.pays()) {
        if (!(p.amount > 0) || remaining <= 0) continue;
        const amt = Math.min(p.amount, remaining);
        recorded.push({ method: p.method, amount: Math.round(amt * 100) / 100, reference: p.reference?.trim() || undefined });
        remaining = Math.round((remaining - amt) * 100) / 100;
      }
    }
    this.finance.createSale({
      stayId: this.clientType === 'ROOM' ? this.stayId : null,
      customerName: this.clientType === 'EXTERNAL' ? this.externalName() : undefined,
      items: this.lines(),
      payments: recorded,
      sourceArea: 'RECEPTION',
    }).subscribe({
      next: (res) => {
        const sale = res.data;
        const finishOk = () => {
          this.saving.set(false);
          this.toast.add({ severity: 'success', summary: 'Venta registrada', detail: this.cobro === 'ADEUDO' ? 'Adeudo a la habitación · S/ ' + this.total().toFixed(2) : (this.cobro === 'PARCIAL' ? 'Pago parcial · saldo S/ ' + this.saldo().toFixed(2) : 'Total S/ ' + this.total().toFixed(2)) });
          if (sale) this.printing.printViaBrowser(buildSaleReceipt(sale, this.auth.activeBranch()?.name ?? 'RIZZOS'));
          this.done.emit();
          this.close();
        };
        if (this.genComp && sale) {
          this.finance.issueInvoice({
            saleId: sale.id,
            type: this.compDocType === 'DNI' ? 'BOLETA' : 'FACTURA',
            customerName: this.compName.trim(),
            customerDoc: this.compDocNumber.trim(),
            customerAddress: this.compAddress.trim() || undefined,
          }).subscribe({
            next: () => finishOk(),
            error: (e: HttpErrorResponse) => {
              this.saving.set(false);
              this.toast.add({ severity: 'warn', summary: 'Venta registrada, comprobante NO emitido', detail: e.error?.error?.message ?? 'Revisa las series de folios o los permisos de facturación.' });
              this.done.emit();
              this.close();
            },
          });
        } else finishOk();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar la venta.' });
      },
    });
  }

  close(): void { this.visible = false; this.visibleChange.emit(false); }
}
