import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { CashCurrent } from '../services/finance.models';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  WALLET: 'Yape/Plin',
};

@Component({
  selector: 'app-cash',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, InputNumberModule, InputTextModule, SelectModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Cajas</h1>
          <p class="muted">Apertura y cierre de turno de caja.</p>
        </div>
      </header>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (!current()?.session) {
        <div class="panel">
          <h3>Abrir turno</h3>
          <p class="muted">No hay un turno abierto en esta sucursal.</p>
          <label>Monto inicial (efectivo)</label>
          <p-inputNumber [(ngModel)]="openingAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w-full" />
          <label>Notas</label>
          <input pInputText [(ngModel)]="openNotes" />
          @if (canCreate) {
            <p-button label="Abrir turno" icon="pi pi-lock-open" [loading]="busy()" (onClick)="open()" styleClass="mt" />
          }
        </div>
      } @else {
        <div class="panel">
          <div class="row-between">
            <h3>Turno abierto</h3>
            <p-tag value="ABIERTO" severity="success" />
          </div>
          <p class="muted">Desde {{ current()!.session!.openedAt | date: 'dd/MM/yy HH:mm' }}</p>

          <div class="metrics">
            <div class="metric"><span>Monto inicial</span><strong>{{ current()!.session!.openingAmount | number: '1.2-2' }}</strong></div>
            <div class="metric"><span>Ventas</span><strong>{{ current()!.summary?.salesCount ?? 0 }}</strong></div>
            <div class="metric"><span>Total cobrado</span><strong>{{ current()!.summary?.totalCollected ?? 0 | number: '1.2-2' }}</strong></div>
            <div class="metric"><span>Efectivo esperado</span><strong>{{ current()!.summary?.expectedCash ?? 0 | number: '1.2-2' }}</strong></div>
          </div>

          <h4>Cobros por método</h4>
          <div class="methods">
            @for (m of methodEntries(); track m.key) {
              <div class="method"><span>{{ label(m.key) }}</span><strong>{{ m.value | number: '1.2-2' }}</strong></div>
            }
          </div>

          <h4>Movimientos de efectivo</h4>
          <div class="methods">
            <div class="method"><span>Ingresos</span><strong>{{ current()!.summary?.movementsIn ?? 0 | number: '1.2-2' }}</strong></div>
            <div class="method"><span>Egresos</span><strong>{{ current()!.summary?.movementsOut ?? 0 | number: '1.2-2' }}</strong></div>
          </div>
          @if (canCreate) {
            <div class="mov-form">
              <p-select [options]="movTypes" optionLabel="label" optionValue="value" [(ngModel)]="movType" styleClass="mov-type" />
              <p-inputNumber [(ngModel)]="movAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" placeholder="Monto" styleClass="mov-amount" />
              <input pInputText [(ngModel)]="movConcept" placeholder="Concepto" class="mov-concept" />
              <p-button icon="pi pi-plus" label="Registrar" (onClick)="addMovement()" [loading]="movBusy()" />
            </div>
          }

          <h3 class="mt">Cerrar turno (arqueo)</h3>
          <label>Efectivo contado</label>
          <p-inputNumber [(ngModel)]="closingAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w-full" />
          @if (closingAmount !== null) {
            <p class="diff" [class.neg]="difference() < 0">
              Diferencia vs esperado: <strong>{{ difference() | number: '1.2-2' }}</strong>
            </p>
          }
          <label>Notas de cierre</label>
          <input pInputText [(ngModel)]="closeNotes" />
          @if (canEdit) {
            <p-button label="Cerrar turno" icon="pi pi-lock" severity="warn" [loading]="busy()" (onClick)="close()" styleClass="mt" />
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
      h4 { margin: 1rem 0 0.4rem; font-size: 0.9rem; color: var(--p-text-muted-color, #a1a1aa); }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .head { margin-bottom: 1.25rem; }
      .panel { max-width: 560px; background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; padding: 1.5rem; }
      label { display: block; margin: 0.85rem 0 0.35rem; font-size: 0.85rem; color: var(--p-text-muted-color, #a1a1aa); }
      input[pInputText] { width: 100%; }
      .mt { margin-top: 1.25rem; }
      .row-between { display: flex; align-items: center; justify-content: space-between; }
      .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-top: 1rem; }
      .metric, .method { display: flex; justify-content: space-between; padding: 0.6rem 0.8rem; border-radius: 8px; background: var(--p-content-hover-background, #2b2b30); }
      .methods { display: flex; flex-direction: column; gap: 0.4rem; }
      .diff { margin-top: 0.6rem; }
      .diff.neg strong { color: #f87171; }
      .mov-form { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.75rem; flex-wrap: wrap; }
      .mov-concept { flex: 1; min-width: 140px; }
      :host ::ng-deep .mov-type { width: 120px; }
      :host ::ng-deep .mov-amount { width: 130px; }
      :host ::ng-deep .w-full { width: 100%; }
    `,
  ],
})
export class CashComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly current = signal<CashCurrent | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);

  openingAmount: number | null = 0;
  openNotes = '';
  closingAmount: number | null = null;
  closeNotes = '';

  readonly movBusy = signal(false);
  readonly movTypes = [
    { label: 'Ingreso', value: 'IN' },
    { label: 'Egreso', value: 'OUT' },
  ];
  movType: 'IN' | 'OUT' = 'IN';
  movAmount: number | null = null;
  movConcept = '';

  readonly canCreate = this.auth.can('finance', 'create');
  readonly canEdit = this.auth.can('finance', 'edit');

  readonly difference = computed(() => {
    const expected = Number(this.current()?.summary?.expectedCash ?? 0);
    return Math.round(((this.closingAmount ?? 0) - expected) * 100) / 100;
  });

  ngOnInit(): void {
    this.reload();
  }

  label(key: string): string {
    return METHOD_LABEL[key] ?? key;
  }

  methodEntries(): { key: string; value: number }[] {
    const by = this.current()?.summary?.byMethod ?? {};
    return Object.keys(by).map((key) => ({ key, value: by[key] }));
  }

  reload(): void {
    this.loading.set(true);
    this.finance.cashCurrent().subscribe({
      next: (res) => { this.current.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  open(): void {
    this.busy.set(true);
    this.finance.openCash({ openingAmount: this.openingAmount ?? 0, notes: this.openNotes || undefined }).subscribe({
      next: () => {
        this.busy.set(false);
        this.messages.add({ severity: 'success', summary: 'Turno abierto', detail: 'Caja abierta.' });
        this.openNotes = '';
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo abrir.' });
      },
    });
  }

  addMovement(): void {
    if (this.movAmount == null || this.movAmount <= 0 || !this.movConcept) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Monto y concepto requeridos.' });
      return;
    }
    this.movBusy.set(true);
    this.finance.addMovement({ type: this.movType, amount: this.movAmount, concept: this.movConcept }).subscribe({
      next: () => {
        this.movBusy.set(false);
        this.movAmount = null;
        this.movConcept = '';
        this.messages.add({ severity: 'success', summary: 'Movimiento registrado', detail: 'Caja actualizada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.movBusy.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar.' });
      },
    });
  }

  close(): void {
    if (this.closingAmount === null) {
      this.messages.add({ severity: 'warn', summary: 'Falta el contado', detail: 'Ingresa el efectivo contado.' });
      return;
    }
    this.busy.set(true);
    this.finance.closeCash({ closingAmount: this.closingAmount, notes: this.closeNotes || undefined }).subscribe({
      next: (res) => {
        this.busy.set(false);
        const diff = res.data.difference;
        this.messages.add({
          severity: diff === 0 ? 'success' : 'warn',
          summary: 'Turno cerrado',
          detail: `Diferencia: ${diff.toFixed(2)}`,
        });
        this.closingAmount = null;
        this.closeNotes = '';
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo cerrar.' });
      },
    });
  }
}
