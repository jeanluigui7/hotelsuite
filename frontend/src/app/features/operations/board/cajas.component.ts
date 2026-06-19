import { Component, OnInit, inject, signal } from '@angular/core';
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
import type { CashCurrent, CloseResult } from '../../finance/services/finance.models';

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
            <div class="card hl"><span class="l">Efectivo esperado</span><span class="v">{{ c.summary.expectedCash | number: '1.2-2' }}</span></div>
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

    <!-- Cerrar caja -->
    <p-dialog [(visible)]="closeVisible" [modal]="true" header="Cerrar caja (arqueo)" [style]="{ width: '28rem' }" styleClass="dk-dialog">
      <div class="form">
        <div class="kv"><span>Efectivo esperado</span><strong>{{ expectedCash() | number: '1.2-2' }}</strong></div>
        <label>Efectivo contado</label>
        <p-inputNumber [(ngModel)]="countedAmount" mode="decimal" [minFractionDigits]="2" [min]="0" />
        <div class="kv diff" [class.neg]="diff() < 0"><span>Diferencia</span><strong>{{ diff() | number: '1.2-2' }}</strong></div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="closeVisible = false" />
        <p-button label="Cerrar e imprimir" icon="pi pi-print" [loading]="busy()" (onClick)="doClose()" />
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
  openingAmount = 100;
  countedAmount = 0;
  movVisible = false;
  closeVisible = false;
  mov: { type: 'IN' | 'OUT'; amount: number; concept: string } = { type: 'IN', amount: 0, concept: '' };
  readonly movTypes = [{ label: 'Ingreso', value: 'IN' }, { label: 'Egreso', value: 'OUT' }];

  ngOnInit(): void { this.reload(); }

  reload(): void { this.finance.cashCurrent().subscribe((res) => this.current.set(res.data)); }
  label(k: string): string { return METHOD_LABEL[k] ?? k; }
  methodEntries(by: Record<string, number>): { k: string; v: number }[] { return Object.keys(by).map((k) => ({ k, v: by[k] })); }
  expectedCash(): number { return this.current()?.summary?.expectedCash ?? 0; }
  diff(): number { return Math.round((this.countedAmount - this.expectedCash()) * 100) / 100; }

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
    this.countedAmount = c.summary?.expectedCash ?? 0;
    this.closeVisible = true;
  }

  doClose(): void {
    this.busy.set(true);
    this.finance.closeCash({ closingAmount: this.countedAmount }).subscribe({
      next: (res) => {
        this.busy.set(false); this.closeVisible = false;
        this.toast.add({ severity: 'success', summary: 'Caja cerrada', detail: 'Diferencia ' + (res.data?.difference ?? 0).toFixed(2) });
        if (res.data) this.printing.printViaBrowser(this.closeReceipt(res.data));
        this.reload();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cerrar.' }); },
    });
  }

  private closeReceipt(r: CloseResult): string {
    const money = (n: number | string) => Number(n).toFixed(2);
    const rows = Object.keys(r.summary.byMethod).map((k) => `<tr><td>${this.label(k)}</td><td class="r">${money(r.summary.byMethod[k])}</td></tr>`).join('');
    return `
      <style>*{font-family:'Courier New',monospace;font-size:12px;color:#000}.w{width:280px}h2{text-align:center;font-size:14px;margin:0 0 6px}.r{text-align:right}.line{border-top:1px dashed #000;margin:6px 0}table{width:100%}.b{font-weight:bold}</style>
      <div class="w">
        <h2>${this.auth.activeBranch()?.name ?? 'HotelSuite'}</h2>
        <div style="text-align:center">CIERRE DE CAJA</div>
        <div>Apertura: ${money(r.session.openingAmount)}</div>
        <div>Abierto: ${new Date(r.session.openedAt).toLocaleString()}</div>
        <div>Cerrado: ${r.session.closedAt ? new Date(r.session.closedAt).toLocaleString() : ''}</div>
        <div class="line"></div>
        <table>${rows}</table>
        <div class="line"></div>
        <table>
          <tr><td>Total cobrado</td><td class="r">${money(r.summary.totalCollected)}</td></tr>
          <tr><td>Ingresos</td><td class="r">${money(r.summary.movementsIn || 0)}</td></tr>
          <tr><td>Egresos</td><td class="r">${money(r.summary.movementsOut || 0)}</td></tr>
          <tr class="b"><td>Efectivo esperado</td><td class="r">${money(r.summary.expectedCash)}</td></tr>
          <tr><td>Contado</td><td class="r">${money(r.session.closingAmount ?? 0)}</td></tr>
          <tr class="b"><td>Diferencia</td><td class="r">${money(r.difference)}</td></tr>
        </table>
        <div class="line"></div>
        <div style="text-align:center">______________________</div>
        <div style="text-align:center">Responsable</div>
      </div>`;
  }
}
