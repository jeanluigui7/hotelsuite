import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { CashMovementRow, MovementInput } from '../services/finance.models';
import { shiftOf } from '../services/cuadre-ticket';

type Registro = 'MOVEMENT' | 'EXTRAORDINARY';
type Metodo = 'CASH' | 'CARD' | 'TRANSFER' | 'YAPE' | 'PLIN' | 'WALLET';

const TURNO_RANGE: Record<string, string> = { 'MAÑANA': '06:30 - 14:00', TARDE: '14:00 - 22:30', NOCHE: '22:30 - 06:30' };

@Component({
  selector: 'app-movement-dialog',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, DialogModule, ButtonModule, InputNumberModule, InputTextModule, SelectModule],
  template: `
    <p-dialog [visible]="visible" (visibleChange)="visibleChange.emit($event)" [modal]="true" [style]="{ width: '44rem', maxWidth: '97vw' }" styleClass="mv-dialog" [dismissableMask]="true">
      <ng-template pTemplate="header">
        <div class="mv-h">
          <span class="mv-ico"><i class="pi pi-plus-circle"></i></span>
          <div><h2>{{ editing ? 'EDITAR MOVIMIENTO DE CAJA' : 'REGISTRAR MOVIMIENTO DE CAJA' }}</h2><p>Registra ingresos o egresos durante el turno</p></div>
        </div>
      </ng-template>

      <!-- Info del turno -->
      <div class="infobar">
        <div><i class="pi pi-calendar"></i><div><span>FECHA</span><strong>{{ now | date: 'dd/MM/yyyy' }}</strong></div></div>
        <div><i class="pi pi-clock"></i><div><span>HORA ACTUAL</span><strong>{{ now | date: 'HH:mm' }}</strong></div></div>
        <div><i class="pi pi-user"></i><div><span>USUARIO</span><strong>{{ userName }}</strong></div></div>
        <div><i class="pi pi-hashtag"></i><div><span>TURNO ACTUAL</span><strong>{{ turnoLabel() }}</strong></div></div>
      </div>

      <!-- 1. Tipo de registro -->
      <div class="fld">
        <label class="sec">1. TIPO DE REGISTRO</label>
        <div class="opts">
          <button type="button" class="opt" [class.sel]="form.category === 'MOVEMENT'" (click)="setRegistro('MOVEMENT')">
            <span class="radio"></span>
            <div><strong>Movimiento de caja</strong><p>Ingreso o egreso que no corresponde a ventas y servicios del hospedaje.</p><em>Ej: inyección de efectivo, pasajes, compras urgentes, retiros de dinero.</em></div>
          </button>
          <button type="button" class="opt" [class.sel]="form.category === 'EXTRAORDINARY'" (click)="setRegistro('EXTRAORDINARY')">
            <span class="radio"></span>
            <div><strong>Ingreso extraordinario</strong><p>Ingreso por servicios, penalidades o conceptos no parametrizados aún.</p><em>Ej: toalla adicional, persona extra, penalidad, servicio especial.</em></div>
          </button>
        </div>
        <p class="note"><i class="pi pi-info-circle"></i> Si el concepto es un servicio o penalidad al cliente, selecciona "Ingreso extraordinario" para que se registre como ingreso del negocio.</p>
      </div>

      <div class="row2">
        <!-- 2. Tipo de movimiento -->
        <div class="fld">
          <label class="sec">2. TIPO DE MOVIMIENTO</label>
          <div class="seg">
            <button type="button" class="in" [class.on]="form.type === 'IN'" (click)="setType('IN')"><i class="pi pi-arrow-down"></i> INGRESO</button>
            <button type="button" class="out" [class.on]="form.type === 'OUT'" [disabled]="form.category === 'EXTRAORDINARY'" (click)="setType('OUT')"><i class="pi pi-arrow-up"></i> EGRESO</button>
          </div>
        </div>
        <!-- 3. Monto -->
        <div class="fld">
          <label class="sec">3. MONTO</label>
          <p-inputNumber [(ngModel)]="form.amount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" placeholder="0.00" />
        </div>
      </div>

      <div class="row2">
        <!-- 4. Concepto -->
        <div class="fld">
          <label class="sec">4. CONCEPTO / MOTIVO</label>
          <input pInputText [(ngModel)]="form.concept" list="mvFreq" placeholder="Selecciona o escribe un concepto" />
          <datalist id="mvFreq">@for (c of concepts(); track c) { <option [value]="c"></option> }</datalist>
          <button type="button" class="link" [disabled]="!canAddFreq()" (click)="addFrequent()"><i class="pi pi-plus"></i> Agregar concepto frecuente</button>
        </div>
        <!-- 5. Método de pago -->
        <div class="fld">
          <label class="sec">5. MÉTODO DE PAGO <span class="hint">(Solo para ingresos)</span></label>
          <p-select [options]="methodOpts" optionLabel="label" optionValue="value" [(ngModel)]="form.method" [disabled]="form.type !== 'IN'" styleClass="w" />
        </div>
      </div>

      <div class="row2">
        <!-- 6. Observación -->
        <div class="fld">
          <label class="sec">6. OBSERVACIÓN <span class="hint">(Opcional)</span></label>
          <textarea [(ngModel)]="form.note" rows="2" placeholder="Detalles adicionales del movimiento..."></textarea>
        </div>
        <!-- 7. Comprobante -->
        <div class="fld">
          <label class="sec">7. COMPROBANTE / REFERENCIA <span class="hint">(Opcional)</span></label>
          <input pInputText [(ngModel)]="form.reference" placeholder="N° de comprobante, boleta, recibo, etc." />
          <p class="eg">Ej: B001-123, Recibo 045, Sin comprobante</p>
        </div>
      </div>

      <!-- Resumen -->
      <div class="resumen">
        <div class="r-tit">RESUMEN DEL REGISTRO</div>
        <div class="r-grid">
          <div><span>Tipo de registro:</span> <strong class="tag">{{ form.category === 'MOVEMENT' ? 'Movimiento de caja' : 'Ingreso extraordinario' }}</strong></div>
          <div><span>Monto:</span> <strong [class.pos]="form.type === 'IN'" [class.neg]="form.type === 'OUT'">S/ {{ (form.amount || 0) | number: '1.2-2' }}</strong></div>
          <div><span>Tipo de movimiento:</span> <strong [class.pos]="form.type === 'IN'" [class.neg]="form.type === 'OUT'">{{ form.type === 'IN' ? 'INGRESO' : 'EGRESO' }}</strong></div>
          <div><span>Concepto:</span> <strong>{{ form.concept || '—' }}</strong></div>
        </div>
      </div>
      <p class="foot"><i class="pi pi-info-circle"></i> Este registro quedará guardado en el historial de movimientos del turno.</p>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="visibleChange.emit(false)" />
        <p-button [label]="editing ? 'Guardar cambios' : 'Guardar Movimiento'" icon="pi pi-save" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .mv-dialog .p-dialog-content, :host ::ng-deep .mv-dialog .p-dialog-header, :host ::ng-deep .mv-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      .mv-h { display: flex; align-items: center; gap: 0.7rem; }
      .mv-ico { width: 2.2rem; height: 2.2rem; border-radius: 50%; background: rgba(139,92,246,0.15); color: #a78bfa; display: flex; align-items: center; justify-content: center; }
      .mv-h h2 { margin: 0; font-size: 1.05rem; color: #fff; } .mv-h p { margin: 0; font-size: 0.8rem; color: #8b97a8; }
      .infobar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; background: #0b1018; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 1rem; }
      .infobar > div { display: flex; align-items: center; gap: 0.5rem; } .infobar i { color: #8b97a8; }
      .infobar span { display: block; font-size: 0.66rem; color: #8b97a8; text-transform: uppercase; letter-spacing: 0.03em; } .infobar strong { font-size: 0.86rem; }
      .fld { margin-bottom: 0.9rem; display: flex; flex-direction: column; }
      .sec { font-size: 0.78rem; font-weight: 800; color: #cbd5e1; letter-spacing: 0.02em; margin-bottom: 0.45rem; } .sec .hint { color: #8b97a8; font-weight: 500; }
      .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
      .opt { display: flex; gap: 0.6rem; text-align: left; background: #0b1018; border: 1.5px solid #1c2c44; border-radius: 10px; padding: 0.8rem; cursor: pointer; color: #e6e9ef; }
      .opt.sel { border-color: #8b5cf6; background: rgba(139,92,246,0.08); }
      .opt .radio { flex: none; width: 1.05rem; height: 1.05rem; border-radius: 50%; border: 2px solid #47536b; margin-top: 0.15rem; position: relative; }
      .opt.sel .radio { border-color: #8b5cf6; } .opt.sel .radio::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: #8b5cf6; }
      .opt strong { display: block; font-size: 0.9rem; } .opt p { margin: 0.2rem 0; font-size: 0.76rem; color: #9fb0c3; } .opt em { font-size: 0.72rem; color: #6b7280; }
      .note { display: flex; gap: 0.4rem; align-items: flex-start; background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.25); color: #d9c48a; border-radius: 8px; padding: 0.5rem 0.7rem; font-size: 0.78rem; margin: 0.6rem 0 0; }
      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
      @media (max-width: 640px) { .row2, .opts, .infobar { grid-template-columns: 1fr; } }
      .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
      .seg button { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.7rem; border-radius: 9px; border: 1.5px solid #1c2c44; background: #0b1018; color: #cbd5e1; font-weight: 700; cursor: pointer; }
      .seg .in.on { border-color: #10b981; background: rgba(16,185,129,0.12); color: #34d399; }
      .seg .out.on { border-color: #ef4444; background: rgba(239,68,68,0.12); color: #f87171; }
      .seg button:disabled { opacity: 0.4; cursor: not-allowed; }
      .link { align-self: flex-start; background: none; border: 0; color: #a78bfa; cursor: pointer; font-size: 0.78rem; padding: 0.35rem 0; display: inline-flex; align-items: center; gap: 0.3rem; } .link:disabled { color: #4b5768; cursor: default; }
      .eg { margin: 0.25rem 0 0; font-size: 0.72rem; color: #6b7280; }
      textarea { background: #0b1018; border: 1px solid #2a3a54; border-radius: 8px; color: #e6e9ef; padding: 0.5rem 0.6rem; font-family: inherit; resize: vertical; width: 100%; }
      .resumen { background: rgba(139,92,246,0.06); border: 1px solid #26314a; border-radius: 10px; padding: 0.7rem 0.9rem; margin-top: 0.3rem; }
      .r-tit { font-size: 0.72rem; font-weight: 800; color: #a78bfa; letter-spacing: 0.03em; margin-bottom: 0.5rem; }
      .r-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem 1rem; font-size: 0.84rem; } .r-grid span { color: #8b97a8; } .r-grid .tag { color: #c4b5fd; }
      .r-grid .pos { color: #34d399; } .r-grid .neg { color: #f87171; }
      .foot { display: flex; align-items: center; gap: 0.4rem; color: #6b7280; font-size: 0.76rem; margin: 0.7rem 0 0; }
      :host ::ng-deep .w, :host ::ng-deep .w .p-select, :host ::ng-deep .fld input[pInputText], :host ::ng-deep .fld .p-inputnumber, :host ::ng-deep .fld .p-inputnumber input { width: 100%; }
    `,
  ],
})
export class MovementDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() openedAt: string | null = null;
  @Input() editing: CashMovementRow | null = null;
  @Input() presetType: 'IN' | 'OUT' | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

  readonly busy = signal(false);
  readonly concepts = signal<string[]>([]);
  private conceptsLoaded = false;
  now = new Date();

  form: { category: Registro; type: 'IN' | 'OUT'; amount: number | null; concept: string; method: Metodo; reference: string; note: string } = {
    category: 'MOVEMENT', type: 'IN', amount: null, concept: '', method: 'CASH', reference: '', note: '',
  };

  readonly methodOpts = [
    { label: 'Efectivo', value: 'CASH' },
    { label: 'Tarjeta', value: 'CARD' },
    { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Yape', value: 'YAPE' },
    { label: 'Plin', value: 'PLIN' },
    { label: 'Billetera', value: 'WALLET' },
  ];

  get userName(): string { return this.auth.user()?.name ?? 'Usuario'; }

  turnoLabel(): string {
    if (!this.openedAt) return '—';
    const t = shiftOf(this.openedAt);
    return `${t.charAt(0) + t.slice(1).toLowerCase()} (${TURNO_RANGE[t] ?? ''})`;
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['visible'] && this.visible) {
      this.now = new Date();
      if (!this.conceptsLoaded) {
        this.conceptsLoaded = true;
        this.finance.frequentConcepts().subscribe((r) => this.concepts.set(r.data ?? []));
      }
      if (this.editing) {
        const e = this.editing;
        this.form = { category: (e.category as Registro) || 'MOVEMENT', type: e.type, amount: e.amount, concept: e.concept, method: (e.method as Metodo) || 'CASH', reference: e.reference ?? '', note: e.note ?? '' };
      } else {
        this.form = { category: 'MOVEMENT', type: this.presetType ?? 'IN', amount: null, concept: '', method: 'CASH', reference: '', note: '' };
      }
    }
  }

  setRegistro(r: Registro): void {
    this.form.category = r;
    // El ingreso extraordinario siempre es un ingreso del negocio.
    if (r === 'EXTRAORDINARY') this.form.type = 'IN';
  }
  setType(t: 'IN' | 'OUT'): void {
    if (t === 'OUT' && this.form.category === 'EXTRAORDINARY') return;
    this.form.type = t;
    if (t === 'OUT') this.form.method = 'CASH';
  }

  canAddFreq(): boolean {
    const c = this.form.concept.trim();
    return !!c && !this.concepts().some((x) => x.toLowerCase() === c.toLowerCase());
  }
  addFrequent(): void {
    const c = this.form.concept.trim();
    if (!c) return;
    const next = [...this.concepts(), c];
    this.finance.saveFrequentConcepts(next).subscribe({
      next: (r) => { this.concepts.set(r.data ?? next); this.toast.add({ severity: 'success', summary: 'Concepto guardado', detail: c }); },
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar el concepto.' }),
    });
  }

  save(): void {
    if (!this.form.amount || this.form.amount <= 0) { this.toast.add({ severity: 'warn', summary: 'Monto', detail: 'Ingresa un monto válido.' }); return; }
    if (!this.form.concept.trim()) { this.toast.add({ severity: 'warn', summary: 'Concepto', detail: 'Indica el concepto o motivo.' }); return; }
    const dto: MovementInput = {
      type: this.form.type,
      amount: this.form.amount,
      concept: this.form.concept.trim(),
      method: this.form.type === 'IN' ? this.form.method : 'CASH',
      reference: this.form.reference.trim() || undefined,
      note: this.form.note.trim() || undefined,
      category: this.form.category,
    };
    this.busy.set(true);
    const done = (msg: string) => { this.busy.set(false); this.toast.add({ severity: 'success', summary: msg, detail: '' }); this.saved.emit(); this.visibleChange.emit(false); };
    const fail = (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); };
    if (this.editing) this.finance.editMovement(this.editing.id, dto).subscribe({ next: () => done('Movimiento actualizado'), error: fail });
    else this.finance.addMovement(dto).subscribe({ next: () => done('Movimiento registrado'), error: fail });
  }
}
