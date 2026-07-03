import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { CashCurrent, CashSessionRow, SessionReport } from '../services/finance.models';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  WALLET: 'Yape',
  TRANSFER: 'Plin',
};
const METHOD_ORDER = ['CASH', 'WALLET', 'TRANSFER', 'CARD'];

@Component({
  selector: 'app-cash',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule, TagModule],
  template: `
    <section class="wrap">
      <header class="head">
        <h1>Cajas</h1>
        <div class="actions">
          @if (openSession()) {
            <button class="btn in" (click)="openMovement('IN')"><i class="pi pi-plus-circle"></i> INGRESOS</button>
            <button class="btn out" (click)="openMovement('OUT')"><i class="pi pi-minus-circle"></i> EGRESOS</button>
          }
          <button class="btn new" (click)="openOpenDialog()" [disabled]="!!openSession()"><i class="pi pi-plus"></i> Abrir Caja</button>
        </div>
      </header>

      <!-- Banner de ajustes del turno abierto -->
      <div class="ajustes">
        <div>
          <div class="a-tit">──── AJUSTES ────</div>
          <div class="a-sub">{{ (adjIn() + adjOut()) > 0 ? 'Ajustes del turno abierto' : 'Sin ajustes operativos' }}</div>
        </div>
        <div class="a-tot">
          <div class="a-big">TOTAL AJUSTES : S/ {{ (adjIn() - adjOut()) | number: '1.2-2' }}</div>
          <div class="a-det"><span class="pos">Ingresos: S/ {{ adjIn() | number: '1.2-2' }}</span> &nbsp; <span class="neg">Egresos: S/ {{ adjOut() | number: '1.2-2' }}</span></div>
        </div>
      </div>

      <div class="toolbar">
        <p-select [options]="stateOptions" optionLabel="label" optionValue="value" [(ngModel)]="statusFilter" (onChange)="reload()" styleClass="flt" />
        <span class="count">Mostrando {{ total() }} caja(s)</span>
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr><th>ID</th><th>APERTURA</th><th>CIERRE</th><th class="r">MONTO INICIAL</th><th class="r">MONTO FINAL</th><th class="c">ESTADO</th><th class="c">CUADRE</th><th class="ac">ACCIONES</th></tr>
          </thead>
          <tbody>
            @for (s of rows(); track s.id) {
              <tr>
                <td class="id">{{ s.number ?? '—' }}</td>
                <td><div class="dt">{{ s.openedAt | date: 'dd/MM/yyyy HH:mm' }}</div><div class="usr"><i class="pi pi-user"></i> {{ s.openedByName }}</div></td>
                <td>
                  @if (s.closedAt) { <div class="dt">{{ s.closedAt | date: 'dd/MM/yyyy HH:mm' }}</div><div class="usr"><i class="pi pi-user"></i> {{ s.closedByName }}</div> }
                  @else { <span class="muted">—</span> }
                </td>
                <td class="r">S/ {{ s.openingAmount | number: '1.2-2' }}</td>
                <td class="r">{{ s.closingAmount != null ? ('S/ ' + (s.closingAmount | number: '1.2-2')) : '—' }}</td>
                <td class="c"><span class="pill" [class.open]="s.status === 'OPEN'" [class.closed]="s.status === 'CLOSED'"><i class="pi" [class.pi-lock-open]="s.status==='OPEN'" [class.pi-lock]="s.status==='CLOSED'"></i> {{ s.status === 'OPEN' ? 'Abierta' : 'Cerrada' }}</span></td>
                <td class="c">
                  @if (s.status === 'OPEN' || s.difference == null) { <span class="muted">—</span> }
                  @else if (s.difference > 0) { <span class="cuadre sob">+S/ {{ s.difference | number: '1.2-2' }} Sobrante</span> }
                  @else if (s.difference < 0) { <span class="cuadre fal">S/ {{ -s.difference | number: '1.2-2' }} Faltante</span> }
                  @else { <span class="cuadre ok"><i class="pi pi-check"></i> OK</span> }
                </td>
                <td class="ac">
                  <button class="mini" (click)="openDetail(s)">Ver</button>
                  @if (s.status === 'OPEN' && canEdit) { <button class="mini close" (click)="openCloseDialog(s)">Cerrar</button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="8" class="empty">Sin cajas registradas.</td></tr> }
          </tbody>
        </table>
      </div>

      @if (total() > pageSize) {
        <div class="pager">
          <button class="mini" [disabled]="page() === 1" (click)="go(page() - 1)">Anterior</button>
          <span>Página {{ page() }} de {{ pages() }}</span>
          <button class="mini" [disabled]="page() >= pages()" (click)="go(page() + 1)">Siguiente</button>
        </div>
      }
    </section>

    <!-- Abrir caja -->
    <p-dialog [(visible)]="openVisible" [modal]="true" header="Abrir caja" [style]="{ width: '26rem' }">
      <div class="form">
        <label>Monto inicial (efectivo)</label>
        <p-inputNumber [(ngModel)]="openingAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label>Notas</label>
        <input pInputText [(ngModel)]="openNotes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="openVisible = false" />
        <p-button label="Abrir" icon="pi pi-lock-open" [loading]="busy()" (onClick)="doOpen()" />
      </ng-template>
    </p-dialog>

    <!-- Ingreso/Egreso -->
    <p-dialog [(visible)]="movVisible" [modal]="true" [header]="movType === 'IN' ? 'Registrar ingreso' : 'Registrar egreso'" [style]="{ width: '26rem' }">
      <div class="form">
        <label>Monto</label>
        <p-inputNumber [(ngModel)]="movAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label>Concepto</label>
        <input pInputText [(ngModel)]="movConcept" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="movVisible = false" />
        <p-button label="Registrar" icon="pi pi-check" [loading]="busy()" (onClick)="doMovement()" />
      </ng-template>
    </p-dialog>

    <!-- Cerrar caja -->
    <p-dialog [(visible)]="closeVisible" [modal]="true" header="Cerrar caja (arqueo)" [style]="{ width: '28rem' }">
      <div class="form">
        <p class="muted">Efectivo esperado: <strong>S/ {{ expectedCash() | number: '1.2-2' }}</strong></p>
        <label>Efectivo contado</label>
        <p-inputNumber [(ngModel)]="closingAmount" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        @if (closingAmount !== null) {
          <p class="diff" [class.neg]="closeDiff() < 0">Diferencia: <strong>{{ closeDiff() | number: '1.2-2' }}</strong></p>
        }
        <label>Notas de cierre</label>
        <input pInputText [(ngModel)]="closeNotes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="closeVisible = false" />
        <p-button label="Cerrar turno" icon="pi pi-lock" severity="warn" [loading]="busy()" (onClick)="doClose()" />
      </ng-template>
    </p-dialog>

    <!-- Detalle (Ver) -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '52rem', maxWidth: '96vw' }" [header]="detailHeader()">
      @if (detailLoading()) { <p class="muted">Cargando…</p> }
      @else if (report()) {
        @let r = report()!;
        <div class="cards">
          <div class="mc blue"><span>Total Cobrado</span><strong>S/ {{ r.summary.totalCollected | number: '1.2-2' }}</strong></div>
          <div class="mc green"><span>Efectivo esperado</span><strong>S/ {{ r.summary.expectedCash | number: '1.2-2' }}</strong></div>
          <div class="mc amber"><span>Ventas</span><strong>{{ r.summary.salesCount }}</strong></div>
          <div class="mc purple"><span>Cuadre</span><strong>{{ r.difference != null ? ('S/ ' + (r.difference | number: '1.2-2')) : '—' }}</strong></div>
        </div>
        <div class="bar">
          @for (m of methodOrder; track m) { <span>{{ label(m) }}: <b>S/ {{ (r.summary.byMethod[m] || 0) | number: '1.2-2' }}</b></span> }
          <span>Ingresos: <b class="pos">S/ {{ (r.summary.movementsIn || 0) | number: '1.2-2' }}</b></span>
          <span>Egresos: <b class="neg">S/ {{ (r.summary.movementsOut || 0) | number: '1.2-2' }}</b></span>
        </div>

        <h4>Detalle de ventas</h4>
        <table class="tbl mini-tbl">
          <thead><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">Total</th></tr></thead>
          <tbody>
            @for (it of r.byItem; track it.description) { <tr><td>{{ it.description }}</td><td class="r">{{ it.quantity }}</td><td class="r">S/ {{ it.total | number: '1.2-2' }}</td></tr> }
            @empty { <tr><td colspan="3" class="empty">Sin ventas.</td></tr> }
          </tbody>
        </table>

        @if (r.movements.length) {
          <h4>Movimientos de efectivo</h4>
          <table class="tbl mini-tbl">
            <thead><tr><th>Hora</th><th>Concepto</th><th class="c">Tipo</th><th class="r">Monto</th></tr></thead>
            <tbody>
              @for (m of r.movements; track m.id) { <tr><td>{{ m.createdAt | date: 'HH:mm' }}</td><td>{{ m.concept }}</td><td class="c">{{ m.type === 'IN' ? 'Ingreso' : 'Egreso' }}</td><td class="r">S/ {{ m.amount | number: '1.2-2' }}</td></tr> }
            </tbody>
          </table>
        }
      }
    </p-dialog>
  `,
  styles: [
    `
      .wrap { padding: 1.25rem; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      h1 { margin: 0; font-size: 1.6rem; }
      h4 { margin: 1.1rem 0 0.4rem; font-size: 0.9rem; color: var(--p-text-muted-color, #a1a1aa); }
      .muted { color: var(--p-text-muted-color, #8aa0bd); }
      .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
      .btn { display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; border: 1px solid transparent; background: transparent; }
      .btn.in { color: #34d399; border-color: #14633f; } .btn.out { color: #f87171; border-color: #7f1d1d; }
      .btn.new { background: #10b981; color: #04130d; border: 0; } .btn.new:disabled { opacity: 0.45; cursor: not-allowed; }
      .ajustes { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin: 1rem 0; padding: 0.9rem 1.2rem; border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 12px; background: var(--p-content-background, #0e1622); flex-wrap: wrap; }
      .a-tit { color: #8aa0bd; letter-spacing: 1px; font-size: 0.8rem; } .a-sub { color: #64748b; font-size: 0.78rem; }
      .a-tot { text-align: right; } .a-big { font-weight: 800; font-size: 1.05rem; } .a-det { font-size: 0.78rem; }
      .pos { color: #34d399; } .neg { color: #f87171; }
      .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.6rem; }
      .count { color: #8aa0bd; font-size: 0.85rem; }
      .tbl-wrap { overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.7rem 0.7rem; border-bottom: 1px solid var(--p-content-border-color, #1c2c44); text-align: left; font-size: 0.86rem; vertical-align: top; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.74rem; letter-spacing: 0.4px; }
      .tbl .r { text-align: right; } .tbl .c { text-align: center; } .tbl .ac { text-align: right; white-space: nowrap; }
      .id { font-weight: 800; color: #93c5fd; }
      .dt { font-weight: 600; } .usr { color: #8aa0bd; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.3rem; margin-top: 0.15rem; }
      .pill { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.74rem; font-weight: 700; padding: 0.18rem 0.7rem; border-radius: 999px; }
      .pill.open { background: rgba(16,185,129,0.16); color: #34d399; } .pill.closed { background: rgba(148,163,184,0.16); color: #94a3b8; }
      .cuadre { font-size: 0.74rem; font-weight: 700; padding: 0.18rem 0.7rem; border-radius: 999px; white-space: nowrap; }
      .cuadre.sob { background: rgba(16,185,129,0.16); color: #34d399; } .cuadre.fal { background: rgba(248,113,113,0.16); color: #f87171; } .cuadre.ok { background: rgba(59,130,246,0.18); color: #60a5fa; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.35rem 0.75rem; font-size: 0.78rem; font-weight: 600; cursor: pointer; margin-left: 0.35rem; }
      .mini.close { background: #10b981; color: #04130d; border: 0; }
      .empty { text-align: center; color: #8aa0bd; padding: 2rem; }
      .pager { display: flex; align-items: center; gap: 1rem; justify-content: center; margin-top: 1rem; color: #8aa0bd; font-size: 0.82rem; }
      .form { display: flex; flex-direction: column; gap: 0.35rem; }
      .form label { font-size: 0.82rem; color: #8aa0bd; margin-top: 0.5rem; }
      :host ::ng-deep .form .w, :host ::ng-deep .form input[pInputText] { width: 100%; }
      .diff { margin-top: 0.5rem; } .diff.neg strong { color: #f87171; }
      .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; margin-bottom: 0.8rem; }
      .mc { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.8rem 0.9rem; border-radius: 10px; border: 1px solid #1c2c44; }
      .mc span { font-size: 0.72rem; color: #8aa0bd; } .mc strong { font-size: 1.05rem; }
      .mc.blue { background: rgba(37,99,235,0.12); } .mc.green { background: rgba(16,185,129,0.12); } .mc.amber { background: rgba(245,158,11,0.12); } .mc.purple { background: rgba(139,92,246,0.12); }
      .bar { display: flex; flex-wrap: wrap; gap: 0.9rem; padding: 0.6rem 0.8rem; border: 1px solid #1c2c44; border-radius: 10px; font-size: 0.8rem; color: #8aa0bd; }
      .bar b { color: #e2e8f0; }
      .mini-tbl th, .mini-tbl td { padding: 0.5rem 0.6rem; font-size: 0.82rem; }
      @media (max-width: 720px) { .cards { grid-template-columns: repeat(2, 1fr); } }
    `,
  ],
})
export class CashComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly rows = signal<CashSessionRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  statusFilter: '' | 'OPEN' | 'CLOSED' = '';
  readonly stateOptions = [
    { label: 'Todos los Estados', value: '' },
    { label: 'Abierta', value: 'OPEN' },
    { label: 'Cerrada', value: 'CLOSED' },
  ];

  // Turno abierto (para cabecera / arqueo)
  readonly current = signal<CashCurrent | null>(null);
  readonly openSession = computed(() => this.current()?.session ?? null);
  readonly adjIn = computed(() => Number(this.current()?.summary?.movementsIn ?? 0));
  readonly adjOut = computed(() => Number(this.current()?.summary?.movementsOut ?? 0));
  readonly expectedCash = computed(() => Number(this.current()?.summary?.expectedCash ?? 0));

  readonly busy = signal(false);
  readonly canCreate = this.auth.can('finance', 'create');
  readonly canEdit = this.auth.can('finance', 'edit');

  // Diálogos
  openVisible = false;
  openingAmount: number | null = 0;
  openNotes = '';

  movVisible = false;
  movType: 'IN' | 'OUT' = 'IN';
  movAmount: number | null = null;
  movConcept = '';

  closeVisible = false;
  closeTarget: CashSessionRow | null = null;
  closingAmount: number | null = null;
  closeNotes = '';
  readonly closeDiff = computed(() => Math.round(((this.closingAmount ?? 0) - this.expectedCash()) * 100) / 100);

  detailVisible = false;
  readonly detailLoading = signal(false);
  readonly report = signal<SessionReport | null>(null);
  detailRow: CashSessionRow | null = null;
  readonly methodOrder = METHOD_ORDER;

  ngOnInit(): void {
    this.reloadCurrent();
    this.reload();
  }

  label(key: string): string { return METHOD_LABEL[key] ?? key; }

  detailHeader(): string {
    const n = this.detailRow?.number;
    return n != null ? `Caja #${n}` : 'Detalle de caja';
  }

  reloadCurrent(): void {
    this.finance.cashCurrent().subscribe({ next: (res) => this.current.set(res.data), error: () => {} });
  }

  reload(): void {
    this.finance
      .listSessions({ page: this.page(), pageSize: this.pageSize, status: this.statusFilter || undefined })
      .subscribe({
        next: (res) => {
          this.rows.set(res.data ?? []);
          this.total.set(res.meta?.total ?? (res.data?.length ?? 0));
        },
        error: () => this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las cajas.' }),
      });
  }

  go(p: number): void { this.page.set(p); this.reload(); }

  // ── Abrir ──
  openOpenDialog(): void { this.openingAmount = 0; this.openNotes = ''; this.openVisible = true; }
  doOpen(): void {
    this.busy.set(true);
    this.finance.openCash({ openingAmount: this.openingAmount ?? 0, notes: this.openNotes || undefined }).subscribe({
      next: () => { this.busy.set(false); this.openVisible = false; this.messages.add({ severity: 'success', summary: 'Caja abierta', detail: 'Turno abierto.' }); this.refreshAll(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo abrir.' }); },
    });
  }

  // ── Ingreso/Egreso ──
  openMovement(type: 'IN' | 'OUT'): void { this.movType = type; this.movAmount = null; this.movConcept = ''; this.movVisible = true; }
  doMovement(): void {
    if (this.movAmount == null || this.movAmount <= 0 || !this.movConcept.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Monto y concepto requeridos.' }); return;
    }
    this.busy.set(true);
    this.finance.addMovement({ type: this.movType, amount: this.movAmount, concept: this.movConcept.trim() }).subscribe({
      next: () => { this.busy.set(false); this.movVisible = false; this.messages.add({ severity: 'success', summary: 'Registrado', detail: 'Movimiento agregado.' }); this.reloadCurrent(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar.' }); },
    });
  }

  // ── Cerrar ──
  openCloseDialog(row: CashSessionRow): void { this.closeTarget = row; this.closingAmount = null; this.closeNotes = ''; this.closeVisible = true; }
  doClose(): void {
    if (this.closingAmount === null) { this.messages.add({ severity: 'warn', summary: 'Falta el contado', detail: 'Ingresa el efectivo contado.' }); return; }
    this.busy.set(true);
    this.finance.closeCash({ closingAmount: this.closingAmount, notes: this.closeNotes || undefined }).subscribe({
      next: (res) => { this.busy.set(false); this.closeVisible = false; this.messages.add({ severity: res.data.difference === 0 ? 'success' : 'warn', summary: 'Turno cerrado', detail: `Diferencia: ${res.data.difference.toFixed(2)}` }); this.refreshAll(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cerrar.' }); },
    });
  }

  // ── Detalle ──
  openDetail(row: CashSessionRow): void {
    this.detailRow = row; this.report.set(null); this.detailVisible = true; this.detailLoading.set(true);
    this.finance.sessionReport(row.id).subscribe({
      next: (res) => { this.report.set(res.data); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle.' }); },
    });
  }

  private refreshAll(): void { this.reloadCurrent(); this.reload(); }
}
