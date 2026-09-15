import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { printPdf, downloadXlsxTable } from '../../../core/utils/export';
import { HrApiService, type ActivityLog } from '../services/hr-api.service';

// Etiquetas legibles (sin códigos técnicos en la vista).
const AREA_LABEL: Record<string, string> = {
  HOSPEDAJE: 'Hospedaje', VENTAS: 'Ventas', CAJA: 'Caja', INVENTARIO: 'Inventario', LIMPIEZA: 'Limpieza',
  INSPECCION: 'Inspección', RESERVAS: 'Reservas', WIFI: 'Wi-Fi', FRIGOBAR: 'Frigobar', MANTENIMIENTO: 'Mantenimiento',
  USUARIOS: 'Usuarios', PERMISOS: 'Permisos', AUTORIZACIONES: 'Autorizaciones', PRECIOS: 'Precios', SESION: 'Sesión', TURNO: 'Turno', COMPROBANTES: 'Comprobantes', OBSERVACIONES: 'Observaciones',
};
const ACTIVITY_LABEL: Record<string, string> = {
  CHECK_IN: 'Check-in', CHECK_OUT: 'Check-out', RENEWAL: 'Renovación', DEBT_PAYMENT: 'Cobro de deuda', ROOM_CHANGE: 'Cambio de habitación',
  SALE: 'Venta', SALE_VOID: 'Anulación', SALE_CORRECTION: 'Corrección de venta',
  CASH_IN: 'Ingreso de caja', CASH_OUT: 'Egreso de caja', CASH_ADJUST: 'Ajuste de caja', CASH_OPEN: 'Apertura de caja', CASH_CLOSE: 'Cierre de caja',
  STOCK_TRANSFER: 'Transferencia de stock', SHIFT_OPEN: 'Inicio de turno', SHIFT_CLOSE: 'Cierre de turno',
  CLEANING: 'Limpieza', INSPECTION: 'Inspección',
  RESERVATION_CREATE: 'Reserva creada', RESERVATION_UPDATE: 'Reserva modificada', RESERVATION_CANCEL: 'Reserva cancelada',
  WIFI: 'Wi-Fi', FRIGOBAR: 'Frigobar', MAINTENANCE: 'Mantenimiento', INVENTORY_ADJUST: 'Ajuste de inventario',
  USER_CREATE: 'Usuario creado', USER_UPDATE: 'Usuario modificado', USER_DEACTIVATE: 'Usuario desactivado',
  USER_PASSWORD: 'Contraseña cambiada', USER_PASSWORD_RESET: 'Contraseña restablecida',
  PERMISSION_GRANT: 'Permiso concedido', PERMISSION_REVOKE: 'Permiso retirado', PERMISSION_EXPIRE: 'Permiso vencido',
  AUTH_REQUEST: 'Solicitud de autorización', AUTH_APPROVE: 'Autorización aprobada', AUTH_REJECT: 'Autorización rechazada',
  PRICE_CHANGE: 'Precio modificado', DISCOUNT: 'Descuento aplicado', COURTESY: 'Operación excepcional',
};
const SHIFT_LABEL: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', NOCHE: 'Noche', FUERA_DE_TURNO: 'Fuera de turno' };
const AREA_CLASS: Record<string, string> = {
  HOSPEDAJE: 'a-hosp', VENTAS: 'a-vent', CAJA: 'a-caja', INVENTARIO: 'a-inv', TURNO: 'a-turno',
  LIMPIEZA: 'a-limp', INSPECCION: 'a-insp', RESERVAS: 'a-resv', WIFI: 'a-wifi', FRIGOBAR: 'a-frig', MANTENIMIENTO: 'a-mant',
  USUARIOS: 'a-user', PERMISOS: 'a-perm', AUTORIZACIONES: 'a-auth', PRECIOS: 'a-prec',
};

