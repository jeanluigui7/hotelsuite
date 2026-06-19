import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { buildSaleReceipt } from '../../finance/tickets/receipt';
import type { Sale } from '../../finance/services/finance.models';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';

interface Article { key: string; name: string; unitPrice: number; productId?: string; stock?: number; }
interface Line { art: Article; quantity: number; }
interface Pay { method: 'CASH' | 'CARD' | 'TRANSFER' | 'WALLET'; amount: number; }
interface CatalogGroup { subcategory: string; services: { id: string; name: string; price: number | null }[]; }

const METHODS = [
  { label: 'Efectivo', value: 'CASH' }, { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' }, { label: 'Yape/Plin', value: 'WALLET' },
];

@Component({
  selector: 'app-servicios-penalidades',
  standalone: true,
  imports: [DecimalPipe, FormsModule, DialogModule, SelectModule, InputNumberModule, ToggleSwitchModule, ButtonModule],
  template: `
    <p-dialog [(visible)]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" header="Servicios y Penalidades"
              [style]="{ width: '62rem', maxWidth: '95vw' }" styleClass="dk-dialog" (onShow)="load()">
      <div class="grid">
        <div class="left">
          <div class="field">
            <label>Habitación ocupada</label>
            <p-select [options]="stays()" [(ngModel)]="stayId" optionValue="id" [filter]="true" filterBy="label" placeholder="Selecciona habitación" styleClass="w">
              <ng-template let-s pTemplate="item">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
              <ng-template let-s pTemplate="selectedItem">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
            </p-select>
          </div>

          <label class="sec">Servicios y artículos</label>
          <div class="arts">
            @for (a of articles(); track a.key) {
              <button class="art" (click)="add(a)" [disabled]="a.stock !== undefined && a.stock <= 0">
                <span class="an">{{ a.name }}</span>
                <span class="ap">{{ a.unitPrice | number: '1.2-2' }}</span>
                @if (a.stock !== undefined) { <span class="as" [class.low]="a.stock <= 0">Stock: {{ a.stock }}</span> }
                @else { <span class="as svc">Servicio</span> }
              </button>
            } @empty { <p class="muted">Sin servicios ni artículos.</p> }
          </div>
        </div>

        <div class="right">
          <div class="lines">
            @for (l of lines(); track l.art.key; let i = $index) {
              <div class="line">
                <span class="ln">{{ l.art.name }}</span>
                <p-inputNumber [(ngModel)]="l.quantity" [min]="1" [showButtons]="true" buttonLayout="horizontal" inputStyleClass="qty" (onInput)="touch()" />
                <span class="lt">{{ l.art.unitPrice * l.quantity | number: '1.2-2' }}</span>
                <button class="del" (click)="rm(i)"><i class="pi pi-times"></i></button>
              </div>
            } @empty { <p class="muted center">Agrega servicios o artículos.</p> }
          </div>

          <div class="total">Total a cobrar <strong>{{ total() | number: '1.2-2' }}</strong></div>

          <div class="field">
            <label>Tipo de cobro</label>
            <p-select [options]="cobroTypes" [(ngModel)]="cobro" optionLabel="label" optionValue="value" styleClass="w" (onChange)="onCobro()" />
          </div>

          @if (cobro !== 'ADEUDO') {
            <div class="pays">
              <div class="pays-head"><span>Métodos de pago</span><button class="addpay" (click)="addPay()"><i class="pi pi-plus"></i> Añadir</button></div>
              @for (p of pays(); track $index; let i = $index) {
                <div class="payrow">
                  <p-select [options]="methods" [(ngModel)]="p.method" optionLabel="label" optionValue="value" styleClass="w sm" />
                  <p-inputNumber [(ngModel)]="p.amount" mode="decimal" [minFractionDigits]="2" [min]="0" inputStyleClass="amt" />
                  <button class="del" (click)="rmPay(i)"><i class="pi pi-times"></i></button>
                </div>
              }
              <div class="paid">Pagado: {{ paid() | number: '1.2-2' }} · Saldo (adeudo): {{ owed() | number: '1.2-2' }}</div>
            </div>
          } @else {
            <div class="adeudo-note"><i class="pi pi-info-circle"></i> Todo el total quedará como <strong>adeudo</strong> de la habitación.</div>
          }

          <div class="switch"><p-toggleswitch [(ngModel)]="createSupply" /> <span>Generar suministro pendiente (entrega por limpieza)</span></div>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="close()" />
        <p-button label="Procesar Cobro" icon="pi pi-check" [disabled]="!canSubmit()" [loading]="saving()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; min-height: 430px; }
      .muted { color: #8b97a8; } .center { text-align: center; }
      .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.7rem; }
      label { font-size: 0.8rem; color: #9fb0c3; } .sec { display: block; margin: 0.4rem 0; }
      :host ::ng-deep .w .p-select { width: 100%; background: #131d2b; border-color: #243245; }
      .arts { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px,1fr)); gap: 0.5rem; max-height: 320px; overflow-y: auto; }
      .art { background: #131d2b; border: 1px solid #243245; border-radius: 10px; padding: 0.6rem; cursor: pointer; display: flex; flex-direction: column; gap: 0.15rem; text-align: left; color: #e6e9ef; }
      .art:hover:not(:disabled) { border-color: #ec4899; } .art:disabled { opacity: 0.45; }
      .an { font-weight: 600; font-size: 0.82rem; } .ap { color: #34d399; font-weight: 700; } .as { font-size: 0.7rem; color: #8b97a8; } .as.low { color: #f87171; } .as.svc { color: #f0a; }
      .right { background: #0b1119; border: 1px solid #1c2a3a; border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem; }
      .lines { display: flex; flex-direction: column; gap: 0.4rem; max-height: 150px; overflow-y: auto; }
      .line { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 0.5rem; }
      .ln { font-size: 0.85rem; } .lt { font-weight: 600; min-width: 4rem; text-align: right; }
      .del { background: transparent; border: 0; color: #f87171; cursor: pointer; }
      .total { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1c2a3a; padding-top: 0.5rem; }
      .total strong { color: #34d399; font-size: 1.2rem; }
      .pays-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #9fb0c3; }
      .addpay { background: transparent; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.8rem; }
      .payrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.4rem; align-items: center; margin-top: 0.4rem; }
      .paid { font-size: 0.8rem; color: #8b97a8; margin-top: 0.4rem; }
      .adeudo-note { background: #2a1d12; border: 1px solid #6b4f2a; color: #fbbf24; padding: 0.5rem 0.7rem; border-radius: 8px; font-size: 0.82rem; }
      .switch { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: #cdd8e6; margin-top: 0.3rem; }
    `,
  ],
})
export class ServiciosPenalidadesComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly inventory = inject(InventoryApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly printing = inject(PrintingService);
  private readonly toast = inject(MessageService);

  readonly stays = signal<(Stay & { label?: string })[]>([]);
  readonly articles = signal<Article[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly pays = signal<Pay[]>([]);
  readonly saving = signal(false);

  readonly methods = METHODS;
  readonly cobroTypes = [
    { label: 'Pago Total', value: 'TOTAL' },
    { label: 'Pago Parcial', value: 'PARCIAL' },
    { label: 'Adeudo', value: 'ADEUDO' },
  ];
  cobro: 'TOTAL' | 'PARCIAL' | 'ADEUDO' = 'TOTAL';
  stayId: string | null = null;
  createSupply = true;

  readonly total = computed(() => this.lines().reduce((a, l) => a + l.art.unitPrice * l.quantity, 0));
  readonly paid = computed(() => this.pays().reduce((a, p) => a + (p.amount || 0), 0));
  owed = () => Math.max(0, Math.round((this.total() - this.paid()) * 100) / 100);

  load(): void {
    this.lines.set([]); this.pays.set([]); this.stayId = null; this.cobro = 'TOTAL'; this.createSupply = true;
    this.ops.stays({ status: 'OPEN', pageSize: 200 }).subscribe((r) => this.stays.set(r.data ?? []));
    // Catálogo de servicios + productos como artículos cobrables
    this.http.get<ApiResponse<CatalogGroup[]>>(`${this.api}/services/catalog`).subscribe((res) => {
      const svc: Article[] = (res.data ?? []).flatMap((g) =>
        g.services.map((s) => ({ key: 's-' + s.id, name: s.name, unitPrice: s.price ?? 0 })),
      );
      this.inventory.products.list({ pageSize: 300, status: 'active' }).subscribe((pr) => {
        const prods: Article[] = (pr.data ?? []).map((p: Product) => ({
          key: 'p-' + p.id, name: p.name, unitPrice: Number(p.salePrice), productId: p.id, stock: p.stock,
        }));
        this.articles.set([...svc, ...prods]);
      });
    });
  }

  add(a: Article): void {
    const ex = this.lines().find((l) => l.art.key === a.key);
    if (ex) { ex.quantity += 1; this.lines.set([...this.lines()]); }
    else this.lines.set([...this.lines(), { art: a, quantity: 1 }]);
  }
  rm(i: number): void { const n = [...this.lines()]; n.splice(i, 1); this.lines.set(n); }
  touch(): void { this.lines.set([...this.lines()]); }
  addPay(): void { this.pays.set([...this.pays(), { method: 'CASH', amount: this.owed() }]); }
  rmPay(i: number): void { const n = [...this.pays()]; n.splice(i, 1); this.pays.set(n); }

  onCobro(): void {
    if (this.cobro === 'ADEUDO') this.pays.set([]);
    else if (this.cobro === 'TOTAL') this.pays.set([{ method: 'CASH', amount: this.total() }]);
    else if (this.pays().length === 0) this.pays.set([{ method: 'CASH', amount: 0 }]);
  }

  canSubmit(): boolean {
    return !this.saving() && !!this.stayId && this.lines().length > 0;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    const items = this.lines().map((l) =>
      l.art.productId
        ? { productId: l.art.productId, quantity: l.quantity }
        : { description: l.art.name, unitPrice: l.art.unitPrice, quantity: l.quantity },
    );
    const payments = this.cobro === 'ADEUDO' ? [] : this.pays().filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: p.amount }));
    this.http.post<ApiResponse<{ sale: Sale; owed: number }>>(`${this.api}/services/charge`, {
      stayId: this.stayId, items, payments, createSupply: this.createSupply,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'Cobro procesado', detail: 'Adeudo: ' + (res.data?.owed ?? 0).toFixed(2) });
        if (res.data?.sale) this.printing.printViaBrowser(buildSaleReceipt(res.data.sale, this.auth.activeBranch()?.name ?? 'HotelSuite'));
        this.done.emit();
        this.close();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo procesar el cobro.' });
      },
    });
  }

  close(): void { this.visible = false; this.visibleChange.emit(false); }
}
