import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ConfirmationService, MessageService } from 'primeng/api';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';

interface DoneRow {
  id: string; folioCode: string | null; room: string | null; guest: string; documentNumber: string;
  plannedCheckoutAt: string; checkOutAt: string; late: boolean; lateMinutes: number; lateCharge: number;
  hasCharge: boolean; chargePaid: boolean | null; closedBy: string; shift: string;
}
interface Indicators { total: number; onTime: number; late: number; charged: number; notCharged: number }
interface HistoryData { items: DoneRow[]; indicators: Indicators; collaborators: { id: string; name: string }[]; rooms: { id: string; number: string }[] }
interface FolioDetail {
  folio: { code: string; status: string }; guest: { name: string; documentNumber: string };
  room: { number: string; typeName: string }; checkInAt: string; plannedCheckoutAt: string;
  amounts: { habitacion: number; renovaciones: number; consumos: number; total: number; paid: number };
  movements: { at: string; type: string; description: string; charge: number; payment: number; balance: number; by: string }[];
}

function ymd(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

@Component({
  selector: 'app-checkouts',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, DialogModule, SelectModule],
  template: `
    <section class="co">
      <header class="head">
        <div>
          <h1>Check-outs</h1>
          <p class="muted">Gestiona las salidas programadas y consulta el historial de check-outs realizados.</p>
        </div>
      </header>

      <div class="tabs">
        <button class="tab" [class.on]="tab() === 'PROG'" (click)="tab.set('PROG')"><i class="pi pi-calendar-clock"></i> Programados</button>
        <button class="tab" [class.on]="tab() === 'DONE'" (click)="setDone()"><i class="pi pi-file-check"></i> Finalizados</button>
      </div>

      <!-- ══════════ PROGRAMADOS ══════════ -->
      @if (tab() === 'PROG') {
        <div class="panel">
          <div class="panel-h">
            <div><strong>Estancias activas pendientes de salida</strong><span class="muted"> Las habitaciones en naranja ya superaron su hora prevista de salida.</span></div>
            <div class="ph-r"><span class="pill">{{ stays().length }} activas</span><button class="icn" (click)="load()"><i class="pi pi-refresh"></i></button></div>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Habitación</th><th>Huésped</th><th>Check-in</th><th>Salida prevista</th><th>Estado</th><th class="r">Precio</th><th>Acción</th></tr></thead>
              <tbody>
                @for (s of stays(); track s.id) {
                  <tr [class.late]="ti(s.plannedCheckoutAt).late">
                    <td class="room" [class.lt]="ti(s.plannedCheckoutAt).late">{{ s.room.number }}</td>
                    <td>{{ s.guest.firstName }} {{ s.guest.lastName }}<br /><span class="doc">{{ s.guest.documentNumber }}</span></td>
                    <td [class.lt]="ti(s.plannedCheckoutAt).late">{{ s.checkInAt | date: 'dd/MM/yyyy' }}<br />{{ s.checkInAt | date: 'HH:mm' }}</td>
                    <td [class.lt]="ti(s.plannedCheckoutAt).late">{{ s.plannedCheckoutAt | date: 'dd/MM/yyyy' }}<br />{{ s.plannedCheckoutAt | date: 'HH:mm' }}</td>
                    <td>
                      <span class="chip" [class.ok]="!ti(s.plannedCheckoutAt).late" [class.warn]="ti(s.plannedCheckoutAt).late">{{ ti(s.plannedCheckoutAt).late ? 'Con demora' : 'A tiempo' }}</span>
                      <div class="sub" [class.lt]="ti(s.plannedCheckoutAt).late">{{ ti(s.plannedCheckoutAt).text }}</div>
                    </td>
                    <td class="r">S/ {{ s.priceAgreed | number: '1.2-2' }}</td>
                    <td><button class="co-btn" (click)="confirmCheckout(s)">Check-out <i class="pi pi-sign-out"></i></button></td>
                  </tr>
                } @empty { <tr><td colspan="7" class="empty">No hay estancias activas pendientes de salida.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- ══════════ FINALIZADOS ══════════ -->
      @if (tab() === 'DONE') {
        <div class="panel filters">
          <div class="fgrid">
            <div class="f"><label>Fecha inicio</label><input type="date" [(ngModel)]="fFrom" /></div>
            <div class="f"><label>Fecha fin</label><input type="date" [(ngModel)]="fTo" /></div>
            <div class="f"><label>Turno</label><p-select [options]="shiftOpts" optionLabel="label" optionValue="value" [(ngModel)]="fShift" styleClass="w" /></div>
            <div class="f"><label>Estado</label><p-select [options]="estadoOpts" optionLabel="label" optionValue="value" [(ngModel)]="fEstado" styleClass="w" /></div>
            <div class="f"><label>Estado de cobro</label><p-select [options]="cobroOpts" optionLabel="label" optionValue="value" [(ngModel)]="fCobro" styleClass="w" /></div>
            <div class="f"><label>Colaborador</label><p-select [options]="collabOpts()" optionLabel="label" optionValue="value" [(ngModel)]="fCollab" styleClass="w" /></div>
            <div class="f"><label>Habitación</label><p-select [options]="roomOpts()" optionLabel="label" optionValue="value" [(ngModel)]="fRoom" styleClass="w" /></div>
          </div>
          <div class="fbtns"><button class="btn p" (click)="loadDone(1)"><i class="pi pi-search"></i> Buscar</button><button class="btn s" (click)="clearDone()"><i class="pi pi-refresh"></i> Limpiar</button></div>
        </div>

        <div class="kpis">
          <div class="kpi"><span>Total Check-outs</span><strong>{{ ind().total }}</strong></div>
          <div class="kpi ok"><span>A tiempo</span><strong>{{ ind().onTime }}</strong></div>
          <div class="kpi warn"><span>Con demora</span><strong>{{ ind().late }}</strong></div>
          <div class="kpi green"><span>Cobrados</span><strong>{{ ind().charged }}</strong></div>
          <div class="kpi red"><span>No cobrados</span><strong>{{ ind().notCharged }}</strong></div>
        </div>

        <div class="panel">
          @if (doneLoading()) { <p class="muted pad">Cargando…</p> }
          @else {
            <div class="tbl-wrap">
              <table class="tbl">
                <thead><tr>
                  <th>Salida</th><th>Hab.</th><th>Huésped</th><th>Salida prevista</th><th>Salida real</th>
                  <th>Estado</th><th class="r">Cobro demora</th><th class="c">Estado cobro</th><th>Colaborador</th><th class="c">Acción</th>
                </tr></thead>
                <tbody>
                  @for (r of doneRows(); track r.id) {
                    <tr>
                      <td>{{ r.checkOutAt | date: 'dd/MM/yyyy' }}<br /><span class="doc">{{ r.checkOutAt | date: 'HH:mm' }}</span></td>
                      <td class="room">{{ r.room || '—' }}</td>
                      <td>{{ r.guest }}<br /><span class="doc">{{ r.documentNumber }}</span></td>
                      <td>{{ r.plannedCheckoutAt | date: 'dd/MM HH:mm' }}</td>
                      <td [class.lt]="r.late">{{ r.checkOutAt | date: 'dd/MM HH:mm' }}</td>
                      <td><span class="chip" [class.ok]="!r.late" [class.warn]="r.late">{{ r.late ? 'Con demora' : 'A tiempo' }}</span>@if (r.late) { <div class="sub lt">{{ human(r.lateMinutes) }}</div> }</td>
                      <td class="r">{{ r.hasCharge ? ('S/ ' + (r.lateCharge | number: '1.2-2')) : '—' }}</td>
                      <td class="c">
                        @if (r.chargePaid === null) { <span class="dash">—</span> }
                        @else { <span class="chip" [class.ok]="r.chargePaid" [class.warn]="!r.chargePaid" [class.red]="!r.chargePaid">{{ r.chargePaid ? 'Cobrado' : 'No cobrado' }}</span> }
                      </td>
                      <td>{{ r.closedBy }}</td>
                      <td class="c"><button class="mini" (click)="openDetail(r.id)"><i class="pi pi-eye"></i> Detalle</button></td>
                    </tr>
                  } @empty { <tr><td colspan="10" class="empty">Sin check-outs para los criterios indicados.</td></tr> }
                </tbody>
              </table>
            </div>
            @if (doneTotal() > pageSize) {
              <div class="pager">
                <button class="mini" [disabled]="donePage() === 1" (click)="loadDone(donePage() - 1)">Anterior</button>
                <span>Página {{ donePage() }} de {{ donePages() }}</span>
                <button class="mini" [disabled]="donePage() >= donePages()" (click)="loadDone(donePage() + 1)">Siguiente</button>
              </div>
            }
          }
        </div>
      }
    </section>

    <!-- Confirmación de check-out -->
    <p-dialog [(visible)]="confirmVisible" [modal]="true" header="Confirmar check-out" [style]="{ width: '26rem' }" styleClass="co-dialog">
      <p class="cf">¿Cerrar la estancia de la habitación <strong>{{ confirmStay?.room?.number }}</strong>? La habitación pasará a limpieza.</p>
      <ng-template pTemplate="footer">
        <button class="btn s" (click)="confirmVisible = false">Cancelar</button>
        <button class="btn p" (click)="doCheckout()">Check-out</button>
      </ng-template>
    </p-dialog>

    <!-- Detalle del folio -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '48rem', maxWidth: '97vw' }" styleClass="co-dialog" [header]="'Folio ' + (detail()?.folio?.code ?? '')">
      @if (detailLoading()) { <p class="muted">Cargando…</p> }
      @else if (detail()) {
        @let d = detail()!;
        <div class="d-head">
          <div><span class="l">Huésped</span><strong>{{ d.guest.name }}</strong><span class="doc">{{ d.guest.documentNumber }}</span></div>
          <div><span class="l">Habitación</span><strong>{{ d.room.number }}</strong><span class="doc">{{ d.room.typeName }}</span></div>
          <div><span class="l">Check-in</span><strong>{{ d.checkInAt | date: 'dd/MM/yyyy HH:mm' }}</strong></div>
          <div><span class="l">Salida prevista</span><strong>{{ d.plannedCheckoutAt | date: 'dd/MM/yyyy HH:mm' }}</strong></div>
        </div>
        @if (canSeeAmounts()) {
          <div class="d-cards">
            <div class="mc"><span>Hospedaje</span><strong>S/ {{ d.amounts.habitacion | number: '1.2-2' }}</strong></div>
            <div class="mc"><span>Consumos</span><strong>S/ {{ d.amounts.consumos | number: '1.2-2' }}</strong></div>
            <div class="mc hl"><span>Total</span><strong>S/ {{ d.amounts.total | number: '1.2-2' }}</strong></div>
            <div class="mc"><span>Pagado</span><strong>S/ {{ d.amounts.paid | number: '1.2-2' }}</strong></div>
          </div>
          <div class="tbl-wrap">
            <table class="tbl inner">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th class="r">Cargo</th><th class="r">Pago</th></tr></thead>
              <tbody>
                @for (m of d.movements; track $index) { <tr><td>{{ m.at | date: 'dd/MM HH:mm' }}</td><td>{{ m.type }}</td><td>{{ m.description }}</td><td class="r">{{ m.charge ? ('S/ ' + (m.charge | number: '1.2-2')) : '' }}</td><td class="r pos">{{ m.payment ? ('S/ ' + (m.payment | number: '1.2-2')) : '' }}</td></tr> }
                @empty { <tr><td colspan="5" class="empty">Sin movimientos.</td></tr> }
              </tbody>
            </table>
          </div>
        } @else { <p class="blind"><i class="pi pi-lock"></i> Los montos del folio no son visibles en modo caja ciega.</p> }
      }
    </p-dialog>
  `,
  styles: [
    `
      .co { background: #0b1220; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; font-size: 1.5rem; } .muted { color: #8aa0bd; } .head .muted { font-size: 0.85rem; }
      .empty { text-align: center; padding: 1.6rem; color: #8aa0bd; } .pad { padding: 1rem; } .doc { font-size: 0.76rem; color: #8aa0bd; } .dash { color: #64748b; }
      .tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid #1c2c44; margin: 1rem 0 1.2rem; }
      .tab { background: transparent; border: 0; border-bottom: 3px solid transparent; color: #8aa0bd; padding: 0.7rem 1.1rem; cursor: pointer; font-weight: 700; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 0.45rem; }
      .tab.on { color: #34d399; border-bottom-color: #22c55e; }
      .panel { background: #101a2e; border: 1px solid #1c2c44; border-radius: 12px; overflow: hidden; margin-bottom: 1.1rem; }
      .panel-h { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1.1rem; border-bottom: 1px solid #1c2c44; }
      .panel-h strong { color: #fff; } .ph-r { display: flex; align-items: center; gap: 0.6rem; }
      .pill { background: #16233a; border: 1px solid #274468; color: #cbd5e1; border-radius: 999px; padding: 0.3rem 0.8rem; font-size: 0.8rem; font-weight: 700; }
      .icn { background: #16233a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; width: 2rem; height: 2rem; cursor: pointer; }
      .tbl-wrap { overflow-x: auto; } .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.65rem 0.9rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.85rem; white-space: nowrap; vertical-align: top; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.03em; } .tbl .r { text-align: right; } .tbl .c { text-align: center; }
      .room { font-weight: 800; font-size: 1.05rem; color: #e6e9ef; } .room.lt, td.lt { color: #fb923c; }
      tr.late td { background: rgba(251,146,60,0.06); }
      .chip { display: inline-block; border-radius: 999px; padding: 0.12rem 0.6rem; font-size: 0.72rem; font-weight: 800; }
      .chip.ok { background: rgba(59,130,246,0.2); color: #60a5fa; } .chip.warn { background: rgba(245,158,11,0.2); color: #fbbf24; } .chip.red { background: rgba(239,68,68,0.2); color: #f87171; }
      .sub { font-size: 0.74rem; color: #8aa0bd; margin-top: 0.2rem; } .sub.lt { color: #fb923c; font-weight: 700; }
      .co-btn { background: #22c55e; color: #04130d; border: 0; border-radius: 9px; padding: 0.55rem 0.9rem; font-weight: 800; font-size: 0.82rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
      .mini { background: #16233a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.35rem 0.7rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; }
      .filters { padding: 1rem 1.1rem; }
      .fgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; }
      .f { display: flex; flex-direction: column; gap: 0.3rem; } .f label { font-size: 0.72rem; color: #8aa0bd; }
      .f input[type=date] { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.5rem; }
      :host ::ng-deep .w { width: 100%; }
      .fbtns { display: flex; gap: 0.6rem; margin-top: 0.9rem; }
      .btn { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.55rem 1rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: #fff; }
      .btn.p { background: #22c55e; color: #04130d; } .btn.s { background: #334155; }
      .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.8rem; margin-bottom: 1.1rem; }
      .kpi { background: #101a2e; border: 1px solid #1c2c44; border-radius: 12px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
      .kpi span { font-size: 0.74rem; color: #8aa0bd; text-transform: uppercase; letter-spacing: 0.03em; } .kpi strong { font-size: 1.7rem; color: #e6e9ef; }
      .kpi.ok strong { color: #60a5fa; } .kpi.warn strong { color: #fbbf24; } .kpi.green strong { color: #34d399; } .kpi.red strong { color: #f87171; }
      .pager { display: flex; align-items: center; gap: 1rem; justify-content: center; padding: 0.8rem; color: #8aa0bd; }
      .cf { color: #cbd5e1; } .cf strong { color: #fff; }
      .d-head { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; margin-bottom: 1rem; }
      .d-head .l { display: block; font-size: 0.7rem; color: #8aa0bd; text-transform: uppercase; } .d-head strong { display: block; }
      .d-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px,1fr)); gap: 0.6rem; margin-bottom: 0.8rem; }
      .mc { background: #131d2b; border: 1px solid #243245; border-radius: 10px; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.2rem; } .mc.hl { border-color: #10b981; } .mc span { font-size: 0.72rem; color: #8aa0bd; } .mc strong { color: #34d399; }
      .tbl.inner th, .tbl.inner td { font-size: 0.8rem; padding: 0.4rem 0.6rem; } .pos { color: #34d399; }
      .blind { display: flex; align-items: center; gap: 0.5rem; color: #93a4bd; background: #0e1622; border: 1px solid #1c2c44; border-radius: 10px; padding: 1rem; }
      :host ::ng-deep .co-dialog .p-dialog-content, :host ::ng-deep .co-dialog .p-dialog-header, :host ::ng-deep .co-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      @media (max-width: 1000px) { .fgrid { grid-template-columns: repeat(2, 1fr); } .kpis { grid-template-columns: repeat(2, 1fr); } .d-head { grid-template-columns: repeat(2, 1fr); } }
    `,
  ],
})
export class CheckoutsComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly tab = signal<'PROG' | 'DONE'>('PROG');
  readonly canSeeAmounts = computed(() => (this.auth.activeBranch()?.adminPresent ?? true) || this.auth.can('settings', 'edit'));

  // Programados
  readonly stays = signal<Stay[]>([]);
  readonly loading = signal(false);

  // Finalizados
  readonly doneRows = signal<DoneRow[]>([]);
  readonly ind = signal<Indicators>({ total: 0, onTime: 0, late: 0, charged: 0, notCharged: 0 });
  readonly doneLoading = signal(false);
  readonly doneTotal = signal(0);
  readonly donePage = signal(1);
  readonly pageSize = 20;
  readonly donePages = computed(() => Math.max(1, Math.ceil(this.doneTotal() / this.pageSize)));
  readonly collabOpts = signal<{ label: string; value: string | null }[]>([{ label: 'Todos', value: null }]);
  readonly roomOpts = signal<{ label: string; value: string | null }[]>([{ label: 'Todas', value: null }]);
  private doneLoaded = false;

  fFrom = ymd(new Date(Date.now() - 29 * 86400000));
  fTo = ymd(new Date());
  fShift: string | null = null;
  fEstado: string | null = null;
  fCobro: string | null = null;
  fCollab: string | null = null;
  fRoom: string | null = null;
  readonly shiftOpts = [{ label: 'Todos', value: null }, { label: 'Mañana', value: 'MANANA' }, { label: 'Tarde', value: 'TARDE' }, { label: 'Noche', value: 'NOCHE' }];
  readonly estadoOpts = [{ label: 'Todos', value: null }, { label: 'A tiempo', value: 'ONTIME' }, { label: 'Con demora', value: 'LATE' }];
  readonly cobroOpts = [{ label: 'Todos', value: null }, { label: 'Cobrado', value: 'PAID' }, { label: 'No cobrado', value: 'UNPAID' }];

  // Diálogos
  confirmVisible = false;
  confirmStay: Stay | null = null;
  detailVisible = false;
  readonly detailLoading = signal(false);
  readonly detail = signal<FolioDetail | null>(null);

  ngOnInit(): void { this.load(); }

  setDone(): void { this.tab.set('DONE'); if (!this.doneLoaded) { this.doneLoaded = true; this.loadDone(1); } }

  /** Info de tiempo restante / demora respecto a la salida prevista. */
  ti(planned: string): { late: boolean; text: string } {
    const diff = new Date(planned).getTime() - Date.now();
    if (diff >= 0) return { late: false, text: 'Faltan ' + this.human(Math.round(diff / 60000)) };
    return { late: true, text: 'Demora ' + this.human(Math.round(-diff / 60000)) };
  }
  human(mins: number): string {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }

  load(): void {
    this.loading.set(true);
    this.ops.stays({ status: 'OPEN', sortBy: 'plannedCheckoutAt', sortDir: 'asc', pageSize: 200 }).subscribe({
      next: (res) => { this.stays.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadDone(page: number): void {
    this.donePage.set(Math.max(1, page));
    this.doneLoading.set(true);
    const params: Record<string, string> = { page: String(this.donePage()), pageSize: String(this.pageSize) };
    if (this.fFrom) params['from'] = this.fFrom + 'T00:00:00';
    if (this.fTo) params['to'] = this.fTo + 'T23:59:59';
    if (this.fShift) params['shift'] = this.fShift;
    if (this.fEstado) params['estado'] = this.fEstado;
    if (this.fCobro) params['cobro'] = this.fCobro;
    if (this.fCollab) params['collaboratorId'] = this.fCollab;
    if (this.fRoom) params['roomId'] = this.fRoom;
    this.http.get<ApiResponse<HistoryData>>(`${this.api}/stays/checkout-history`, { params }).subscribe({
      next: (res) => {
        const d = res.data;
        this.doneRows.set(d?.items ?? []);
        this.ind.set(d?.indicators ?? { total: 0, onTime: 0, late: 0, charged: 0, notCharged: 0 });
        this.doneTotal.set(res.meta?.total ?? 0);
        this.collabOpts.set([{ label: 'Todos', value: null }, ...(d?.collaborators ?? []).map((c) => ({ label: c.name, value: c.id }))]);
        this.roomOpts.set([{ label: 'Todas', value: null }, ...(d?.rooms ?? []).map((r) => ({ label: r.number, value: r.id }))]);
        this.doneLoading.set(false);
      },
      error: () => { this.doneLoading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el historial.' }); },
    });
  }

  clearDone(): void {
    this.fFrom = ymd(new Date(Date.now() - 29 * 86400000)); this.fTo = ymd(new Date());
    this.fShift = null; this.fEstado = null; this.fCobro = null; this.fCollab = null; this.fRoom = null;
    this.loadDone(1);
  }

  confirmCheckout(s: Stay): void { this.confirmStay = s; this.confirmVisible = true; }
  doCheckout(): void {
    const s = this.confirmStay; if (!s) return;
    this.confirmVisible = false;
    this.ops.checkOut(s.id, 'CLEANING').subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Check-out realizado', detail: `Habitación ${s.room.number}` }); this.load(); if (this.doneLoaded) this.loadDone(this.donePage()); },
      error: (err) => this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo cerrar la estancia' }),
    });
  }

  openDetail(id: string): void {
    this.detail.set(null); this.detailVisible = true; this.detailLoading.set(true);
    this.http.get<ApiResponse<FolioDetail>>(`${this.api}/stays/${id}/folio`).subscribe({
      next: (r) => { this.detail.set(r.data); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle.' }); },
    });
  }
}
