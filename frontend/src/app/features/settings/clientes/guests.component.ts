import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { DocumentType, Guest } from '../catalogs/catalog.models';
import { DOCUMENT_TYPE_OPTIONS, STATUS_OPTIONS } from '../catalogs/catalog.constants';
import { downloadCsv } from '../../../core/utils/export';

interface GuestRow {
  id: string; documentType: string; documentNumber: string; firstName: string; lastName: string | null;
  phone: string | null; email: string | null; nationality: string | null; status: string;
  reservas: number; gastoTotal: number; promedio: number; points: number; lastStay: string | null;
  blacklisted: boolean; blacklistReason: string | null; blacklistedAt: string | null; blacklistedBy: string | null;
}
interface Stats { totalClientes: number; puntosDistribuidos: number; ingresosTotales: number; promedioPorCliente: number; activosMes: number; }
interface BlacklistRow { id: string; documentNumber: string; firstName: string; lastName: string | null; reason: string | null; at: string | null; by: string | null; }
interface Form { id?: string; documentType: DocumentType; documentNumber: string; firstName: string; lastName: string; phone: string; email: string; notes: string; status: 'active' | 'inactive'; }
const EMPTY: Form = { documentType: 'DNI', documentNumber: '', firstName: '', lastName: '', phone: '', email: '', notes: '', status: 'active' };