const PAGE_SIZES = [
  { label: '100', value: 100 }, { label: '300', value: 300 }, { label: '500', value: 500 }, { label: 'Todos los filtrados', value: 0 },
];
const SHIFT_OPTS = [{ label: 'Mañana', value: 'MANANA' }, { label: 'Tarde', value: 'TARDE' }, { label: 'Noche', value: 'NOCHE' }, { label: 'Fuera de turno', value: 'FUERA_DE_TURNO' }];

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule, SelectModule, DatePickerModule],
  template: `
    <section class="al">
      <header class="al-head">
        <div><h1>Historial de Actividades</h1><p class="muted">Bitácora de auditoría: qué ocurrió, quién, dónde, en qué sucursal y turno.</p></div>
        <div class="al-actions">
          <button class="btn" (click)="today()"><i class="pi pi-calendar"></i> Hoy</button>
          <button class="btn" [disabled]="exporting()" (click)="exportPdf()"><i class="pi pi-file-pdf"></i> Exportar PDF</button>
          <button class="btn" [disabled]="exporting()" (click)="exportExcel()"><i class="pi pi-file-excel"></i> Exportar Excel</button>
        </div>
      </header>

      <div class="al-filters">
        <span class="f grow"><i class="pi pi-search"></i><input pInputText placeholder="Buscar: usuario, habitación, venta, producto, monto…" [(ngModel)]="f.search" (keyup.enter)="reload()" /></span>
        @if (branches().length > 1) {
          <p-select [options]="branchOpts()" optionLabel="label" optionValue="value" [(ngModel)]="f.branch" (onChange)="reload()" placeholder="Sucursal" styleClass="dk" />
        }
        <p-select [options]="userOpts()" optionLabel="label" optionValue="value" [(ngModel)]="f.userId" (onChange)="reload()" [filter]="true" filterBy="label" [showClear]="true" placeholder="Usuario" styleClass="dk" />
        <p-select [options]="areaOpts" optionLabel="label" optionValue="value" [(ngModel)]="f.area" (onChange)="reload()" [showClear]="true" placeholder="Área" styleClass="dk" />
        <p-select [options]="activityOpts" optionLabel="label" optionValue="value" [(ngModel)]="f.activity" (onChange)="reload()" [showClear]="true" placeholder="Actividad" styleClass="dk" />
        <span class="f"><i class="pi pi-home"></i><input pInputText placeholder="Habitación / Ref" [(ngModel)]="f.reference" (keyup.enter)="reload()" /></span>
        <p-select [options]="shiftOpts" optionLabel="label" optionValue="value" [(ngModel)]="f.shift" (onChange)="reload()" [showClear]="true" placeholder="Turno" styleClass="dk" />
        <p-datepicker [(ngModel)]="f.dateFrom" (onSelect)="reload()" dateFormat="dd/mm/yy" placeholder="Desde" appendTo="body" styleClass="dk" [showIcon]="true" />
        <p-datepicker [(ngModel)]="f.dateTo" (onSelect)="reload()" dateFormat="dd/mm/yy" placeholder="Hasta" appendTo="body" styleClass="dk" [showIcon]="true" />
        <button class="btn ghost" (click)="clear()"><i class="pi pi-filter-slash"></i> Limpiar</button>
      </div>

      <div class="al-bar">
        <span class="muted">{{ total() }} registro(s){{ f.pageSize ? ' · mostrando ' + items().length : '' }}</span>
        <span class="spacer"></span>
        <button class="lnk" (click)="toggleSort()"><i class="pi" [class.pi-sort-amount-down]="f.sortDir==='desc'" [class.pi-sort-amount-up]="f.sortDir==='asc'"></i> {{ f.sortDir === 'desc' ? 'Más reciente' : 'Más antiguo' }}</button>
        <span class="lbl">Por pantalla</span>
        <p-select [options]="pageSizes" optionLabel="label" optionValue="value" [(ngModel)]="f.pageSize" (onChange)="reload()" styleClass="dk sm" />
      </div>

      <div class="tablewrap">
        <table class="al-tbl">
          <thead>
            <tr>
              <th style="width:9.5rem">Fecha/Hora</th>
              <th style="width:11rem">Actividad</th>
              <th style="width:11rem">Habitación / Ref.</th>
              <th>Detalle</th>
              <th style="width:11rem">Usuario</th>
              <th style="width:7rem">Turno</th>
              <th style="width:8rem">Área</th>
              <th style="width:10rem">Sucursal</th>
              <th style="width:2.2rem"></th>
            </tr>
          </thead>
          <tbody>
            @for (r of items(); track r.id) {
              <tr class="al-row" [class.exp]="expanded() === r.id">
                <td class="mono">{{ r.createdAt | date: 'dd/MM/yy HH:mm:ss' }}</td>
                <td><span class="atag {{ areaClass(r.area) }}">{{ activityLabel(r.activity) }}</span></td>
                <td class="ref">{{ r.reference || '—' }}</td>
                <td class="det">{{ r.detail || '—' }}</td>
                <td>{{ r.userName || '—' }}</td>
                <td><span class="shift {{ shiftClass(r.shift) }}">{{ shiftLabel(r.shift) }}</span></td>
                <td class="muted">{{ areaLabel(r.area) }}</td>
                <td class="muted">{{ r.branchName || '—' }}</td>
                <td><button class="exp-btn" (click)="toggle(r.id)"><i class="pi" [class.pi-chevron-down]="expanded()!==r.id" [class.pi-chevron-up]="expanded()===r.id"></i></button></td>
              </tr>
              @if (expanded() === r.id) {
                <tr class="al-detail"><td colspan="9">
                  <div class="dgrid">
                    <div class="dk-item"><span>Actividad</span><b>{{ activityLabel(r.activity) }}</b></div>
                    <div class="dk-item"><span>Fecha / hora</span><b>{{ r.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}</b></div>
                    <div class="dk-item"><span>Usuario</span><b>{{ r.userName || '—' }}</b></div>
                    @if (r.authorizedByName) { <div class="dk-item"><span>Autorizado por</span><b>{{ r.authorizedByName }}</b></div> }
                    <div class="dk-item"><span>Sucursal</span><b>{{ r.branchName || '—' }}</b></div>
                    <div class="dk-item"><span>Turno</span><b>{{ shiftLabel(r.shift) }}</b></div>
                    @if (r.reference) { <div class="dk-item"><span>Referencia</span><b>{{ r.reference }}</b></div> }
                    @if (r.entityId) { <div class="dk-item"><span>ID de operación</span><b class="mono sm">{{ r.entityId }}</b></div> }
                    @for (m of metaEntries(r); track m.k) { <div class="dk-item"><span>{{ m.k }}</span><b>{{ m.v }}</b></div> }
                  </div>
                </td></tr>
              }
            } @empty { <tr><td colspan="9" class="muted center pad">Sin actividades para los filtros aplicados.</td></tr> }
          </tbody>
        </table>
        @if (loading()) { <div class="al-loading"><i class="pi pi-spin pi-spinner"></i> Cargando…</div> }
      </div>
    </section>
  `,
  styles: [
    `
      .al { display: flex; flex-direction: column; gap: 0.8rem; }
      .al-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
      .al-head h1 { margin: 0; } .muted { color: #8aa0bd; } .center { text-align: center; } .pad { padding: 1.4rem; }
      .al-head .muted { font-size: 0.85rem; margin: 0.2rem 0 0; }
      .al-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .btn { background: #131d2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.85rem; cursor: pointer; font-size: 0.83rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .btn:hover:not(:disabled) { border-color: #3b82f6; } .btn:disabled { opacity: 0.5; cursor: default; } .btn.ghost { background: transparent; }
      .al-filters { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; background: #0b1119; border: 1px solid #1c2a3a; border-radius: 10px; padding: 0.6rem; }
      .f { position: relative; display: inline-flex; align-items: center; } .f.grow { flex: 1 1 16rem; min-width: 14rem; }
      .f i { position: absolute; left: 0.6rem; color: #6b7a90; font-size: 0.8rem; }
      .f input { width: 100%; background: #131d2b; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.5rem 0.6rem 0.5rem 1.9rem; }
      :host ::ng-deep .dk .p-select, :host ::ng-deep .dk.p-datepicker input { background: #131d2b; border-color: #243245; color: #e6e9ef; min-width: 9.5rem; }
      :host ::ng-deep .dk.sm .p-select { min-width: 7rem; }
      .al-bar { display: flex; align-items: center; gap: 0.7rem; font-size: 0.82rem; } .al-bar .spacer { flex: 1; }
      .al-bar .lbl { color: #8aa0bd; } .lnk { background: none; border: 0; color: #60a5fa; cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.3rem; }
      .tablewrap { position: relative; border: 1px solid #1c2a3a; border-radius: 10px; overflow: auto; max-height: 66vh; }
      .al-tbl { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
      .al-tbl th { position: sticky; top: 0; background: #101a28; color: #9fb0c3; font-weight: 600; text-align: left; padding: 0.6rem 0.7rem; border-bottom: 1px solid #1c2a3a; white-space: nowrap; z-index: 1; }
      .al-tbl td { padding: 0.5rem 0.7rem; border-bottom: 1px solid #16202e; vertical-align: top; }
      .al-row:hover { background: #0f1a28; } .al-row.exp { background: #0f1a28; }
      .mono { font-variant-numeric: tabular-nums; white-space: nowrap; color: #cdd8e6; } .mono.sm { font-size: 0.74rem; }
      .ref { font-weight: 600; color: #e6edf5; } .det { color: #cdd8e6; }
      .atag { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; background: #1b2433; color: #cdd8e6; border: 1px solid #2b3a4f; }
      .atag.a-hosp { background: rgba(37,99,235,0.18); color: #93c5fd; border-color: rgba(37,99,235,0.4); }
      .atag.a-vent { background: rgba(16,185,129,0.16); color: #6ee7b7; border-color: rgba(16,185,129,0.4); }
      .atag.a-caja { background: rgba(245,158,11,0.16); color: #fcd34d; border-color: rgba(245,158,11,0.4); }
      .atag.a-inv { background: rgba(168,85,247,0.16); color: #d8b4fe; border-color: rgba(168,85,247,0.4); }
      .atag.a-turno { background: rgba(148,163,184,0.16); color: #cbd5e1; border-color: rgba(148,163,184,0.4); }
      .atag.a-limp { background: rgba(20,184,166,0.16); color: #5eead4; border-color: rgba(20,184,166,0.4); }
      .atag.a-insp { background: rgba(59,130,246,0.16); color: #93c5fd; border-color: rgba(59,130,246,0.4); }
      .atag.a-resv { background: rgba(236,72,153,0.16); color: #f9a8d4; border-color: rgba(236,72,153,0.4); }
      .atag.a-wifi { background: rgba(99,102,241,0.16); color: #a5b4fc; border-color: rgba(99,102,241,0.4); }
      .atag.a-frig { background: rgba(6,182,212,0.16); color: #67e8f9; border-color: rgba(6,182,212,0.4); }
      .atag.a-mant { background: rgba(234,88,12,0.16); color: #fdba74; border-color: rgba(234,88,12,0.4); }
      .atag.a-user { background: rgba(139,92,246,0.16); color: #c4b5fd; border-color: rgba(139,92,246,0.4); }
      .atag.a-perm { background: rgba(217,70,239,0.16); color: #f0abfc; border-color: rgba(217,70,239,0.4); }
      .atag.a-auth { background: rgba(245,158,11,0.16); color: #fcd34d; border-color: rgba(245,158,11,0.4); }
      .atag.a-prec { background: rgba(34,197,94,0.16); color: #86efac; border-color: rgba(34,197,94,0.4); }
      .shift { font-size: 0.72rem; padding: 0.1rem 0.45rem; border-radius: 6px; background: #1b2433; color: #9fb0c3; } .shift.out { background: rgba(180,35,35,0.14); color: #fca5a5; }
      .exp-btn { background: transparent; border: 0; color: #8aa0bd; cursor: pointer; }
      .al-detail td { background: #0b1119; border-bottom: 1px solid #1c2a3a; }
      .dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.5rem 1rem; padding: 0.3rem 0.2rem; }
      .dk-item { display: flex; flex-direction: column; gap: 0.1rem; } .dk-item span { font-size: 0.7rem; color: #8aa0bd; text-transform: uppercase; letter-spacing: 0.3px; } .dk-item b { color: #e6edf5; font-weight: 600; word-break: break-word; }
      .al-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: rgba(11,17,25,0.6); color: #cdd8e6; }
    `,
  ],
})
export class ActivityLogComponent implements OnInit {
  private readonly hr = inject(HrApiService);
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly items = signal<ActivityLog[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly expanded = signal<string | null>(null);
  readonly branches = signal<{ id: string; name: string }[]>([]);
  readonly users = signal<{ id: string; name: string }[]>([]);

  readonly pageSizes = PAGE_SIZES;
  readonly shiftOpts = SHIFT_OPTS;
  readonly areaOpts = Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label }));
  readonly activityOpts = Object.entries(ACTIVITY_LABEL).map(([value, label]) => ({ value, label }));

  f: { search: string; branch: string; userId: string | null; area: string | null; activity: string | null; reference: string; shift: string | null; dateFrom: Date | null; dateTo: Date | null; pageSize: number; sortDir: 'asc' | 'desc' } = {
    search: '', branch: 'all', userId: null, area: null, activity: null, reference: '', shift: null, dateFrom: null, dateTo: null, pageSize: 100, sortDir: 'desc',
  };

  ngOnInit(): void {
    this.http.get<ApiResponse<{ id: string; name: string }[]>>(`${this.api}/branches`, { params: { pageSize: '100' } }).subscribe((r) => this.branches.set(r.data ?? []));
    this.http.get<ApiResponse<{ id: string; name: string }[]>>(`${this.api}/users`, { params: { pageSize: '300' } }).subscribe((r) => this.users.set((r.data ?? []).map((u) => ({ id: u.id, name: u.name }))));
    this.reload();
  }

  branchOpts() { return [{ value: 'all', label: 'Todas las sucursales' }, ...this.branches().map((b) => ({ value: b.id, label: b.name }))]; }
  userOpts() { return this.users().map((u) => ({ value: u.id, label: u.name })); }

  areaLabel(a: string | null): string { return a ? (AREA_LABEL[a] ?? a) : '—'; }
  activityLabel(a: string | null): string { return a ? (ACTIVITY_LABEL[a] ?? a) : '—'; }
  shiftLabel(s: string | null): string { return s ? (SHIFT_LABEL[s] ?? s) : '—'; }
  areaClass(a: string | null): string { return a ? (AREA_CLASS[a] ?? '') : ''; }
  shiftClass(s: string | null): string { return s === 'FUERA_DE_TURNO' ? 'out' : ''; }

  /** Convierte el meta (JSON) en pares legibles para el desplegable, omitiendo ids técnicos. */
  metaEntries(r: ActivityLog): { k: string; v: string }[] {
    const m = r.meta;
    if (!m || typeof m !== 'object') return [];
    const SKIP = new Set(['saleId', 'stayId', 'sessionId']);
    const LABEL: Record<string, string> = {
      amount: 'Monto', total: 'Total', method: 'Método', methods: 'Métodos', concept: 'Concepto', reason: 'Motivo',
      room: 'Habitación', guest: 'Huésped', rate: 'Tarifa', price: 'Precio', paidNow: 'Pagado ahora', from: 'Origen', to: 'Destino',
      product: 'Producto', quantity: 'Cantidad', number: 'N°', counted: 'Contado', expected: 'Esperado', difference: 'Diferencia',
      lateCharge: 'Late check-out', mode: 'Modo', shift: 'Turno', before: 'Antes', after: 'Después', afterMethod: 'Método nuevo', swaps: 'Cambios', swapDelta: 'Ajuste', line: 'Línea', newTotal: 'Nuevo total', customer: 'Cliente',
    };
    const out: { k: string; v: string }[] = [];
    for (const [key, val] of Object.entries(m as Record<string, unknown>)) {
      if (SKIP.has(key) || val == null || val === '') continue;
      let v: string;
      if (Array.isArray(val)) v = val.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
      else if (typeof val === 'object') continue;
      else v = String(val);
      out.push({ k: LABEL[key] ?? key, v });
    }
    return out;
  }

  private params(pageSize?: number): Record<string, string | number | undefined> {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
    return {
      pageSize: pageSize ?? this.f.pageSize,
      sortDir: this.f.sortDir,
      search: this.f.search.trim() || undefined,
      branch: this.f.branch && this.f.branch !== 'all' ? this.f.branch : undefined,
      userId: this.f.userId || undefined,
      area: this.f.area || undefined,
      activity: this.f.activity || undefined,
      reference: this.f.reference.trim() || undefined,
      shift: this.f.shift || undefined,
      dateFrom: this.f.dateFrom ? startOfDay(this.f.dateFrom) : undefined,
      dateTo: this.f.dateTo ? endOfDay(this.f.dateTo) : undefined,
    };
  }

  reload(): void {
    this.loading.set(true);
    this.expanded.set(null);
    this.hr.listActivity(this.params()).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.total.set(res.meta?.total ?? (res.data?.length ?? 0)); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  toggle(id: string): void { this.expanded.set(this.expanded() === id ? null : id); }
  toggleSort(): void { this.f.sortDir = this.f.sortDir === 'desc' ? 'asc' : 'desc'; this.reload(); }

  today(): void {
    const now = new Date();
    this.f.dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.f.dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.reload();
  }

  clear(): void {
    this.f = { search: '', branch: 'all', userId: null, area: null, activity: null, reference: '', shift: null, dateFrom: null, dateTo: null, pageSize: 100, sortDir: 'desc' };
    this.reload();
  }

  /** Trae TODOS los registros que cumplen los filtros actuales (para exportar), no solo la página. */
  private fetchAll(cb: (rows: ActivityLog[]) => void): void {
    this.exporting.set(true);
    this.hr.listActivity(this.params(0)).subscribe({
      next: (res) => { this.exporting.set(false); cb(res.data ?? []); },
      error: () => this.exporting.set(false),
    });
  }

  private fmt(d: string): string {
    const dt = new Date(d); const p = (n: number) => String(n).padStart(2, '0');
    return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
  }
  private esc(s: string | null | undefined): string { return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  exportPdf(): void {
    this.fetchAll((rows) => {
      const body = `<table><thead><tr><th>Fecha/Hora</th><th>Actividad</th><th>Habitación / Ref.</th><th>Detalle</th><th>Usuario</th><th>Turno</th><th>Área</th><th>Sucursal</th></tr></thead><tbody>${
        rows.map((r) => `<tr><td>${this.fmt(r.createdAt)}</td><td>${this.esc(this.activityLabel(r.activity))}</td><td>${this.esc(r.reference)}</td><td>${this.esc(r.detail)}</td><td>${this.esc(r.userName)}</td><td>${this.esc(this.shiftLabel(r.shift))}</td><td>${this.esc(this.areaLabel(r.area))}</td><td>${this.esc(r.branchName)}</td></tr>`).join('')
      }</tbody></table>`;
      printPdf('Historial de Actividades', body);
    });
  }

  exportExcel(): void {
    this.fetchAll((rows) => {
      void downloadXlsxTable(
        `Historial_Actividades_${new Date().toISOString().slice(0, 10)}`,
        'Actividades',
        [
          { header: 'Fecha/Hora', width: 20 }, { header: 'Actividad', width: 18 }, { header: 'Habitación / Ref.', width: 20 },
          { header: 'Detalle', width: 50 }, { header: 'Usuario', width: 22 }, { header: 'Turno', width: 12 }, { header: 'Área', width: 14 }, { header: 'Sucursal', width: 20 },
        ],
        rows.map((r) => [this.fmt(r.createdAt), this.activityLabel(r.activity), r.reference ?? '', r.detail ?? '', r.userName ?? '', this.shiftLabel(r.shift), this.areaLabel(r.area), r.branchName ?? '']),
        'Actividades',
      );
    });
  }
}
