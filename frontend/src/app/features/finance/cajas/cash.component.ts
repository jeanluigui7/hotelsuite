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
import type { CashCurrent, CashDetail, CashDetailMovement, CashSessionRow } from '../services/finance.models';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  WALLET: 'Yape',
  TRANSFER: 'Plin',
  MIXTO: 'Mixto',
  PENDIENTE: 'Pendiente',
};
const TYPE_LABEL: Record<string, string> = {
  HOSPEDAJE: 'Hospedaje',
  RENOVACION: 'Pago Renovación',
  PRODUCTO: 'Venta Producto',
  SERVICIO: 'Servicio',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
};
// Colores de badge por tipo: [fondo, texto]
const TYPE_COLOR: Record<string, [string, string]> = {
  HOSPEDAJE: ['rgba(59,130,246,0.18)', '#60a5fa'],
  RENOVACION: ['rgba(245,158,11,0.2)', '#f59e0b'],
  PRODUCTO: ['rgba(245,158,11,0.2)', '#fbbf24'],
  SERVICIO: ['rgba(20,184,166,0.2)', '#2dd4bf'],
  INGRESO: ['rgba(16,185,129,0.18)', '#34d399'],
  EGRESO: ['rgba(248,113,113,0.18)', '#f87171'],
};

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
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '60rem', maxWidth: '97vw' }" [header]="detailHeader()">
      @if (detailLoading()) { <p class="muted">Cargando…</p> }
      @else if (detail()) {
        @let d = detail()!;
        <p class="turno">Turno: {{ d.session.openedAt | date: 'dd/MM/yyyy HH:mm' }} — {{ d.session.closedAt ? (d.session.closedAt | date: 'dd/MM/yyyy HH:mm') : 'En curso' }}</p>
        <div class="cards">
          <div class="mc blue"><span>Total Ventas Hospedaje</span><strong>S/ {{ d.cards.ventasHospedaje | number: '1.2-2' }}</strong></div>
          <div class="mc brown"><span>Ventas Productos</span><strong>S/ {{ d.cards.ventasProductos | number: '1.2-2' }}</strong></div>
          <div class="mc teal"><span>Servicios y Otros</span><strong>S/ {{ d.cards.serviciosOtros | number: '1.2-2' }}</strong></div>
          <div class="mc brown"><span>Deudas Pendientes</span><strong>S/ {{ d.cards.deudasPendientes | number: '1.2-2' }}</strong></div>
          <div class="mc green"><span>Efectivo</span><strong>S/ {{ d.cards.efectivo | number: '1.2-2' }}</strong></div>
          <div class="mc purple"><span>Ajustes (+/-)</span><strong>{{ d.cards.ajustes >= 0 ? '+' : '' }}S/ {{ d.cards.ajustes | number: '1.2-2' }}</strong></div>
        </div>

        <div class="bar">
          <span>Total Turno Parcial: <b>S/ {{ d.methodBar.total | number: '1.2-2' }}</b></span>
          <span>Efectivo: <b class="pos">S/ {{ (d.methodBar.byMethod['CASH'] || 0) | number: '1.2-2' }}</b></span>
          <span>Plin: <b>S/ {{ (d.methodBar.byMethod['TRANSFER'] || 0) | number: '1.2-2' }}</b></span>
          <span>Yape: <b style="color:#a855f7">S/ {{ (d.methodBar.byMethod['WALLET'] || 0) | number: '1.2-2' }}</b></span>
          <span>Tarjeta: <b style="color:#60a5fa">S/ {{ (d.methodBar.byMethod['CARD'] || 0) | number: '1.2-2' }}</b></span>
          <span>Ingresos: <b class="pos">+S/ {{ d.methodBar.ingresos | number: '1.2-2' }}</b></span>
          <span>Egresos: <b class="neg">-S/ {{ d.methodBar.egresos | number: '1.2-2' }}</b></span>
          <span>Anulaciones: <b class="neg">S/ {{ d.methodBar.anulaciones | number: '1.2-2' }}</b></span>
        </div>

        <div class="filters">
          <label>Tipo: <p-select [options]="typeFilterOpts" optionLabel="label" optionValue="value" [(ngModel)]="typeFilter" styleClass="flt-sm" /></label>
          <label>Método: <p-select [options]="methodFilterOpts" optionLabel="label" optionValue="value" [(ngModel)]="methodFilter" styleClass="flt-sm" /></label>
          <span class="count">Mostrando {{ filteredMovements().length }} de {{ d.movements.length }} movimientos</span>
        </div>

        <div class="tbl-wrap">
          <table class="tbl mini-tbl">
            <thead><tr><th>Hora</th><th>Tipo</th><th>Descripción</th><th class="r">Monto</th><th class="c">Método</th><th class="c">Estado</th></tr></thead>
            <tbody>
              @for (m of filteredMovements(); track m.id) {
                <tr [class.anulado]="m.status === 'ANULADO'">
                  <td>{{ m.time | date: 'HH:mm' }}</td>
                  <td><span class="tbadge" [style.background]="typeBg(m.type)" [style.color]="typeFg(m.type)">{{ typeLabel(m.type) }}</span></td>
                  <td>{{ m.description }}</td>
                  <td class="r">S/ {{ m.amount | number: '1.2-2' }}</td>
                  <td class="c">{{ methodLabel(m.method) }}</td>
                  <td class="c"><span class="est" [class.anul]="m.status === 'ANULADO'">{{ m.status }}</span></td>
                </tr>
              } @empty { <tr><td colspan="6" class="empty">Sin movimientos.</td></tr> }
            </tbody>
          </table>
        </div>
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
      .mc.brown { background: rgba(120,53,15,0.22); } .mc.teal { background: rgba(20,184,166,0.12); }
      .bar { display: flex; flex-wrap: wrap; gap: 0.9rem; padding: 0.6rem 0.8rem; border: 1px solid #1c2c44; border-radius: 10px; font-size: 0.8rem; color: #8aa0bd; margin-bottom: 0.6rem; }
      .bar b { color: #e2e8f0; }
      .turno { color: #8aa0bd; font-size: 0.82rem; margin: 0 0 0.7rem; }
      .filters { display: flex; align-items: center; gap: 1rem; margin: 0.4rem 0; flex-wrap: wrap; }
      .filters label { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #8aa0bd; }
      :host ::ng-deep .flt-sm { min-width: 9rem; }
      .tbadge { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.6rem; border-radius: 999px; white-space: nowrap; }
      .est { font-size: 0.68rem; font-weight: 700; padding: 0.12rem 0.55rem; border-radius: 6px; background: rgba(148,163,184,0.18); color: #94a3b8; }
      .est.anul { background: rgba(248,113,113,0.18); color: #f87171; }
      tr.anulado td { opacity: 0.55; text-decoration: line-through; }
      tr.anulado td:last-child { text-decoration: none; }
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
  readonly detail = signal<CashDetail | null>(null);
  detailRow: CashSessionRow | null = null;
  typeFilter = '';
  methodFilter = '';
  readonly typeFilterOpts = [
    { label: 'Todos', value: '' },
    { label: 'Hospedaje', value: 'HOSPEDAJE' },
    { label: 'Pago Renovación', value: 'RENOVACION' },
    { label: 'Venta Producto', value: 'PRODUCTO' },
    { label: 'Servicio', value: 'SERVICIO' },
    { label: 'Ingreso', value: 'INGRESO' },
    { label: 'Egreso', value: 'EGRESO' },
  ];
  readonly methodFilterOpts = [
    { label: 'Todos', value: '' },
    { label: 'Efectivo', value: 'CASH' },
    { label: 'Yape', value: 'WALLET' },
    { label: 'Plin', value: 'TRANSFER' },
    { label: 'Tarjeta', value: 'CARD' },
  ];
  filteredMovements(): CashDetailMovement[] {
    const all = this.detail()?.movements ?? [];
    return all.filter((m) => (!this.typeFilter || m.type === this.typeFilter) && (!this.methodFilter || m.method === this.methodFilter));
  }

  ngOnInit(): void {
    this.reloadCurrent();
    this.reload();
  }

  label(key: string): string { return METHOD_LABEL[key] ?? key; }
  methodLabel(key: string): string { return METHOD_LABEL[key] ?? key; }
  typeLabel(key: string): string { return TYPE_LABEL[key] ?? key; }
  typeBg(key: string): string { return (TYPE_COLOR[key] ?? ['rgba(148,163,184,0.18)', '#94a3b8'])[0]; }
  typeFg(key: string): string { return (TYPE_COLOR[key] ?? ['rgba(148,163,184,0.18)', '#94a3b8'])[1]; }

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
    this.detailRow = row; this.detail.set(null); this.typeFilter = ''; this.methodFilter = '';
    this.detailVisible = true; this.detailLoading.set(true);
    this.finance.sessionDetail(row.id).subscribe({
      next: (res) => { this.detail.set(res.data); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle.' }); },
    });
  }

  private refreshAll(): void { this.reloadCurrent(); this.reload(); }
}
