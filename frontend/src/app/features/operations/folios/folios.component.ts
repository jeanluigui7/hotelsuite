import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';

interface FolioRow {
  id: string;
  folioCode: string | null;
  reservationId: string | null;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  checkInAt: string;
  checkOutAt: string | null;
  priceAgreed: number | string;
  balanceDue: number | string | null;
  paid: number;
  billingStatus: 'FACTURADO' | 'PENDIENTE';
  room: { number: string | null } | null;
  guest: { firstName: string; lastName: string | null; documentNumber: string; phone: string | null } | null;
}
interface FolioDetail {
  folio: { code: string; status: string };
  guest: { name: string; documentNumber: string; phone: string | null };
  room: { number: string; typeName: string };
  checkInAt: string;
  plannedCheckoutAt: string;
  durationMinutes: number;
  amounts: { habitacion: number; renovaciones: number; consumos: number; total: number; paid: number };
  movements: { at: string; type: string; description: string; charge: number; payment: number; balance: number; by: string }[];
  products: { name: string; quantity: number; amount: number; at: string; paid: boolean }[];
}
interface RoomOpt { id: string; number: string }

const STATUS_LABEL: Record<string, string> = { OPEN: 'Activa', CLOSED: 'Cerrada', CANCELLED: 'Anulada' };

