import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import type { CashCurrent } from '../../finance/services/finance.models';
import { buildCuadreTicket, buildBlindTicket, shiftOf } from '../../finance/services/cuadre-ticket';

/** Denominaciones de soles (billetes y monedas) para el conteo de cierre. */
const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05];

const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', WALLET: 'Yape/Plin' };

@Component({
  selector: 'app-cajas',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, SelectModule, InputNumberModule, InputTextModule],
  template: `
    <section class="caja">
      <header class="top"><h1>Caja</h1></header>

      @if (current(); as c) {
        @if (c.session && c.summary) {
          <div class="cards">
            <div class="card"><span class="l">Apertura</span><span class="v">{{ +c.session.openingAmount | number: '1.2-2' }}</span><span class="m">{{ c.session.openedAt | date: 'dd/MM HH:mm' }}</span></div>
            <div class="card"><span class="l">Total cobrado</span><span class="v">{{ c.summary.totalCollected | number: '1.2-2' }}</span><span class="m">{{ c.summary.salesCount }} ventas</span></div>
            @if (canSeeCuadre()) {
              <div class="card hl"><span class="l">Efectivo esperado</span><span class="v">{{ c.summary.expectedCash | number: '1.2-2' }}</span></div>
            }
            <div class="card"><span class="l">Movimientos</span><span class="v">+{{ c.summary.movementsIn || 0 | number: '1.2-2' }}</span><span class="m">-{{ c.summary.movementsOut || 0 | number: '1.2-2' }}</span></div>
          </div>

          <div class="panel">
            <h3>Cobros por método</h3>
            @for (m of methodEntries(c.summary.byMethod); track m.k) {
              <div class="kv"><span>{{ label(m.k) }}</span><strong>{{ m.v | number: '1.2-2' }}</strong></div>
            }
          </div>

          <div class="actions">
            <p-button label="Registrar movimiento" icon="pi pi-plus" severity="secondary" (onClick)="movVisible = true" />
            <p-button label="Cerrar Caja" icon="pi pi-lock" (onClick)="openClose(c)" />
          </div>
        } @else {
          <div class="panel open">
            <h3>No hay turno de caja abierto</h3>
            <p class="muted">Abre un turno para empezar a vender.</p>
            <div class="field"><label>Monto inicial</label><p-inputNumber [(ngModel)]="openingAmount" mode="decimal" [minFractionDigits]="2" [min]="0" /></div>
            <p-button label="Abrir turno" icon="pi pi-unlock" [loading]="busy()" (onClick)="openTurn()" />
          </div>
        }
      } @else { <p class="muted">Cargando…</p> }
    </section>

    <!-- Movimiento -->
    <p-dialog [(visible)]="movVisible" [modal]="true" header="Movimiento de caja" [style]="{ width: '26rem' }" styleClass="dk-dialog">
      <div class="form">
        <label>Tipo</label>
        <p-select [options]="movTypes" [(ngModel)]="mov.type" optionLabel="label" optionValue="value" styleClass="w" />
        <label>Monto</label>
        <p-inputNumber [(ngModel)]="mov.amount" mode="decimal" [minFractionDigits]="2" [min]="0" />
        <label>Concepto</label>
        <input pInputText [(ngModel)]="mov.concept" placeholder="Ej. compra de útiles" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="movVisible = false" />
        <p-button label="Registrar" icon="pi pi-check" [disabled]="!mov.amount || !mov.concept" [loading]="busy()" (onClick)="addMov()" />
      </ng-template>
    </p-dialog>

    <!-- Cerrar caja: conteo por denominaciones (ambos modos) -->
    <p-dialog [(visible)]="closeVisible" [modal]="true" header="Cerrar caja — conteo de efectivo" [style]="{ width: '34rem', maxWidth: '96vw' }" styleClass="dk-dialog">
      @if (blindClose()) {
        <p class="blind-note"><i class="pi pi-info-circle"></i> Cuenta físicamente el efectivo del cajón por denominación. En caja ciega no verás el esperado ni la diferencia; administración audita después.</p>
      } @else {
        <p class="blind-note supervised"><i class="pi pi-shield"></i> Modo supervisado: cuenta por denominación; el sistema calculará el cuadre contra el efectivo esperado.</p>
      }

      <div class="denoms">
        <div class="dh"><span>Denominación</span><span class="c">Cantidad</span><span class="r">Subtotal</span></div>
        @for (d of denoms; track d.value) {
          <div class="drow">
            <span class="dv">{{ d.value >= 1 ? 'S/ ' : 'MON. S/ ' }}{{ d.value | number: '1.2-2' }}</span>
            <p-inputNumber [(ngModel)]="d.qty" [min]="0" [showButtons]="true" buttonLayout="horizontal" [step]="1" decrementButtonClass="qbtn" incrementButtonClass="qbtn" inputStyleClass="qin" (onInput)="onQty()" (onBlur)="onQty()" />
            <span class="ds">{{ d.value * (d.qty || 0) | number: '1.2-2' }}</span>
          </div>
        }
        <div class="dtot"><span>Total efectivo contado</span><strong>S/ {{ countedTotal() | number: '1.2-2' }}</strong></div>
      </div>

      <div class="summary">
        <div class="kv"><span>Caja base que debe quedar</span><strong>S/ {{ baseAmount() | number: '1.2-2' }}</strong></div>
        <div class="kv strong"><span>Efectivo que va a la bolsa</span><strong>S/ {{ toBag() | number: '1.2-2' }}</strong></div>
        @if (canSeeCuadre()) {
          <div class="kv"><span>Efectivo esperado</span><strong>S/ {{ expectedCash() | number: '1.2-2' }}</strong></div>
          <div class="kv diff" [class.neg]="diff() < 0"><span>Diferencia</span><strong>{{ diff() > 0 ? '+' : '' }}{{ diff() | number: '1.2-2' }}</strong></div>
        }
      </div>

      <div class="form">
        <label>N° de bolsa / referencia</label>
        <input pInputText [(ngModel)]="bagRef" placeholder="Ej. Bolsa 01 - Turno Mañana" />
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="closeVisible = false" />
        <p-button label="Imprimir y finalizar" icon="pi pi-print" [loading]="busy()" (onClick)="doClose()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .caja { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0 0 1.25rem; color: #fff; }
      h3 { margin: 0 0 0.7rem; }
      .muted { color: #8b97a8; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 1rem; margin-bottom: 1.25rem; }
      .card { background: #131d2b; border: 1px solid #243245; border-radius: 12px; padding: 1.1rem; display: flex; flex-direction: column; gap: 0.2rem; }
      .card.hl { border-color: #10b981; }
      .card .l { font-size: 0.78rem; color: #9fb0c3; text-transform: uppercase; letter-spacing: 0.03em; }
      .card .v { font-size: 1.6rem; font-weight: 800; color: #34d399; }
      .card .m { font-size: 0.78rem; color: #8b97a8; }
      .panel { background: #131d2b; border: 1px solid #243245; border-radius: 12px; padding: 1.25rem; max-width: 460px; margin-bottom: 1.25rem; }
      .panel.open { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; }
      .kv { display: flex; justify-content: space-between; padding: 0.3rem 0; }
      .kv.diff { border-top: 1px solid #243245; margin-top: 0.4rem; padding-top: 0.5rem; } .kv.diff.neg strong { color: #f87171; }
      .actions { display: flex; gap: 0.6rem; }
      .blind-note { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0 0 0.6rem; padding: 0.55rem 0.7rem; border-radius: 8px; background: rgba(59,130,246,0.12); color: #93c5fd; font-size: 0.82rem; }
      .blind-note.supervised { background: rgba(16,185,129,0.12); color: #6ee7b7; }
      .denoms { border: 1px solid #243245; border-radius: 10px; padding: 0.5rem 0.7rem; margin-bottom: 0.7rem; }
      .dh { display: grid; grid-template-columns: 1fr 9rem 5.5rem; gap: 0.5rem; font-size: 0.72rem; color: #8b97a8; text-transform: uppercase; letter-spacing: 0.03em; padding-bottom: 0.3rem; border-bottom: 1px solid #243245; }
      .dh .c { text-align: center; } .dh .r { text-align: right; }
      .drow { display: grid; grid-template-columns: 1fr 9rem 5.5rem; gap: 0.5rem; align-items: center; padding: 0.2rem 0; }
      .drow .dv { font-size: 0.85rem; color: #cbd5e1; } .drow .ds { text-align: right; font-weight: 700; color: #34d399; }
      .dtot { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #243245; margin-top: 0.4rem; padding-top: 0.5rem; font-size: 0.95rem; } .dtot strong { color: #34d399; font-size: 1.1rem; }
      .summary { display: flex; flex-direction: column; gap: 0.1rem; margin-bottom: 0.7rem; }
      .summary .kv.strong { border-top: 1px dashed #243245; margin-top: 0.2rem; padding-top: 0.4rem; } .summary .kv.strong strong { color: #fbbf24; font-size: 1.05rem; }
      :host ::ng-deep .drow .p-inputnumber { width: 9rem; } :host ::ng-deep .drow .qin { text-align: center; width: 100%; }
      .form { display: flex; flex-direction: column; gap: 0.4rem; }
      .form label { font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      :host ::ng-deep .w .p-select, :host ::ng-deep .form input, :host ::ng-deep .form .p-inputnumber input { width: 100%; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class CajasComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  private readonly printing = inject(PrintingService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

  readonly current = signal<CashCurrent | null>(null);
  readonly busy = signal(false);
  // Administración = quien puede editar la configuración del hotel (switch "Administrador presente").
  readonly isAdmin = this.auth.can('settings', 'edit');
  // Modo de trabajo de la sucursal activa (Configuración Operativa › Caja Ciega escribe adminPresent = !blindCash).
  readonly adminPresent = computed(() => this.auth.activeBranch()?.adminPresent ?? true);
  // Cierre ciego: recepción no ve el efectivo esperado ni diferencias; al cerrar solo declara cuánto entrega.
  readonly blindClose = computed(() => !this.adminPresent());
  // ¿Puede ver el cuadre (esperado/diferencia)? Siempre con admin presente; en modo ciego, solo administración.
  readonly canSeeCuadre = computed(() => this.adminPresent() || this.isAdmin);
  openingAmount = 100;
  movVisible = false;
  closeVisible = false;
  mov: { type: 'IN' | 'OUT'; amount: number; concept: string } = { type: 'IN', amount: 0, concept: '' };
  readonly movTypes = [{ label: 'Ingreso', value: 'IN' }, { label: 'Egreso', value: 'OUT' }];

  // Conteo de cierre por denominaciones (ambos modos).
  denoms: { value: number; qty: number }[] = DENOMS.map((value) => ({ value, qty: 0 }));
  bagRef = '';
  readonly countedTotal = signal(0);

  ngOnInit(): void { this.reload(); }

  reload(): void { this.finance.cashCurrent().subscribe((res) => this.current.set(res.data)); }
  label(k: string): string { return METHOD_LABEL[k] ?? k; }
  methodEntries(by: Record<string, number>): { k: string; v: number }[] { return Object.keys(by).map((k) => ({ k, v: by[k] })); }
  expectedCash(): number { return this.current()?.summary?.expectedCash ?? 0; }
  baseAmount(): number { return Number(this.current()?.session?.openingAmount ?? 0); }
  toBag(): number { return Math.round((this.countedTotal() - this.baseAmount()) * 100) / 100; }
  diff(): number { return Math.round((this.countedTotal() - this.expectedCash()) * 100) / 100; }
  onQty(): void { this.countedTotal.set(Math.round(this.denoms.reduce((a, d) => a + d.value * (d.qty || 0), 0) * 100) / 100); }

  openTurn(): void {
    this.busy.set(true);
    this.finance.openCash({ openingAmount: this.openingAmount }).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno abierto', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo abrir.' }); },
    });
  }

  addMov(): void {
    this.busy.set(true);
    this.finance.addMovement({ type: this.mov.type, amount: this.mov.amount, concept: this.mov.concept }).subscribe({
      next: () => { this.busy.set(false); this.movVisible = false; this.mov = { type: 'IN', amount: 0, concept: '' }; this.toast.add({ severity: 'success', summary: 'Movimiento registrado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  openClose(c: CashCurrent): void {
    this.denoms = DENOMS.map((value) => ({ value, qty: 0 }));
    this.countedTotal.set(0);
    // N° de bolsa correlacionado con el número de caja/turno (solo se imprime).
    const n = c.session?.number ?? null;
    const turno = c.session ? shiftOf(c.session.openedAt) : '';
    this.bagRef = n != null ? `Bolsa ${String(n).padStart(2, '0')} - Turno ${turno}` : `Turno ${turno}`;
    this.closeVisible = true;
  }

  doClose(): void {
    const total = this.countedTotal();
    if (total <= 0) { this.toast.add({ severity: 'warn', summary: 'Conteo vacío', detail: 'Registra la cantidad de billetes y monedas contados.' }); return; }
    const blind = this.blindClose();
    const c = this.current();
    const session = c?.session;
    const summary = c?.summary;
    if (!session) return;
    // Datos del ticket ciego se arman con el estado actual (aún no recargado).
    const denomsSnapshot = this.denoms.map((d) => ({ value: d.value, qty: d.qty || 0 }));
    const base = this.baseAmount();
    const ingresos = summary?.movementsIn ?? 0;
    const egresos = summary?.movementsOut ?? 0;
    const bagRef = this.bagRef;
    const brand = this.auth.activeBranch()?.name ?? 'HotelSuite';
    const closedByName = this.auth.user()?.name ?? 'Recepción';

    this.busy.set(true);
    this.finance.closeCash({ closingAmount: total, notes: bagRef || undefined }).subscribe({
      next: (res) => {
        this.busy.set(false); this.closeVisible = false;
        const closedAt = res.data?.session?.closedAt ?? new Date().toISOString();
        if (blind) {
          this.toast.add({ severity: 'success', summary: 'Caja cerrada (ciega)', detail: `Efectivo a la bolsa: S/ ${(total - base).toFixed(2)}` });
          this.printing.printViaBrowser(buildBlindTicket({
            brand, sessionNumber: session.number ?? null, openedAt: session.openedAt, closedAt,
            closedByName, base, denominations: denomsSnapshot, ingresos, egresos, bagRef,
          }));
        } else {
          this.toast.add({ severity: 'success', summary: 'Caja cerrada', detail: 'Diferencia ' + (res.data?.difference ?? 0).toFixed(2) });
          // Modo supervisado: imprime el cuadre detallado (igual que Finanzas › Cajas).
          this.finance.sessionDetail(session.id).subscribe({
            next: (d) => this.printing.printViaBrowser(buildCuadreTicket(d.data, brand)),
            error: () => { /* el cierre ya se guardó; el cuadre puede reimprimirse desde Finanzas */ },
          });
        }
        this.reload();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cerrar.' }); },
    });
  }
}