@Component({
  selector: 'app-guests',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section class="wrap">
      <header class="head">
        <div><h1><i class="pi pi-users"></i> Clientes</h1><p class="muted">Gestiona tu base de clientes y sistema de lealtad</p></div>
        <div class="hactions">
          <p-button label="Ver Lista Negra" icon="pi pi-ban" severity="danger" [outlined]="true" (onClick)="openBlacklist()" />
          @if (canExport) { <p-button label="Exportar Excel" icon="pi pi-file-excel" severity="secondary" (onClick)="exportXlsx()" /> }
          @if (canCreate) { <p-button label="Nuevo cliente" icon="pi pi-plus" (onClick)="openNew()" /> }
        </div>
      </header>

      <!-- Cards -->
      <div class="cards">
        <div class="card"><div class="ci"><span>Total Clientes</span><i class="pi pi-users"></i></div><div class="cv">{{ stats()?.totalClientes ?? 0 | number }}</div><div class="cf">{{ stats()?.activosMes ?? 0 }} activos este mes</div></div>
        <div class="card"><div class="ci"><span>Puntos Distribuidos</span><i class="pi pi-sparkles"></i></div><div class="cv gr">{{ stats()?.puntosDistribuidos ?? 0 | number }}</div><div class="cf">Puntos de lealtad</div></div>
        <div class="card"><div class="ci"><span>Ingresos Totales</span><i class="pi pi-dollar"></i></div><div class="cv">S/ {{ stats()?.ingresosTotales ?? 0 | number: '1.2-2' }}</div><div class="cf">De todos los clientes</div></div>
        <div class="card"><div class="ci"><span>Promedio por Cliente</span><i class="pi pi-chart-line"></i></div><div class="cv">S/ {{ stats()?.promedioPorCliente ?? 0 | number: '1.2-2' }}</div><div class="cf">Gasto promedio</div></div>
      </div>

      <!-- Filtros -->
      <div class="panel filters">
        <h3>Filtros y Búsqueda</h3>
        <div class="frow">
          <div class="fcol"><label>Buscar</label><input pInputText placeholder="Nombre, DNI, celular, nacionalidad…" [(ngModel)]="search" (ngModelChange)="onSearchChange()" (keyup.enter)="reload()" /></div>
          <div class="fcol"><label>Ordenar por</label><p-select [options]="sortOpts" optionLabel="label" optionValue="value" [(ngModel)]="sortBy" (onChange)="reload()" appendTo="body" styleClass="w" /></div>
          <div class="fcol"><label>Orden</label><p-select [options]="orderOpts" optionLabel="label" optionValue="value" [(ngModel)]="sortDir" (onChange)="reload()" appendTo="body" styleClass="w" /></div>
          <div class="fcol end"><p-button label="Limpiar Filtros" severity="secondary" icon="pi pi-filter-slash" (onClick)="clearFilters()" /></div>
        </div>
      </div>

      <!-- Tabla -->
      <div class="panel">
        <div class="ph"><h3>Lista de Clientes</h3><span class="muted sm">{{ total() | number }} cliente(s) registrado(s)</span></div>
        <p-table [value]="items()" [loading]="loading()" [lazy]="true" [paginator]="true" [rows]="pageSize" [totalRecords]="total()"
                 (onLazyLoad)="onLazy($event)" [rowsPerPageOptions]="[10, 20, 50]" styleClass="p-datatable-sm gt">
          <ng-template pTemplate="header">
            <tr>
              <th>Cliente</th><th>Documento</th><th>Celular</th><th>Nacionalidad</th>
              <th class="c">Puntos</th><th class="c">Reservas</th><th>Gasto Total</th><th>Última Estancia</th><th class="c">Estado</th><th class="c">Acciones</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr>
              <td><div class="cli"><strong>{{ r.firstName }} {{ r.lastName }}</strong><span class="sub">DNI: {{ r.documentNumber }}{{ r.phone ? ' · ' + r.phone : '' }}</span></div></td>
              <td>{{ r.documentType }} {{ r.documentNumber }}</td>
              <td>{{ r.phone || '—' }}</td>
              <td>{{ r.nationality || '—' }}</td>
              <td class="c mono">{{ r.points | number }}</td>
              <td class="c">{{ r.reservas }}</td>
              <td><strong>S/ {{ r.gastoTotal | number: '1.2-2' }}</strong>@if (r.reservas > 0) { <span class="sub">Promedio: S/ {{ r.promedio | number: '1.2-2' }}</span> }</td>
              <td>{{ r.lastStay ? (r.lastStay | date: 'd/M/y') : '—' }}</td>
              <td class="c">
                @if (r.blacklisted) { <p-tag value="Bloqueado" severity="danger" /> }
                @else { <p-tag [value]="r.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="r.status === 'active' ? 'success' : 'secondary'" /> }
              </td>
              <td class="c nowrap">
                <button class="ic" (click)="openDetails(r)" title="Ver detalles"><i class="pi pi-eye"></i></button>
                @if (canEdit) { <button class="ic" (click)="openEdit(r)" title="Editar"><i class="pi pi-pencil"></i></button> }
                @if (canBlacklistAdd && !r.blacklisted) { <button class="ic ban" (click)="openAddBlacklist(r)" title="Agregar a Lista Negra"><i class="pi pi-ban"></i></button> }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="10" class="muted center">Sin clientes.</td></tr></ng-template>
        </p-table>
      </div>
    </section>

    <!-- Ver detalles -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '96vw' }" header="Detalle del cliente">
      @if (detail(); as d) {
        <div class="det">
          <div class="dname">{{ d.firstName }} {{ d.lastName }}</div>
          <div class="dgrid">
            <div><span>Documento</span><strong>{{ d.documentType }} {{ d.documentNumber }}</strong></div>
            <div><span>Celular</span><strong>{{ d.phone || '—' }}</strong></div>
            <div><span>Email</span><strong>{{ d.email || '—' }}</strong></div>
            <div><span>Nacionalidad</span><strong>{{ d.nationality || '—' }}</strong></div>
            <div><span>Reservas</span><strong>{{ d.reservas }}</strong></div>
            <div><span>Última estancia</span><strong>{{ d.lastStay ? (d.lastStay | date: 'd/M/y') : '—' }}</strong></div>
            <div><span>Gasto total</span><strong>S/ {{ d.gastoTotal | number: '1.2-2' }}</strong></div>
            <div><span>Promedio</span><strong>S/ {{ d.promedio | number: '1.2-2' }}</strong></div>
            <div><span>Puntos</span><strong>{{ d.points | number }}</strong></div>
            <div><span>Estado</span><strong>{{ d.blacklisted ? 'Bloqueado' : (d.status === 'active' ? 'Activo' : 'Inactivo') }}</strong></div>
          </div>
          @if (d.blacklisted) { <div class="dban"><i class="pi pi-ban"></i> <div><strong>En Lista Negra</strong><span>{{ d.blacklistReason }}</span><span class="sub">Bloqueado {{ d.blacklistedAt ? (d.blacklistedAt | date: 'd/M/y') : '' }}{{ d.blacklistedBy ? ' · ' + d.blacklistedBy : '' }}</span></div></div> }
        </div>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="detailVisible = false" /></ng-template>
    </p-dialog>

    <!-- Agregar a Lista Negra -->
    <p-dialog [(visible)]="banVisible" [modal]="true" [style]="{ width: '30rem', maxWidth: '96vw' }" header="🚫 Agregar a Lista Negra">
      <p class="muted sm">El cliente no podrá registrarse en ninguna habitación.</p>
      @if (banTarget(); as t) { <div class="banwho"><strong>{{ t.firstName }} {{ t.lastName }}</strong><span>DNI: {{ t.documentNumber }}</span></div> }
      <div class="form">
        <label>Motivo del bloqueo *</label>
        <textarea [(ngModel)]="banReason" rows="4" placeholder="Ej: Daño a propiedad del hotel, comportamiento inapropiado, incumplimiento de normas, etc."></textarea>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" icon="pi pi-times" (onClick)="banVisible = false" />
        <p-button label="Agregar a Lista Negra" icon="pi pi-ban" severity="danger" [loading]="saving()" (onClick)="doAddBlacklist()" />
      </ng-template>
    </p-dialog>

    <!-- Ver Lista Negra -->
    <p-dialog [(visible)]="blacklistVisible" [modal]="true" [style]="{ width: '42rem', maxWidth: '96vw' }" header="🚫 Lista Negra de Clientes">
      <p class="muted sm">Clientes que tienen prohibido el acceso al hotel.</p>
      @if (blacklist().length === 0) { <p class="muted center" style="padding:1.5rem">No hay clientes en la lista negra.</p> }
      @for (b of blacklist(); track b.id) {
        <div class="blrow">
          <div><strong>{{ b.firstName }} {{ b.lastName }}</strong>
            <span class="sub">DNI: {{ b.documentNumber }}</span>
            <span class="bmot"><i class="pi pi-exclamation-triangle"></i> {{ b.reason }}</span>
            <span class="sub">Bloqueado: {{ b.at ? (b.at | date: 'd/M/y') : '—' }}{{ b.by ? ' · ' + b.by : '' }}</span>
          </div>
          @if (canUnblacklist) { <p-button label="Quitar" icon="pi pi-check-circle" severity="success" [outlined]="true" size="small" [loading]="saving()" (onClick)="doRemoveBlacklist(b)" /> }
        </div>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="blacklistVisible = false" /></ng-template>
    </p-dialog>

    <!-- Crear / Editar (admin) -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '520px' }" [header]="form.id ? 'Editar cliente' : 'Nuevo cliente'">
      <div class="form g2">
        <div><label>Tipo de documento</label><p-select [options]="docTypes" optionLabel="label" optionValue="value" [(ngModel)]="form.documentType" appendTo="body" styleClass="w" /></div>
        <div><label>Número</label><input pInputText [(ngModel)]="form.documentNumber" /></div>
        <div><label>Nombres</label><input pInputText [(ngModel)]="form.firstName" /></div>
        <div><label>Apellidos</label><input pInputText [(ngModel)]="form.lastName" /></div>
        <div><label>Teléfono</label><input pInputText [(ngModel)]="form.phone" /></div>
        <div><label>Email</label><input pInputText type="email" [(ngModel)]="form.email" /></div>
        <div class="span2"><label>Notas</label><input pInputText [(ngModel)]="form.notes" /></div>
        <div><label>Estado</label><p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" appendTo="body" styleClass="w" /></div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .wrap { padding: 1.25rem; max-width: 1280px; }
      .muted { color: var(--p-text-muted-color, #94a3b8); } .sm { font-size: 0.82rem; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      .head h1 { margin: 0; font-size: 1.4rem; display: inline-flex; align-items: center; gap: 0.5rem; } .head p { margin: 0.2rem 0 0; }
      .hactions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; margin-bottom: 1rem; }
      .card { background: var(--p-content-background, #1e293b); border: 1px solid var(--p-content-border-color, #334155); border-radius: 12px; padding: 1rem 1.1rem; }
      .card .ci { display: flex; justify-content: space-between; align-items: center; color: var(--p-text-muted-color, #94a3b8); font-size: 0.82rem; } .card .ci i { opacity: 0.7; }
      .card .cv { font-size: 1.7rem; font-weight: 800; margin: 0.2rem 0; } .card .cv.gr { color: #10b981; }
      .card .cf { font-size: 0.76rem; color: var(--p-text-muted-color, #94a3b8); }
      .panel { background: var(--p-content-background, #1e293b); border: 1px solid var(--p-content-border-color, #334155); border-radius: 12px; padding: 1rem 1.1rem; margin-bottom: 1rem; }
      .panel h3 { margin: 0 0 0.7rem; font-size: 1rem; } .ph { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem; } .ph h3 { margin: 0; }
      .filters .frow { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.8rem; align-items: end; }
      .fcol { display: flex; flex-direction: column; gap: 0.3rem; } .fcol label { font-size: 0.78rem; color: var(--p-text-muted-color, #94a3b8); } .fcol.end { align-self: end; }
      .cli { display: flex; flex-direction: column; } .cli .sub, .sub { font-size: 0.74rem; color: var(--p-text-muted-color, #94a3b8); display: block; }
      .mono { font-family: monospace; } .c { text-align: center; } .nowrap { white-space: nowrap; }
      .ic { background: none; border: 0; cursor: pointer; color: var(--p-text-muted-color, #94a3b8); padding: 0 0.35rem; font-size: 1rem; } .ic:hover { color: var(--p-primary-color, #3b82f6); } .ic.ban:hover { color: #ef4444; }
      .center { text-align: center; }
      .form { display: flex; flex-direction: column; gap: 0.35rem; } .form label { font-size: 0.82rem; color: var(--p-text-muted-color, #94a3b8); margin-top: 0.4rem; }
      .form textarea { resize: vertical; font: inherit; padding: 0.6rem 0.7rem; border-radius: 8px; border: 1px solid var(--p-content-border-color, #334155); background: var(--p-content-background, #0f172a); color: inherit; }
      .form.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 0.8rem; } .form.g2 .span2 { grid-column: 1 / -1; } .form.g2 label { margin-top: 0; }
      .banwho { background: var(--p-content-border-color, #334155); border-radius: 8px; padding: 0.7rem 0.9rem; margin: 0.5rem 0; } .banwho strong { display: block; }
      .det .dname { font-size: 1.15rem; font-weight: 700; margin-bottom: 0.6rem; }
      .dgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem 1rem; } .dgrid > div { display: flex; flex-direction: column; } .dgrid span { font-size: 0.74rem; color: var(--p-text-muted-color, #94a3b8); }
      .dban { display: flex; gap: 0.6rem; align-items: flex-start; margin-top: 0.9rem; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 0.7rem; color: #ef4444; } .dban span { display: block; color: inherit; }
      .blrow { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; padding: 0.8rem 1rem; margin-bottom: 0.6rem; }
      .blrow strong { display: block; color: #ef4444; } .bmot { display: block; font-size: 0.8rem; margin: 0.2rem 0; }
      :host ::ng-deep .w, :host ::ng-deep .form input[pInputText], :host ::ng-deep .form .p-select { width: 100%; }
      :host ::ng-deep .gt .p-datatable-tbody > tr > td { font-size: 0.85rem; }
      @media (max-width: 820px) { .filters .frow { grid-template-columns: 1fr; } .form.g2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class GuestsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly api = inject(CatalogApiService).guests;
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

  readonly items = signal<GuestRow[]>([]);
  readonly total = signal(0);
  readonly stats = signal<Stats | null>(null);
  readonly blacklist = signal<BlacklistRow[]>([]);
  readonly detail = signal<GuestRow | null>(null);
  readonly banTarget = signal<GuestRow | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;
  readonly docTypes = DOCUMENT_TYPE_OPTIONS;

  search = '';
  sortBy = 'spend';
  sortDir: 'asc' | 'desc' = 'desc';
  pageSize = 20;
  private firstRow = 0;

  detailVisible = false;
  banVisible = false; banReason = '';
  blacklistVisible = false;
  dialogVisible = false;
  form: Form = { ...EMPTY };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canExport = this.auth.can('settings', 'view');
  readonly canBlacklistAdd = this.auth.can('operations', 'edit') || this.auth.can('settings', 'edit');
  readonly canUnblacklist = this.auth.can('settings', 'edit');

  readonly sortOpts = [
    { label: 'Gasto Total', value: 'spend' }, { label: 'Nombre', value: 'name' },
    { label: 'Última estancia', value: 'lastStay' }, { label: 'Reservas', value: 'reservations' }, { label: 'Puntos', value: 'points' },
  ];
  readonly orderOpts = [
    { label: 'Mayor a Menor', value: 'desc' }, { label: 'Menor a Mayor', value: 'asc' },
    { label: 'A - Z', value: 'asc' }, { label: 'Z - A', value: 'desc' },
  ];

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void { this.loadStats(); }

  loadStats(): void {
    this.http.get<ApiResponse<Stats>>(`${this.apiUrl}/guests/stats`).subscribe((r) => this.stats.set(r.data ?? null));
  }

  onLazy(ev: { first?: number; rows?: number | null }): void {
    this.firstRow = ev.first ?? 0;
    this.pageSize = ev.rows ?? 20;
    this.reload();
  }
  onSearchChange(): void { if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.firstRow = 0; this.reload(); }, 350); }
  clearFilters(): void { this.search = ''; this.sortBy = 'spend'; this.sortDir = 'desc'; this.firstRow = 0; this.reload(); }

  reload(): void {
    this.loading.set(true);
    const page = Math.floor(this.firstRow / this.pageSize) + 1;
    const params: Record<string, string> = { page: String(page), pageSize: String(this.pageSize), sortBy: this.sortBy, sortDir: this.sortDir };
    if (this.search) params['search'] = this.search;
    this.http.get<ApiResponse<GuestRow[]>>(`${this.apiUrl}/guests`, { params }).subscribe({
      next: (r) => { this.items.set(r.data ?? []); this.total.set(r.meta?.total ?? (r.data?.length ?? 0)); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openDetails(r: GuestRow): void { this.detail.set(r); this.detailVisible = true; }

  // ── Lista Negra ──
  openBlacklist(): void {
    this.blacklistVisible = true;
    this.http.get<ApiResponse<BlacklistRow[]>>(`${this.apiUrl}/guests/blacklist`).subscribe((r) => this.blacklist.set(r.data ?? []));
  }
  openAddBlacklist(r: GuestRow): void { this.banTarget.set(r); this.banReason = ''; this.banVisible = true; }
  doAddBlacklist(): void {
    const t = this.banTarget();
    if (!t) return;
    if (this.banReason.trim().length < 3) { this.toast.add({ severity: 'warn', summary: 'Motivo', detail: 'Indica el motivo del bloqueo.' }); return; }
    this.saving.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.apiUrl}/guests/${t.id}/blacklist`, { reason: this.banReason.trim() }).subscribe({
      next: () => { this.saving.set(false); this.banVisible = false; this.toast.add({ severity: 'success', summary: 'Bloqueado', detail: 'Cliente agregado a Lista Negra.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo bloquear.' }); },
    });
  }
  doRemoveBlacklist(b: BlacklistRow): void {
    this.saving.set(true);
    this.http.request<ApiResponse<unknown>>('delete', `${this.apiUrl}/guests/${b.id}/blacklist`).subscribe({
      next: () => { this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Desbloqueado', detail: '' }); this.blacklist.set(this.blacklist().filter((x) => x.id !== b.id)); this.reload(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo quitar.' }); },
    });
  }

  // ── Exportar (admin) ──
  exportXlsx(): void {
    this.http.get<ApiResponse<GuestRow[]>>(`${this.apiUrl}/guests/export`, { params: { sortBy: this.sortBy, sortDir: this.sortDir } }).subscribe({
      next: (r) => {
        const rows = (r.data ?? []).map((g) => [
          `${g.documentType} ${g.documentNumber}`, `${g.firstName} ${g.lastName ?? ''}`.trim(), g.phone ?? '', g.nationality ?? '',
          g.points, g.reservas, g.gastoTotal.toFixed(2), g.lastStay ? new Date(g.lastStay).toLocaleDateString('es-PE') : '',
          g.blacklisted ? 'Bloqueado' : (g.status === 'active' ? 'Activo' : 'Inactivo'),
        ]);
        downloadCsv(`clientes-${new Date().toISOString().slice(0, 10)}`, ['Documento', 'Nombre', 'Celular', 'Nacionalidad', 'Puntos', 'Reservas', 'Gasto Total', 'Última Estancia', 'Estado'], rows);
      },
      error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo exportar.' }),
    });
  }

  // ── Crear / Editar (admin) ──
  openNew(): void { this.form = { ...EMPTY }; this.dialogVisible = true; }
  openEdit(r: GuestRow): void {
    this.form = { id: r.id, documentType: r.documentType as DocumentType, documentNumber: r.documentNumber, firstName: r.firstName, lastName: r.lastName ?? '', phone: r.phone ?? '', email: r.email ?? '', notes: '', status: r.status as 'active' | 'inactive' };
    this.dialogVisible = true;
  }
  save(): void {
    const { id, ...dto } = this.form;
    this.saving.set(true);
    const req$ = id ? this.api.update(id, dto as Partial<Guest>) : this.api.create(dto as Partial<Guest>);
    req$.subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Cliente guardado.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
}
