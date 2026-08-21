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
import type { CashCurrent, CashMovementRow } from '../../finance/services/finance.models';
import { buildCuadreTicket, buildBlindTicket, shiftOf } from '../../finance/services/cuadre-ticket';

/** Denominaciones de soles (billetes y monedas) para el conteo de cierre. */
const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05];

const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', WALLET: 'Yape/Plin' };

@Component({
  selector: 'app-cajas',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, SelectModule, InputNumberModule, InputTextModule],
  template: `
    <section class="caja" (click)="menuFor.set(null)">
      <header class="top">
        <h1>Caja</h1>
        @if (blindClose()) {
          <span class="badge-ciega"><i class="pi pi-lock"></i> CAJA CIEGA ACTIVA</span>
        } @else {
          <span class="badge-sup"><i class="pi pi-shield"></i> MODO SUPERVISADO</span>
        }
      </header>
      @if (blindClose()) {
        <p class="sub"><i class="pi pi-eye-slash"></i> El resultado del cierre (esperado y diferencias) no es visible en Caja Ciega.</p>
      }

      @if (current(); as c) {
        @if (c.session && c.summary) {
          <div class="cards">
            <div class="card">
              <span class="l"><i class="pi pi-inbox"></i> APERTURA (CAJA BASE)</span>
              <span class="v">S/ {{ +c.session.openingAmount | number: '1.2-2' }}</span>
              <span class="m"><i class="pi pi-calendar"></i> {{ c.session.openedAt | date: 'dd/MM/yyyy HH:mm' }}</span>
            </div>
            <div class="card">
              <span class="l pu"><i class="pi pi-chart-bar"></i> TOTAL COBRADO</span>
              @if (canSeeCuadre()) {
                <span class="v">S/ {{ c.summary.totalCollected | number: '1.2-2' }}</span>
                <span class="m">{{ c.summary.salesCount }} ventas</span>
              } @else {
                <span class="v off">—</span><span class="m">No visible en Caja Ciega</span>
              }
            </div>
            <div class="card">
              <span class="l gr"><i class="pi pi-wallet"></i> EFECTIVO EN CAJA (CONTADO)</span>
              <span class="v off">—</span><span class="m">Se registrará al cerrar caja</span>
            </div>
            <div class="card">
              <span class="l or"><i class="pi pi-arrow-right-arrow-left"></i> EFECTIVO QUE VA A BOLSA</span>
              <span class="v off">—</span><span class="m">Se registrará al cerrar caja</span>
            </div>
          </div>

          <div class="grid3">
            <div class="panel">
              <h3>Cobros por método</h3>
              @for (m of methodEntries(c.summary.byMethod); track m.k) {
                <div class="kv"><span>{{ label(m.k) }}</span><strong>@if (canSeeCuadre()) { {{ m.v | number: '1.2-2' }} } @else { <span class="off">— —</span> }</strong></div>
              }
              <div class="kv total"><span>Total cobrado</span><strong>@if (canSeeCuadre()) { S/ {{ c.summary.totalCollected | number: '1.2-2' }} } @else { <span class="off">No visible en Caja Ciega</span> }</strong></div>
            </div>

            <div class="panel">
              <div class="panel-h"><h3>INGRESOS Y EGRESOS DE CAJA</h3><button class="mini" (click)="openNewMov()"><i class="pi pi-plus"></i> Registrar movimiento</button></div>
              @for (blk of [{ t: 'IN', label: 'INGRESOS', rows: ingresos() }, { t: 'OUT', label: 'EGRESOS', rows: egresos() }]; track blk.t) {
                <div class="io-h" [class.up]="blk.t === 'IN'" [class.dn]="blk.t === 'OUT'">
                  <span>{{ blk.label }}</span>
                  <span>{{ blk.t === 'IN' ? '+' : '-' }} S/ {{ (blk.t === 'IN' ? c.summary.movementsIn : c.summary.movementsOut) || 0 | number: '1.2-2' }}</span>
                </div>
                <table class="mov">
                  <thead><tr><th>Fecha / Hora</th><th>Concepto</th><th class="r">Monto</th><th>Usuario</th>@if (canEditMov()) { <th></th> }</tr></thead>
                  <tbody>
                    @for (mv of blk.rows; track mv.id) {
                      <tr>
                        <td>{{ mv.createdAt | date: 'dd/MM HH:mm' }}</td>
                        <td>{{ mv.concept }}</td>
                        <td class="r" [class.up]="blk.t === 'IN'" [class.dn]="blk.t === 'OUT'">{{ blk.t === 'IN' ? '+' : '-' }} S/ {{ mv.amount | number: '1.2-2' }}</td>
                        <td>{{ mv.user || '—' }}</td>
                        @if (canEditMov()) {
                          <td class="kbc">
                            <button class="kb" (click)="$event.stopPropagation(); menuFor.set(menuFor() === mv.id ? null : mv.id)"><i class="pi pi-ellipsis-v"></i></button>
                            @if (menuFor() === mv.id) {
                              <div class="kmenu" (click)="$event.stopPropagation()">
                                <button (click)="openEditMov(mv)"><i class="pi pi-pencil"></i> Editar</button>
                                <button class="danger" (click)="removeMov(mv)"><i class="pi pi-trash"></i> Eliminar</button>
                              </div>
                            }
                          </td>
                        }
                      </tr>
                    } @empty { <tr><td [attr.colspan]="canEditMov() ? 5 : 4" class="empty">Sin {{ blk.t === 'IN' ? 'ingresos' : 'egresos' }}.</td></tr> }
                  </tbody>
                </table>
              }
              <p class="hint"><i class="pi pi-info-circle"></i> Los ingresos y egresos registrados serán considerados al cerrar caja.</p>
            </div>

            <div class="panel info">
              <div class="ico"><i class="pi pi-money-bill"></i></div>
              <p class="muted center">Los ingresos y egresos de caja se considerarán al cerrar caja.</p>
              @if (blindClose()) {
                <p class="note-ciega"><strong>Caja Ciega activa:</strong> Al cerrar caja se registrará el efectivo contado y se imprimirá el ticket de entrega sin mostrar el esperado ni las diferencias.</p>
              }
            </div>
          </div>

          @if (blindClose()) {
            <div class="banner"><i class="pi pi-info-circle"></i>
              <div><strong>Caja Ciega Activa</strong><p>Recepción registra ingresos y egresos de caja para la operación del turno. El detalle del cierre (esperado y diferencias) será visible solo para administración.</p></div>
            </div>
          }

          <div class="actions">
            <p-button label="Registrar movimiento" icon="pi pi-plus" severity="secondary" (onClick)="openNewMov()" />
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

    <!-- Movimiento (alta / edición) -->
    <p-dialog [(visible)]="movVisible" [modal]="true" [header]="editingMovId ? 'Editar movimiento' : 'Movimiento de caja'" [style]="{ width: '26rem' }" styleClass="dk-dialog">
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
        <p-button [label]="editingMovId ? 'Guardar' : 'Registrar'" icon="pi pi-check" [disabled]="!mov.amount || !mov.concept" [loading]="busy()" (onClick)="saveMov()" />
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
      .top { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.35rem; }
      h1 { margin: 0; color: #fff; }
      h3 { margin: 0 0 0.7rem; }
      .muted { color: #8b97a8; }
      .badge-ciega { display: inline-flex; align-items: center; gap: 0.35rem; border: 1px solid #10b981; color: #34d399; border-radius: 8px; padding: 0.3rem 0.7rem; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.04em; }
      .badge-sup { display: inline-flex; align-items: center; gap: 0.35rem; border: 1px solid #3b82f6; color: #93c5fd; border-radius: 8px; padding: 0.3rem 0.7rem; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.04em; }
      .sub { display: flex; align-items: center; gap: 0.4rem; color: #8b97a8; font-size: 0.86rem; margin: 0 0 1.1rem; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 1rem; margin-bottom: 1.25rem; }
      .card { background: #131d2b; border: 1px solid #243245; border-radius: 12px; padding: 1.1rem; display: flex; flex-direction: column; gap: 0.35rem; }
      .card .l { display: flex; align-items: center; gap: 0.45rem; font-size: 0.74rem; color: #9fb0c3; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 700; }
      .card .l i { color: #34d399; } .card .l.pu i { color: #a78bfa; } .card .l.gr i { color: #34d399; } .card .l.or i { color: #fb923c; }
      .card .v { font-size: 1.65rem; font-weight: 800; color: #34d399; } .card .v.off { color: #4b5768; }
      .card .m { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: #8b97a8; }
      .grid3 { display: grid; grid-template-columns: 1fr 1.6fr 1fr; gap: 1rem; margin-bottom: 1.1rem; align-items: start; }
      @media (max-width: 1100px) { .grid3 { grid-template-columns: 1fr; } }
      .panel { background: #131d2b; border: 1px solid #243245; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem; }
      .grid3 .panel { margin-bottom: 0; height: 100%; }
      .panel.open { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; max-width: 460px; }
      .panel-h { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem; } .panel-h h3 { margin: 0; }
      .kv { display: flex; justify-content: space-between; padding: 0.3rem 0; }
      .kv.total { border-top: 1px solid #243245; margin-top: 0.4rem; padding-top: 0.5rem; font-weight: 700; }
      .off { color: #4b5768; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.78rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; }
      .io-h { display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.82rem; letter-spacing: 0.03em; margin: 0.6rem 0 0.2rem; }
      .io-h.up { color: #34d399; } .io-h.dn { color: #f87171; }
      table.mov { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      table.mov th { text-align: left; font-weight: 600; color: #8b97a8; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.3rem 0.4rem; border-bottom: 1px solid #243245; }
      table.mov td { padding: 0.4rem 0.4rem; border-bottom: 1px solid #1a2536; }
      table.mov td.r, table.mov th.r { text-align: right; } table.mov td.r.up { color: #34d399; font-weight: 700; } table.mov td.r.dn { color: #f87171; font-weight: 700; }
      table.mov td.empty { color: #6b7280; text-align: center; padding: 0.6rem; }
      .kbc { position: relative; width: 2rem; text-align: center; }
      .kb { background: transparent; border: 0; color: #8b97a8; cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 6px; } .kb:hover { background: #1a2536; color: #cbd5e1; }
      .kmenu { position: absolute; right: 0; top: 1.9rem; z-index: 20; background: #0e1622; border: 1px solid #274468; border-radius: 8px; padding: 0.3rem; min-width: 8rem; box-shadow: 0 8px 24px rgba(0,0,0,0.45); display: flex; flex-direction: column; }
      .kmenu button { background: transparent; border: 0; color: #cbd5e1; text-align: left; padding: 0.45rem 0.6rem; border-radius: 6px; cursor: pointer; font-size: 0.82rem; display: flex; align-items: center; gap: 0.45rem; } .kmenu button:hover { background: #17243a; } .kmenu button.danger { color: #fca5a5; }
      .hint { display: flex; align-items: center; gap: 0.4rem; color: #6b7280; font-size: 0.78rem; margin: 0.7rem 0 0; }
      .info { display: flex; flex-direction: column; align-items: center; gap: 0.7rem; text-align: center; }
      .info .ico { width: 3.2rem; height: 3.2rem; border-radius: 50%; background: #17243a; display: flex; align-items: center; justify-content: center; color: #93c5fd; font-size: 1.3rem; }
      .info .center { margin: 0; }
      .note-ciega { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.35); border-radius: 8px; padding: 0.6rem 0.7rem; font-size: 0.8rem; color: #a7f3d0; margin: 0; } .note-ciega strong { color: #34d399; }
      .banner { display: flex; gap: 0.7rem; align-items: flex-start; border: 1px solid rgba(16,185,129,0.4); background: rgba(16,185,129,0.08); border-radius: 12px; padding: 0.9rem 1.1rem; margin-bottom: 1.1rem; }
      .banner i { color: #34d399; margin-top: 0.15rem; } .banner strong { color: #34d399; } .banner p { margin: 0.2rem 0 0; color: #a7c3b8; font-size: 0.85rem; }
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
      .summary .kv.diff { border-top: 1px solid #243245; margin-top: 0.2rem; padding-top: 0.4rem; } .summary .kv.diff.neg strong { color: #f87171; }
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
  editingMovId: string | null = null;
  readonly movTypes = [{ label: 'Ingreso', value: 'IN' }, { label: 'Egreso', value: 'OUT' }];
  readonly canEditMov = computed(() => this.auth.can('finance', 'edit'));
  // Fila cuyo menú de acciones (⋮) está abierto.
  readonly menuFor = signal<string | null>(null);

  // Conteo de cierre por denominaciones (ambos modos).
  denoms: { value: number; qty: number }[] = DENOMS.map((value) => ({ value, qty: 0 }));
  bagRef = '';
  readonly countedTotal = signal(0);

  ngOnInit(): void { this.reload(); }

  reload(): void { this.finance.cashCurrent().subscribe((res) => this.current.set(res.data)); }
  label(k: string): string { return METHOD_LABEL[k] ?? k; }
  methodEntries(by: Record<string, number>): { k: string; v: number }[] { return Object.keys(by).map((k) => ({ k, v: by[k] })); }
  ingresos(): CashMovementRow[] { return (this.current()?.movements ?? []).filter((m) => m.type === 'IN'); }
  egresos(): CashMovementRow[] { return (this.current()?.movements ?? []).filter((m) => m.type === 'OUT'); }
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

  openNewMov(): void { this.menuFor.set(null); this.editingMovId = null; this.mov = { type: 'IN', amount: 0, concept: '' }; this.movVisible = true; }

  openEditMov(mv: CashMovementRow): void {
    this.menuFor.set(null);
    this.editingMovId = mv.id;
    this.mov = { type: mv.type, amount: mv.amount, concept: mv.concept };
    this.movVisible = true;
  }

  saveMov(): void {
    this.busy.set(true);
    const done = (msg: string) => { this.busy.set(false); this.movVisible = false; this.editingMovId = null; this.mov = { type: 'IN', amount: 0, concept: '' }; this.toast.add({ severity: 'success', summary: msg, detail: '' }); this.reload(); };
    const fail = (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); };
    if (this.editingMovId) {
      this.finance.editMovement(this.editingMovId, { type: this.mov.type, amount: this.mov.amount, concept: this.mov.concept }).subscribe({ next: () => done('Movimiento actualizado'), error: fail });
    } else {
      this.finance.addMovement({ type: this.mov.type, amount: this.mov.amount, concept: this.mov.concept }).subscribe({ next: () => done('Movimiento registrado'), error: fail });
    }
  }

  removeMov(mv: CashMovementRow): void {
    this.menuFor.set(null);
    if (!confirm(`¿Eliminar el ${mv.type === 'IN' ? 'ingreso' : 'egreso'} "${mv.concept}" por S/ ${mv.amount.toFixed(2)}?`)) return;
    this.busy.set(true);
    this.finance.deleteMovement(mv.id).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Movimiento eliminado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo eliminar.' }); },
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