@Component({
  selector: 'app-folios',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, DialogModule, SelectModule],
  template: `
    <section class="wrap">
      <header class="top">
        <div><h1>Folios de Estancia</h1><p class="muted">Cada ocupación tiene un folio que permanece disponible después del check-out.</p></div>
      </header>

      <div class="filters">
        <div class="f wide"><label>Búsqueda (folio, nombre o documento)</label><input [(ngModel)]="fQ" (keyup.enter)="reload()" placeholder="Ej. FE-00042, Juan Pérez, 40123456" /></div>
        <div class="f"><label>Folio</label><input [(ngModel)]="fFolio" (keyup.enter)="reload()" placeholder="FE-00042" /></div>
        <div class="f"><label>DNI / RUC</label><input [(ngModel)]="fDoc" (keyup.enter)="reload()" placeholder="Documento" /></div>
        <div class="f"><label>Habitación</label><p-select [options]="roomOpts()" optionLabel="label" optionValue="value" [(ngModel)]="fRoom" (onChange)="reload()" styleClass="w" /></div>
        <div class="f"><label>Estado</label><p-select [options]="statusOpts" optionLabel="label" optionValue="value" [(ngModel)]="fStatus" (onChange)="reload()" styleClass="w" /></div>
        <div class="f"><label>Ingreso desde</label><input type="date" [(ngModel)]="fFrom" (change)="reload()" /></div>
        <div class="f"><label>Ingreso hasta</label><input type="date" [(ngModel)]="fTo" (change)="reload()" /></div>
      </div>
      <div class="acts">
        <button class="btn p" (click)="reload()"><i class="pi pi-search"></i> Buscar</button>
        <button class="btn s" (click)="clear()"><i class="pi pi-refresh"></i> Limpiar</button>
        <span class="count">{{ total() }} folio(s)</span>
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th>Folio</th><th>Huésped</th><th>Documento</th><th class="c">Hab.</th><th>Check-in</th><th>Check-out</th>
              <th class="c">Estado</th>@if (canSeeAmounts()) { <th class="r">Pagado</th> }<th class="c">Facturación</th><th class="c">Acción</th>
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td><span class="folio">{{ r.folioCode || '—' }}</span></td>
                  <td>{{ guestName(r) }}</td>
                  <td>{{ r.guest?.documentNumber || '—' }}</td>
                  <td class="c">@if (r.room?.number) { <span class="room">{{ r.room?.number }}</span> } @else { — }</td>
                  <td>{{ r.checkInAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td>{{ r.checkOutAt ? (r.checkOutAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                  <td class="c"><span class="pill" [class.open]="r.status === 'OPEN'">{{ statusLabel(r.status) }}</span></td>
                  @if (canSeeAmounts()) { <td class="r money">S/ {{ +r.paid | number: '1.2-2' }}</td> }
                  <td class="c"><span class="bs" [class.fact]="r.billingStatus === 'FACTURADO'">{{ r.billingStatus === 'FACTURADO' ? 'Facturado' : 'Pendiente' }}</span></td>
                  <td class="c"><button class="mini" (click)="openFolio(r)"><i class="pi pi-eye"></i> Ver</button></td>
                </tr>
              } @empty { <tr><td [attr.colspan]="canSeeAmounts() ? 10 : 9" class="empty">Sin folios para los criterios indicados.</td></tr> }
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
      }
    </section>

    <!-- Detalle de cuenta del folio -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '52rem', maxWidth: '97vw' }" styleClass="fo-dialog" [header]="'Folio ' + (detail()?.folio?.code ?? '')">
      @if (detailLoading()) { <p class="muted">Cargando…</p> }
      @else if (detail()) {
        @let d = detail()!;
        <div class="d-head">
          <div><span class="l">Huésped</span><strong>{{ d.guest.name }}</strong><span class="sub">{{ d.guest.documentNumber }}</span></div>
          <div><span class="l">Habitación</span><strong>{{ d.room.number }}</strong><span class="sub">{{ d.room.typeName }}</span></div>
          <div><span class="l">Check-in</span><strong>{{ d.checkInAt | date: 'dd/MM/yyyy HH:mm' }}</strong></div>
          <div><span class="l">Salida prevista</span><strong>{{ d.plannedCheckoutAt | date: 'dd/MM/yyyy HH:mm' }}</strong></div>
        </div>

        @if (canSeeAmounts()) {
          <div class="d-cards">
            <div class="mc"><span>Hospedaje</span><strong>S/ {{ d.amounts.habitacion | number: '1.2-2' }}</strong></div>
            <div class="mc"><span>Renovaciones</span><strong>S/ {{ d.amounts.renovaciones | number: '1.2-2' }}</strong></div>
            <div class="mc"><span>Consumos</span><strong>S/ {{ d.amounts.consumos | number: '1.2-2' }}</strong></div>
            <div class="mc hl"><span>Total</span><strong>S/ {{ d.amounts.total | number: '1.2-2' }}</strong></div>
            <div class="mc"><span>Pagado</span><strong>S/ {{ d.amounts.paid | number: '1.2-2' }}</strong></div>
            <div class="mc" [class.neg]="(d.amounts.total - d.amounts.paid) > 0"><span>Saldo</span><strong>S/ {{ (d.amounts.total - d.amounts.paid) | number: '1.2-2' }}</strong></div>
          </div>

          <h3>Movimientos económicos</h3>
          <div class="tbl-wrap">
            <table class="tbl inner">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th class="r">Cargo</th><th class="r">Pago</th><th class="r">Saldo</th><th>Usuario</th></tr></thead>
              <tbody>
                @for (m of d.movements; track $index) {
                  <tr>
                    <td>{{ m.at | date: 'dd/MM HH:mm' }}</td><td>{{ m.type }}</td><td>{{ m.description }}</td>
                    <td class="r">{{ m.charge ? ('S/ ' + (m.charge | number: '1.2-2')) : '' }}</td>
                    <td class="r pos">{{ m.payment ? ('S/ ' + (m.payment | number: '1.2-2')) : '' }}</td>
                    <td class="r">S/ {{ m.balance | number: '1.2-2' }}</td><td>{{ m.by }}</td>
                  </tr>
                } @empty { <tr><td colspan="7" class="empty">Sin movimientos.</td></tr> }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="blind"><i class="pi pi-lock"></i> Los montos del folio no son visibles en modo caja ciega. Solicítalos a administración.</p>
        }
      }
    </p-dialog>
  `,
  styles: [
    `
      .wrap { padding: 1.4rem; }
      h1 { margin: 0; font-size: 1.5rem; } h3 { margin: 1rem 0 0.5rem; }
      .muted { color: #8aa0bd; } .empty { text-align: center; padding: 1.5rem; color: #8aa0bd; }
      .top { margin-bottom: 1rem; } .top .muted { font-size: 0.85rem; }
      .filters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; background: #0e1622; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; }
      .f { display: flex; flex-direction: column; gap: 0.35rem; } .f.wide { grid-column: span 2; } .f label { font-size: 0.72rem; color: #8aa0bd; }
      .f input { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.5rem; }
      :host ::ng-deep .w { width: 100%; }
      .acts { display: flex; align-items: center; gap: 0.6rem; margin: 0.9rem 0; }
      .btn { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.55rem 1rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: #fff; }
      .btn.p { background: #22c55e; color: #04130d; } .btn.s { background: #334155; }
      .count { color: #8aa0bd; font-size: 0.82rem; margin-left: auto; }
      .tbl-wrap { overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.84rem; white-space: nowrap; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.74rem; }
      .tbl .r { text-align: right; } .tbl .c { text-align: center; }
      .folio { background: #13243a; color: #a5b4fc; border-radius: 6px; padding: 0.12rem 0.5rem; font-weight: 700; font-size: 0.8rem; }
      .room { background: #13243a; color: #93c5fd; border-radius: 6px; padding: 0.1rem 0.5rem; font-weight: 700; font-size: 0.78rem; }
      .money { color: #34d399; font-weight: 700; }
      .pill { background: rgba(148,163,184,0.18); color: #cbd5e1; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.72rem; font-weight: 700; } .pill.open { background: rgba(16,185,129,0.2); color: #34d399; }
      .bs { background: rgba(245,158,11,0.18); color: #fbbf24; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.72rem; font-weight: 700; } .bs.fact { background: rgba(16,185,129,0.2); color: #34d399; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.3rem 0.6rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; }
      .pager { display: flex; align-items: center; gap: 1rem; justify-content: center; margin-top: 1rem; color: #8aa0bd; }
      .d-head { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; margin-bottom: 1rem; }
      .d-head .l { display: block; font-size: 0.7rem; color: #8aa0bd; text-transform: uppercase; } .d-head strong { display: block; } .d-head .sub { font-size: 0.76rem; color: #8aa0bd; }
      .d-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.6rem; }
      .mc { background: #131d2b; border: 1px solid #243245; border-radius: 10px; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.2rem; } .mc.hl { border-color: #10b981; } .mc span { font-size: 0.72rem; color: #8aa0bd; } .mc strong { font-size: 1.05rem; color: #34d399; } .mc.neg strong { color: #f87171; }
      .tbl.inner th, .tbl.inner td { font-size: 0.8rem; padding: 0.4rem 0.6rem; } .pos { color: #34d399; }
      .blind { display: flex; align-items: center; gap: 0.5rem; color: #93a4bd; background: #0e1622; border: 1px solid #1c2c44; border-radius: 10px; padding: 1rem; }
      :host ::ng-deep .fo-dialog .p-dialog-content, :host ::ng-deep .fo-dialog .p-dialog-header { background: #0e1622; color: #e6e9ef; }
      @media (max-width: 1000px) { .filters { grid-template-columns: repeat(2, 1fr); } .d-head { grid-template-columns: repeat(2, 1fr); } }
    `,
  ],
})
export class FoliosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly api = environment.apiUrl;
  private readonly auth = inject(AuthService);

  // Caja ciega: recepción no ve montos (consistente con el resto del sistema).
  readonly canSeeAmounts = computed(() => (this.auth.activeBranch()?.adminPresent ?? true) || this.auth.can('settings', 'edit'));

  readonly rows = signal<FolioRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly roomOpts = signal<{ label: string; value: string | null }[]>([{ label: 'Todas', value: null }]);
  readonly pageSize = 20;
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  fQ = '';
  fFolio = '';
  fDoc = '';
  fRoom: string | null = null;
  fStatus: string | null = null;
  fFrom = '';
  fTo = '';
  readonly statusOpts = [
    { label: 'Todos', value: null }, { label: 'Activa', value: 'OPEN' }, { label: 'Cerrada', value: 'CLOSED' }, { label: 'Anulada', value: 'CANCELLED' },
  ];

  detailVisible = false;
  readonly detailLoading = signal(false);
  readonly detail = signal<FolioDetail | null>(null);

  ngOnInit(): void {
    this.loadRooms();
    this.reload();
  }

  guestName(r: FolioRow): string { return r.guest ? `${r.guest.firstName} ${r.guest.lastName ?? ''}`.trim() : '—'; }
  statusLabel(s: string): string { return STATUS_LABEL[s] ?? s; }

  private loadRooms(): void {
    this.http.get<ApiResponse<RoomOpt[]>>(`${this.api}/rooms`, { params: { pageSize: '300' } }).subscribe({
      next: (r) => this.roomOpts.set([{ label: 'Todas', value: null }, ...(r.data ?? []).map((x) => ({ label: x.number, value: x.id }))]),
      error: () => {},
    });
  }

  go(p: number): void { if (p >= 1 && p <= this.pages()) { this.page.set(p); this.reload(); } }

  reload(): void {
    this.loading.set(true);
    const params: Record<string, string> = { page: String(this.page()), pageSize: String(this.pageSize) };
    if (this.fQ.trim()) params['q'] = this.fQ.trim();
    if (this.fFolio.trim()) params['folioCode'] = this.fFolio.trim();
    if (this.fDoc.trim()) params['doc'] = this.fDoc.trim();
    if (this.fRoom) params['roomId'] = this.fRoom;
    if (this.fStatus) params['status'] = this.fStatus;
    if (this.fFrom) params['checkInFrom'] = this.fFrom + 'T00:00:00';
    if (this.fTo) params['checkInTo'] = this.fTo + 'T23:59:59';
    this.http.get<ApiResponse<FolioRow[]>>(`${this.api}/stays/folios`, { params }).subscribe({
      next: (res) => { this.rows.set(res.data ?? []); this.total.set(res.meta?.total ?? (res.data?.length ?? 0)); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar folios.' }); },
    });
  }

  clear(): void {
    this.fQ = ''; this.fFolio = ''; this.fDoc = ''; this.fRoom = null; this.fStatus = null; this.fFrom = ''; this.fTo = '';
    this.page.set(1); this.reload();
  }

  openFolio(r: FolioRow): void {
    this.detail.set(null); this.detailVisible = true; this.detailLoading.set(true);
    this.http.get<ApiResponse<FolioDetail>>(`${this.api}/stays/${r.id}/folio`).subscribe({
      next: (res) => { this.detail.set(res.data); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el folio.' }); },
    });
  }
}
