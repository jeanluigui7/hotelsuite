import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { HrApiService, type Attendance, type DailyResponse, type DailyRow, type MonthlyResponse } from '../services/hr-api.service';
import { UsersApiService, type UserRow } from '../services/users-api.service';
import { downloadXlsxMultiSheet, printPdf, type XlsxColumn } from '../../../core/utils/export';

type Tab = 'daily' | 'monthly' | 'history';
type Period = 'day' | 'week' | 'month';
type IndFilter = null | 'present' | 'sinentrada' | 'tarde';

const SIT_META: Record<string, { label: string; severity: 'success' | 'info' | 'warn' | 'danger' | 'secondary' }> = {
  PRESENTE: { label: 'Presente', severity: 'info' },
  FINALIZADO: { label: 'Finalizado', severity: 'success' },
  FALTA_SALIDA: { label: 'Falta marca de salida', severity: 'warn' },
  SIN_ENTRADA: { label: 'Sin entrada · Por revisar', severity: 'warn' },
  SIN_HORARIO: { label: 'Sin horario confirmado', severity: 'secondary' },
};
const SHIFT_LABEL: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', NOCHE: 'Noche' };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, DatePickerModule, TableModule, TagModule, TooltipModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Asistencias</h1>
          <p class="muted">Control de asistencia del personal a partir de marcas reales (huella o regularización manual).</p>
        </div>
        <div class="head-actions">
          <p-button label="Exportar Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" [loading]="exporting()" (onClick)="exportExcel()" />
          <p-button label="Exportar PDF" icon="pi pi-file-pdf" severity="secondary" [outlined]="true" (onClick)="exportPdf()" />
          @if (canCreate) { <p-button label="Registrar marca" icon="pi pi-plus" (onClick)="openNew()" /> }
        </div>
      </header>

      <!-- Pestañas -->
      <div class="tabs">
        <button type="button" [class.on]="tab() === 'daily'" (click)="setTab('daily')"><i class="pi pi-calendar"></i> Control diario</button>
        <button type="button" [class.on]="tab() === 'monthly'" (click)="setTab('monthly')"><i class="pi pi-chart-bar"></i> Resumen mensual</button>
        <button type="button" [class.on]="tab() === 'history'" (click)="setTab('history')"><i class="pi pi-history"></i> Historial de marcas</button>
      </div>

      <!-- Filtros -->
      <div class="filters">
        @if (tab() !== 'history') {
          <p-datepicker [(ngModel)]="anchor" (onSelect)="onAnchor()" [view]="tab() === 'monthly' ? 'month' : 'date'" [dateFormat]="tab() === 'monthly' ? 'mm/yy' : 'dd/mm/yy'" appendTo="body" styleClass="dk" [showIcon]="true" />
        }
        @if (tab() === 'daily') {
          <div class="seg">
            <button type="button" [class.on]="period() === 'day'" (click)="setPeriod('day')">Día</button>
            <button type="button" [class.on]="period() === 'week'" (click)="setPeriod('week')">Semana</button>
            <button type="button" [class.on]="period() === 'month'" (click)="setPeriod('month')">Mes</button>
          </div>
        }
        <p-select [options]="userOpts()" optionLabel="label" optionValue="value" [(ngModel)]="fUserId" (onChange)="reload()" [filter]="true" filterBy="label" [showClear]="true" placeholder="Trabajador: Todos" styleClass="dk" />
        <p-select [options]="roleOpts()" optionLabel="label" optionValue="value" [(ngModel)]="fRole" (onChange)="reload()" [showClear]="true" placeholder="Rol: Todos" styleClass="dk" />
        @if (tab() === 'daily') {
          <p-select [options]="shiftOpts" optionLabel="label" optionValue="value" [(ngModel)]="fShift" (onChange)="reload()" [showClear]="true" placeholder="Turno: Todos" styleClass="dk" />
        }
        <span class="f"><i class="pi pi-search"></i><input pInputText placeholder="Buscar nombre" [(ngModel)]="fSearch" (keyup.enter)="reload()" (input)="onSearch()" /></span>
      </div>

      @switch (tab()) {
        @case ('daily') {
          <!-- Indicadores -->
          <div class="kpis">
            <button type="button" class="kpi present" [class.active]="indFilter() === 'present'" (click)="toggleInd('present')">
              <span class="k-ico"><i class="pi pi-users"></i></span>
              <span class="k-body"><small>Presentes ahora</small><b>{{ daily()?.indicators?.presentesAhora ?? '—' }}</b></span>
            </button>
            <button type="button" class="kpi warn" [class.active]="indFilter() === 'sinentrada'" (click)="toggleInd('sinentrada')">
              <span class="k-ico"><i class="pi pi-exclamation-triangle"></i></span>
              <span class="k-body"><small>Sin entrada por revisar</small><b>{{ daily()?.indicators?.sinEntrada ?? 0 }}</b></span>
            </button>
            <button type="button" class="kpi late" [class.active]="indFilter() === 'tarde'" (click)="toggleInd('tarde')">
              <span class="k-ico"><i class="pi pi-clock"></i></span>
              <span class="k-body"><small>Entradas tarde (referencia)</small><b>{{ daily()?.indicators?.tardanzasRef ?? 0 }}</b></span>
            </button>
          </div>

          <p-table [value]="filteredDaily()" [loading]="loading()" [paginator]="true" [rows]="20" styleClass="p-datatable-sm" [rowHover]="true">
            <ng-template pTemplate="header">
              <tr>
                @if (multiDay()) { <th style="width:7rem">Fecha</th> }
                <th>Trabajador</th>
                <th style="width:12rem">Turno de referencia</th>
                <th style="width:6rem">Entrada</th>
                <th style="width:7rem">Salida</th>
                <th style="width:12rem">Situación</th>
                <th style="width:9rem">Puntualidad</th>
                <th>Referencia</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-row>
              <tr class="clickable" (click)="openDetail(row)">
                @if (multiDay()) { <td class="muted">{{ row.businessDate }}</td> }
                <td><b>{{ row.userName }}</b><br /><small class="muted">{{ row.roleName }}</small></td>
                <td>
                  @if (row.reference) {
                    <span>{{ row.reference.start }} – {{ row.reference.end }}</span>
                    <small class="muted"> · {{ shiftLabel(row.reference.shift) }}</small>
                  } @else {
                    <span class="muted">Sin horario confirmado</span>
                  }
                </td>
                <td>{{ row.entradaAt ? (row.entradaAt | date: 'HH:mm') : '—' }}</td>
                <td>
                  {{ row.salidaAt ? (row.salidaAt | date: 'HH:mm') : '—' }}
                  @if (row.salidaNextDay) { <small class="plus1">+1 día</small> }
                </td>
                <td><p-tag [value]="sitMeta(row.situacion).label" [severity]="sitMeta(row.situacion).severity" /></td>
                <td>
                  @switch (row.puntualidad.kind) {
                    @case ('PUNTUAL') { <p-tag value="Puntual" severity="success" /> }
                    @case ('TARDE') { <span class="late-chip" pTooltip="Respecto al turno de referencia (no es tardanza confirmada)">+{{ row.puntualidad.lateMinutes }} min</span> }
                    @case ('SIN_CALCULAR') { <span class="muted">Sin calcular</span> }
                    @case ('PENDIENTE') { <span class="muted">Pendiente</span> }
                  }
                </td>
                <td class="muted">
                  @if (row.isRegularization) { <span class="reg"><i class="pi pi-pencil"></i> Regularización</span> }
                  {{ row.note }}
                </td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage"><tr><td [attr.colspan]="multiDay() ? 8 : 7" class="muted center">Sin jornadas para los filtros seleccionados.</td></tr></ng-template>
          </p-table>
        }

        @case ('monthly') {
          <div class="month-scroll">
            <p-table [value]="monthly()?.people ?? []" [loading]="loading()" styleClass="p-datatable-sm" [scrollable]="true">
              <ng-template pTemplate="header">
                <tr>
                  <th style="min-width:12rem" pFrozenColumn>Trabajador</th>
                  @for (d of monthDays(); track d) { <th class="dcell">{{ d }}</th> }
                  <th class="tot">Jorn.</th>
                  <th class="tot">Asist.</th>
                  <th class="tot">Tarde ref.</th>
                  <th class="tot">Min. tarde</th>
                  <th class="tot">Pend.</th>
                  <th class="tot">Desc.</th>
                  <th class="tot">Faltas</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-p>
                <tr>
                  <td pFrozenColumn><b>{{ p.userName }}</b><br /><small class="muted">{{ p.roleName }}</small></td>
                  @for (d of monthDays(); track d) {
                    <td class="dcell">
                      @if (p.days[d]) {
                        <span class="dot" [class.ok]="p.days[d] === 'PRESENTE'" [class.late]="p.days[d] === 'TARDE'" [class.sin]="p.days[d] === 'SIN_ENTRADA'"
                              (click)="openDayDetail(p, d); $event.stopPropagation()" [pTooltip]="dayTip(p.days[d])"></span>
                      }
                    </td>
                  }
                  <td class="tot">{{ p.totals.jornadas }}</td>
                  <td class="tot">{{ p.totals.asistencias }}</td>
                  <td class="tot">{{ p.totals.tardanzasRef }}</td>
                  <td class="tot">{{ p.totals.minutosTardeRef }}</td>
                  <td class="tot">{{ p.totals.marcasPendientes }}</td>
                  <td class="tot muted">—</td>
                  <td class="tot muted">—</td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage"><tr><td [attr.colspan]="monthDays().length + 8" class="muted center">Sin datos para el mes.</td></tr></ng-template>
            </p-table>
          </div>
          <p class="legend"><span class="dot ok"></span> Asistencia <span class="dot late"></span> Entrada tarde (ref.) <span class="dot sin"></span> Sin entrada · <small class="muted">Descansos y faltas confirmadas no se registran todavía (n/d).</small></p>
        }

        @case ('history') {
          <p-table [value]="history()" [loading]="loading()" [paginator]="true" [rows]="20" styleClass="p-datatable-sm">
            <ng-template pTemplate="header">
              <tr><th>Usuario</th><th style="width:7rem">Tipo</th><th style="width:8rem">Origen</th><th style="width:12rem">Fecha/Hora</th><th>Nota</th></tr>
            </ng-template>
            <ng-template pTemplate="body" let-row>
              <tr>
                <td>{{ row.userName }}</td>
                <td><p-tag [value]="row.type === 'IN' ? 'Entrada' : 'Salida'" [severity]="row.type === 'IN' ? 'success' : 'secondary'" /></td>
                <td><p-tag [value]="row.source === 'BIOMETRIC' ? 'Huella' : 'Manual'" severity="info" /></td>
                <td>{{ row.at | date: 'dd/MM/yy HH:mm' }}</td>
                <td class="muted">{{ row.note }}</td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin marcas.</td></tr></ng-template>
          </p-table>
        }
      }
    </section>

    <!-- Detalle de jornada -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '480px' }" [header]="detailTitle()">
      <div class="detail">
        @for (r of detailRows(); track r.key) {
          <div class="d-card">
            <div class="d-head"><b>{{ r.userName }}</b> · <span class="muted">{{ r.roleName }}</span> · <span class="muted">{{ r.businessDate }}</span></div>
            <div class="d-grid">
              <div><small>Turno de referencia</small><b>{{ r.reference ? (r.reference.start + ' – ' + r.reference.end + ' · ' + shiftLabel(r.reference.shift)) : 'Sin horario confirmado' }}</b></div>
              <div><small>Tolerancia</small><b>{{ r.reference ? (r.reference.toleranceMinutes + ' min') : '—' }}</b></div>
              <div><small>Entrada</small><b>{{ r.entradaAt ? (r.entradaAt | date: 'dd/MM HH:mm') : '—' }}</b></div>
              <div><small>Salida</small><b>{{ r.salidaAt ? (r.salidaAt | date: 'dd/MM HH:mm') : '—' }}{{ r.salidaNextDay ? ' (+1 día)' : '' }}</b></div>
              <div><small>Situación</small><b>{{ sitMeta(r.situacion).label }}</b></div>
              <div><small>Puntualidad</small><b>{{ puntLabel(r) }}</b></div>
              <div><small>Origen</small><b>{{ sourceLabel(r.source) }}</b></div>
              <div><small>Regularización</small><b>{{ r.isRegularization ? 'Sí (marca manual)' : 'No' }}</b></div>
            </div>
            @if (r.note) { <p class="d-note"><i class="pi pi-comment"></i> {{ r.note }}</p> }
          </div>
        }
        @if (detailRows().length === 0) { <p class="muted center">Sin jornadas ese día.</p> }
        <p class="muted sm">Cambios de turno, coberturas y sobrehoras aprobadas aún no se registran en el sistema (propuesta futura).</p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="detailVisible = false" />
      </ng-template>
    </p-dialog>

    <!-- Registrar marca -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '420px' }" header="Registrar marca">
      <div class="cat-form">
        <label>Usuario</label>
        <p-select [options]="users()" optionLabel="name" optionValue="id" [(ngModel)]="form.userId" placeholder="Seleccionar" styleClass="w-full" />
        <label>Tipo</label>
        <p-select [options]="typeOpts" optionLabel="label" optionValue="value" [(ngModel)]="form.type" styleClass="w-full" />
        <label>Nota</label>
        <input pInputText [(ngModel)]="form.note" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Registrar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .head-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .tabs { display: flex; gap: 0.4rem; margin: 0.25rem 0 1rem; border-bottom: 1px solid var(--p-content-border-color, #e5e7eb); }
      .tabs button { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.6rem 1rem; border: 0; background: transparent; cursor: pointer;
        color: var(--p-text-muted-color, #8aa0bd); font-weight: 600; font-size: 0.9rem; border-bottom: 2px solid transparent; }
      .tabs button.on { color: var(--rz-accent, #10b981); border-bottom-color: var(--rz-accent, #10b981); }
      .filters { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
      .filters .f { display: inline-flex; align-items: center; gap: 0.4rem; background: var(--p-content-hover-background, #f3f4f6);
        border: 1px solid var(--p-content-border-color, #d1d5db); border-radius: 8px; padding: 0 0.6rem; }
      .filters .f input { border: 0; background: transparent; padding: 0.5rem 0; outline: none; color: inherit; }
      .seg, .filters .seg { display: inline-flex; border: 1px solid var(--p-content-border-color, #d1d5db); border-radius: 8px; overflow: hidden; }
      .seg button { border: 0; background: transparent; padding: 0.5rem 0.9rem; cursor: pointer; color: var(--p-text-color, #334155); font-weight: 600; font-size: 0.85rem; }
      .seg button.on { background: var(--rz-accent, #10b981); color: #04130d; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
      .kpi { display: flex; align-items: center; gap: 0.8rem; padding: 0.85rem 1rem; cursor: pointer; text-align: left;
        border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 12px; background: var(--p-content-background, #fff); }
      .kpi .k-ico { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; font-size: 1.1rem; }
      .kpi .k-body { display: flex; flex-direction: column; line-height: 1.1; }
      .kpi .k-body small { font-size: 0.74rem; color: var(--p-text-muted-color, #8aa0bd); text-transform: uppercase; letter-spacing: 0.03em; }
      .kpi .k-body b { font-size: 1.5rem; }
      .kpi.present .k-ico { background: rgba(16,185,129,0.14); color: #10b981; }
      .kpi.warn .k-ico { background: rgba(245,158,11,0.16); color: #d97706; }
      .kpi.late .k-ico { background: rgba(234,179,8,0.16); color: #ca8a04; }
      .kpi.active { border-color: var(--rz-accent, #10b981); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rz-accent, #10b981) 22%, transparent); }
      tr.clickable { cursor: pointer; }
      .plus1 { display: inline-block; margin-left: 0.3rem; font-size: 0.68rem; padding: 0.05rem 0.35rem; border-radius: 99px; background: rgba(99,102,241,0.15); color: #6366f1; }
      .late-chip { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 99px; font-size: 0.8rem; font-weight: 700; background: rgba(234,179,8,0.18); color: #a16207; }
      .reg { display: inline-flex; align-items: center; gap: 0.25rem; color: #6366f1; font-weight: 600; margin-right: 0.3rem; }
      .month-scroll { overflow-x: auto; }
      .dcell { text-align: center; width: 2rem; min-width: 2rem; padding: 0.3rem 0.15rem !important; font-size: 0.75rem; }
      .tot { text-align: center; font-variant-numeric: tabular-nums; }
      .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: var(--p-content-hover-background, #e5e7eb); cursor: pointer; }
      .dot.ok { background: #10b981; } .dot.late { background: #eab308; } .dot.sin { background: #f97316; }
      .legend { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; font-size: 0.82rem; color: var(--p-text-color, #334155); }
      .legend .dot { cursor: default; }
      .detail .d-card { border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 10px; padding: 0.85rem; margin-bottom: 0.7rem; }
      .detail .d-head { margin-bottom: 0.6rem; }
      .detail .d-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
      .detail .d-grid small { display: block; font-size: 0.72rem; color: var(--p-text-muted-color, #8aa0bd); }
      .detail .d-note { margin: 0.6rem 0 0; font-size: 0.85rem; color: var(--p-text-muted-color, #8aa0bd); }
      .sm { font-size: 0.78rem; margin-top: 0.5rem; }
      .center { text-align: center; }
    `,
  ],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class AttendanceComponent implements OnInit {
  private readonly hr = inject(HrApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly tab = signal<Tab>('daily');
  readonly period = signal<Period>('day');
  readonly loading = signal(false);
  readonly exporting = signal(false);

  anchor: Date = new Date();
  fUserId: string | null = null;
  fRole: string | null = null;
  fShift: string | null = null;
  fSearch = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly users = signal<UserRow[]>([]);
  readonly daily = signal<DailyResponse | null>(null);
  readonly monthly = signal<MonthlyResponse | null>(null);
  readonly history = signal<Attendance[]>([]);
  readonly indFilter = signal<IndFilter>(null);

  // Detalle
  detailVisible = false;
  readonly detailRows = signal<DailyRow[]>([]);
  readonly detailTitle = signal('Detalle de jornada');

  // Registrar marca
  dialogVisible = false;
  form = { userId: null as string | null, type: 'IN' as 'IN' | 'OUT', note: '' };
  readonly saving = signal(false);
  readonly typeOpts = [
    { label: 'Entrada', value: 'IN' },
    { label: 'Salida', value: 'OUT' },
  ];
  readonly shiftOpts = [
    { label: 'Mañana', value: 'MANANA' },
    { label: 'Tarde', value: 'TARDE' },
    { label: 'Noche', value: 'NOCHE' },
  ];

  readonly canCreate = this.auth.can('hr', 'create');

  readonly userOpts = computed(() => this.users().map((u) => ({ label: u.name, value: u.id })));
  readonly roleOpts = computed(() => {
    const names = [...new Set(this.users().map((u) => u.role?.name).filter(Boolean))] as string[];
    return names.sort().map((n) => ({ label: n, value: n }));
  });

  readonly multiDay = computed(() => {
    const r = this.range();
    return r.from !== r.to;
  });

  readonly filteredDaily = computed(() => {
    const rows = this.daily()?.rows ?? [];
    const f = this.indFilter();
    if (!f) return rows;
    if (f === 'present') return rows.filter((r) => r.situacion === 'PRESENTE');
    if (f === 'sinentrada') return rows.filter((r) => r.situacion === 'SIN_ENTRADA');
    return rows.filter((r) => r.puntualidad.kind === 'TARDE');
  });

  readonly monthDays = computed(() => {
    const n = this.monthly()?.daysInMonth ?? 0;
    return Array.from({ length: n }, (_, i) => i + 1);
  });

  ngOnInit(): void {
    this.usersApi.list({ pageSize: 300, sortBy: 'name' }).subscribe((res) => this.users.set(res.data ?? []));
    this.reload();
  }

  // ── Rango de fechas ──
  private range(): { from: string; to: string } {
    const a = this.anchor ?? new Date();
    if (this.tab() === 'monthly') {
      const first = new Date(a.getFullYear(), a.getMonth(), 1);
      const last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      return { from: ymd(first), to: ymd(last) };
    }
    if (this.period() === 'day') return { from: ymd(a), to: ymd(a) };
    if (this.period() === 'week') {
      const dow = (a.getDay() + 6) % 7; // 0 = lunes
      const mon = new Date(a); mon.setDate(a.getDate() - dow);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: ymd(mon), to: ymd(sun) };
    }
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    return { from: ymd(first), to: ymd(last) };
  }

  private filterParams() {
    return {
      role: this.fRole ?? undefined,
      shift: this.fShift ?? undefined,
      userId: this.fUserId ?? undefined,
      search: this.fSearch.trim() || undefined,
    };
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    this.indFilter.set(null);
    this.reload();
  }
  setPeriod(p: Period): void {
    this.period.set(p);
    this.reload();
  }
  onAnchor(): void {
    this.reload();
  }
  onSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 400);
  }
  toggleInd(f: Exclude<IndFilter, null>): void {
    this.indFilter.set(this.indFilter() === f ? null : f);
  }

  reload(): void {
    if (this.tab() === 'daily') this.reloadDaily();
    else if (this.tab() === 'monthly') this.reloadMonthly();
    else this.reloadHistory();
  }

  private reloadDaily(): void {
    const { from, to } = this.range();
    this.loading.set(true);
    this.hr.dailyReport({ from, to, ...this.filterParams() }).subscribe({
      next: (res) => { this.daily.set(res.data ?? null); this.loading.set(false); },
      error: () => { this.daily.set(null); this.loading.set(false); },
    });
  }

  private reloadMonthly(): void {
    const month = `${this.anchor.getFullYear()}-${String(this.anchor.getMonth() + 1).padStart(2, '0')}`;
    this.loading.set(true);
    this.hr.monthlyReport({ month, role: this.fRole ?? undefined, userId: this.fUserId ?? undefined, search: this.fSearch.trim() || undefined }).subscribe({
      next: (res) => { this.monthly.set(res.data ?? null); this.loading.set(false); },
      error: () => { this.monthly.set(null); this.loading.set(false); },
    });
  }

  private reloadHistory(): void {
    this.loading.set(true);
    this.hr.listAttendances({ pageSize: 300, userId: this.fUserId ?? undefined }).subscribe({
      next: (res) => { this.history.set(res.data ?? []); this.loading.set(false); },
      error: () => { this.history.set([]); this.loading.set(false); },
    });
  }

  // ── Detalle ──
  openDetail(row: DailyRow): void {
    this.detailTitle.set(`${row.userName} · ${row.businessDate}`);
    this.detailRows.set([row]);
    this.detailVisible = true;
  }
  openDayDetail(person: { userId: string; userName: string }, day: number): void {
    const month = `${this.anchor.getFullYear()}-${String(this.anchor.getMonth() + 1).padStart(2, '0')}`;
    const dayKey = `${month}-${String(day).padStart(2, '0')}`;
    this.detailTitle.set(`${person.userName} · ${dayKey}`);
    this.detailRows.set([]);
    this.detailVisible = true;
    this.hr.dailyReport({ from: dayKey, to: dayKey, userId: person.userId }).subscribe({
      next: (res) => this.detailRows.set(res.data?.rows ?? []),
      error: () => this.detailRows.set([]),
    });
  }

  // ── Helpers de presentación ──
  sitMeta(s: string) { return SIT_META[s] ?? { label: s, severity: 'secondary' as const }; }
  shiftLabel(s: string): string { return SHIFT_LABEL[s] ?? s; }
  sourceLabel(s: string | null): string {
    return s === 'BIOMETRIC' ? 'Huella' : s === 'MANUAL' ? 'Manual' : s === 'MIXED' ? 'Huella + manual' : '—';
  }
  puntLabel(r: DailyRow): string {
    if (r.puntualidad.kind === 'PUNTUAL') return 'Puntual';
    if (r.puntualidad.kind === 'TARDE') return `+${r.puntualidad.lateMinutes} min (referencia)`;
    if (r.puntualidad.kind === 'PENDIENTE') return 'Pendiente';
    return 'Sin calcular';
  }
  dayTip(cell: string): string {
    return cell === 'PRESENTE' ? 'Asistencia' : cell === 'TARDE' ? 'Entrada tarde (ref.)' : 'Sin entrada';
  }

  // ── Exportación ──
  private employerHeader(): string[][] {
    const b = this.auth.activeBranch();
    const { from, to } = this.range();
    const periodo = this.tab() === 'monthly'
      ? `${this.anchor.getFullYear()}-${String(this.anchor.getMonth() + 1).padStart(2, '0')}`
      : from === to ? from : `${from} a ${to}`;
    return [
      ['Reporte', this.tab() === 'monthly' ? 'Resumen mensual de asistencias' : 'Control diario de asistencias'],
      ['Empleador', b?.name ?? '—'],
      ['RUC', b?.taxId ?? '—'],
      ['Período', periodo],
      ['Generado', new Date().toLocaleString('es-PE')],
    ];
  }

  private dailyExportRows(rows: DailyRow[]): (string | number)[][] {
    const fmt = (iso: string | null): string => iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    return rows.map((r) => [
      r.businessDate,
      r.userName,
      '—', // Documento (DNI aún no disponible en Edición Trabajador)
      r.roleName,
      r.reference ? `${r.reference.start}-${r.reference.end} (${this.shiftLabel(r.reference.shift)})` : 'Sin horario confirmado',
      fmt(r.entradaAt),
      fmt(r.salidaAt) + (r.salidaNextDay ? ' (+1 día)' : ''),
      this.sitMeta(r.situacion).label,
      this.puntLabel(r),
      (r.isRegularization ? 'Regularización. ' : '') + (r.note ?? ''),
    ]);
  }

  private dailyExportCols(): XlsxColumn[] {
    return [
      { header: 'Fecha', width: 12 }, { header: 'Trabajador', width: 24 }, { header: 'Documento', width: 14 }, { header: 'Rol', width: 16 },
      { header: 'Turno de referencia', width: 22 }, { header: 'Entrada', width: 16 }, { header: 'Salida', width: 18 },
      { header: 'Situación', width: 20 }, { header: 'Puntualidad', width: 18 }, { header: 'Referencia / Nota', width: 30 },
    ];
  }

  exportExcel(): void {
    this.exporting.set(true);
    const infoCols: XlsxColumn[] = [{ header: 'Campo', width: 16 }, { header: 'Valor', width: 40 }];
    const info = this.employerHeader();
    if (this.tab() === 'monthly') {
      const month = `${this.anchor.getFullYear()}-${String(this.anchor.getMonth() + 1).padStart(2, '0')}`;
      const m = this.monthly();
      const resumenCols: XlsxColumn[] = [
        { header: 'Trabajador', width: 24 }, { header: 'Documento', width: 14 }, { header: 'Rol', width: 16 },
        { header: 'Jornadas', width: 10 }, { header: 'Asistencias', width: 12 }, { header: 'Tarde (ref.)', width: 12 },
        { header: 'Min. tarde (ref.)', width: 14 }, { header: 'Pendientes', width: 12 }, { header: 'Descansos', width: 12 }, { header: 'Faltas conf.', width: 12 },
      ];
      const resumen = (m?.people ?? []).map((p) => [p.userName, '—', p.roleName, p.totals.jornadas, p.totals.asistencias, p.totals.tardanzasRef, p.totals.minutosTardeRef, p.totals.marcasPendientes, 'n/d', 'n/d']);
      // Detalle diario: todas las jornadas del mes con los filtros activos.
      this.hr.dailyReport({ from: `${month}-01`, to: `${month}-${String(m?.daysInMonth ?? 28).padStart(2, '0')}`, role: this.fRole ?? undefined, userId: this.fUserId ?? undefined, search: this.fSearch.trim() || undefined }).subscribe({
        next: (res) => {
          const detalle = this.dailyExportRows(res.data?.rows ?? []);
          downloadXlsxMultiSheet(`Asistencias_${month}`, [
            { sheetName: 'Reporte', columns: infoCols, rows: info },
            { sheetName: 'Resumen', columns: resumenCols, rows: resumen },
            { sheetName: 'Detalle diario', columns: this.dailyExportCols(), rows: detalle },
          ]).finally(() => this.exporting.set(false));
        },
        error: () => this.exporting.set(false),
      });
    } else {
      const rows = this.dailyExportRows(this.filteredDaily());
      downloadXlsxMultiSheet('Asistencias_control_diario', [
        { sheetName: 'Reporte', columns: infoCols, rows: info },
        { sheetName: 'Control diario', columns: this.dailyExportCols(), rows },
      ]).finally(() => this.exporting.set(false));
    }
  }

  exportPdf(): void {
    const info = this.employerHeader();
    const metaHtml = `<div class="cards">${info.map(([k, v]) => `<div class="kpi"><div class="l">${k}</div><div class="v" style="font-size:12px">${v}</div></div>`).join('')}</div>`;
    if (this.tab() === 'monthly') {
      const m = this.monthly();
      const resumen = `<h2>Resumen por trabajador</h2><table><thead><tr><th>Trabajador</th><th>Documento</th><th>Rol</th><th class="num">Jornadas</th><th class="num">Asist.</th><th class="num">Tarde (ref.)</th><th class="num">Min. tarde</th><th class="num">Pend.</th></tr></thead><tbody>${(m?.people ?? []).map((p) => `<tr><td>${p.userName}</td><td>—</td><td>${p.roleName}</td><td class="num">${p.totals.jornadas}</td><td class="num">${p.totals.asistencias}</td><td class="num">${p.totals.tardanzasRef}</td><td class="num">${p.totals.minutosTardeRef}</td><td class="num">${p.totals.marcasPendientes}</td></tr>`).join('')}</tbody></table>`;
      const month = `${this.anchor.getFullYear()}-${String(this.anchor.getMonth() + 1).padStart(2, '0')}`;
      this.hr.dailyReport({ from: `${month}-01`, to: `${month}-${String(m?.daysInMonth ?? 28).padStart(2, '0')}`, role: this.fRole ?? undefined, userId: this.fUserId ?? undefined, search: this.fSearch.trim() || undefined }).subscribe({
        next: (res) => {
          const detalle = this.dailyDetailHtml(res.data?.rows ?? []);
          printPdf('Resumen mensual de asistencias', metaHtml + resumen + '<h2>Detalle diario</h2>' + detalle);
        },
        error: () => printPdf('Resumen mensual de asistencias', metaHtml + resumen),
      });
    } else {
      printPdf('Control diario de asistencias', metaHtml + this.dailyDetailHtml(this.filteredDaily()));
    }
  }

  private dailyDetailHtml(rows: DailyRow[]): string {
    const fmt = (iso: string | null): string => iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const body = rows.map((r) => `<tr><td>${r.businessDate}</td><td>${r.userName}</td><td>${r.roleName}</td><td>${r.reference ? `${r.reference.start}-${r.reference.end}` : 'Sin horario'}</td><td>${fmt(r.entradaAt)}</td><td>${fmt(r.salidaAt)}${r.salidaNextDay ? ' (+1d)' : ''}</td><td>${this.sitMeta(r.situacion).label}</td><td>${this.puntLabel(r)}</td></tr>`).join('');
    return `<table><thead><tr><th>Fecha</th><th>Trabajador</th><th>Rol</th><th>Turno ref.</th><th>Entrada</th><th>Salida</th><th>Situación</th><th>Puntualidad</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  // ── Registrar marca ──
  openNew(): void {
    this.form = { userId: null, type: 'IN', note: '' };
    this.dialogVisible = true;
  }
  save(): void {
    if (!this.form.userId) {
      this.messages.add({ severity: 'warn', summary: 'Falta usuario', detail: 'Selecciona el usuario.' });
      return;
    }
    this.saving.set(true);
    this.hr.createAttendance({ userId: this.form.userId, type: this.form.type, note: this.form.note || undefined }).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Registrada', detail: 'Marca registrada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar.' });
      },
    });
  }
}
