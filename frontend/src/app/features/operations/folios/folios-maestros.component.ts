import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';

interface MasterRow { id: string; code: string; payerName: string; payerRuc: string | null; payerDoc: string | null; status: string; stayCount: number; createdAt: string }
interface StaySummary { id: string; folioCode: string | null; status: string; checkInAt: string; checkOutAt: string | null; room: string | null; guest: string; documentNumber: string; total: number; paid: number; pending: number; billingStatus: string; invoiced: number }
interface MasterDetail { id: string; code: string; status: string; notes: string | null; payer: { name: string; doc: string | null; ruc: string | null; address: string | null }; stays: StaySummary[]; totals: { total: number; paid: number; pending: number; invoiced: number } }
interface FolioPick { id: string; folioCode: string | null; status: string; checkInAt: string; room: { number: string | null } | null; guest: { firstName: string; lastName: string | null; documentNumber: string } | null }

const STATUS: Record<string, string> = { OPEN: 'Abierto', CLOSED: 'Cerrado', BILLED: 'Facturado' };
const BILL: Record<string, string> = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', FACTURADO: 'Facturado' };

@Component({
  selector: 'app-folios-maestros',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, DialogModule, ButtonModule, InputTextModule],
  template: `
    <section class="wrap">
      <header class="top">
        <div><h1>Folios Maestros</h1><p class="muted">Agrupa varios folios de estancia para facturar a una empresa (pagador ≠ huésped).</p></div>
        @if (canEdit) { <button class="btn p" (click)="openCreate()"><i class="pi pi-plus"></i> Nuevo folio maestro</button> }
      </header>

      <div class="bar">
        <div class="search"><i class="pi pi-search"></i><input [(ngModel)]="q" (keyup.enter)="reload()" placeholder="Buscar por código, empresa o RUC" /></div>
        <button class="btn s" (click)="reload()">Buscar</button>
        <span class="count">{{ total() }} folio(s) maestro(s)</span>
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Código</th><th>Empresa / Pagador</th><th>RUC</th><th class="c">Estancias</th><th class="c">Estado</th><th>Creado</th><th class="c">Acción</th></tr></thead>
            <tbody>
              @for (m of rows(); track m.id) {
                <tr>
                  <td><span class="code">{{ m.code }}</span></td>
                  <td>{{ m.payerName }}</td>
                  <td>{{ m.payerRuc || '—' }}</td>
                  <td class="c">{{ m.stayCount }}</td>
                  <td class="c"><span class="pill" [class.billed]="m.status === 'BILLED'">{{ statusLabel(m.status) }}</span></td>
                  <td>{{ m.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td class="c"><button class="mini" (click)="openDetail(m.id)"><i class="pi pi-eye"></i> Abrir</button></td>
                </tr>
              } @empty { <tr><td colspan="7" class="empty">Sin folios maestros. Crea uno para agrupar estancias de una empresa.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </section>

    <!-- Crear folio maestro -->
    <p-dialog [(visible)]="createVisible" [modal]="true" header="Nuevo folio maestro" [style]="{ width: '30rem', maxWidth: '96vw' }" styleClass="fm-dialog">
      <div class="form">
        <label>Empresa / Razón social *</label>
        <input pInputText [(ngModel)]="createForm.payerName" placeholder="Empresa ABC S.A.C." />
        <label>RUC</label>
        <input pInputText [(ngModel)]="createForm.payerRuc" placeholder="20xxxxxxxxx" />
        <label>Documento (alternativo)</label>
        <input pInputText [(ngModel)]="createForm.payerDoc" placeholder="DNI / CE" />
        <label>Dirección</label>
        <input pInputText [(ngModel)]="createForm.payerAddress" />
        <label>Notas</label>
        <input pInputText [(ngModel)]="createForm.notes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="createVisible = false" />
        <p-button label="Crear" icon="pi pi-check" [loading]="busy()" (onClick)="doCreate()" />
      </ng-template>
    </p-dialog>

    <!-- Detalle del folio maestro -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '60rem', maxWidth: '97vw' }" styleClass="fm-dialog" [header]="'Folio Maestro ' + (detail()?.code ?? '')">
      @if (detailLoading()) { <p class="muted">Cargando…</p> }
      @else if (detail()) {
        @let d = detail()!;
        <div class="d-head">
          <div><span class="l">Empresa</span><strong>{{ d.payer.name }}</strong></div>
          <div><span class="l">RUC</span><strong>{{ d.payer.ruc || '—' }}</strong></div>
          <div><span class="l">Estado</span><strong>{{ statusLabel(d.status) }}</strong></div>
          <div><span class="l">Estancias</span><strong>{{ d.stays.length }}</strong></div>
        </div>

        <div class="d-actions">
          @if (canEdit) { <button class="btn p sm" (click)="openAdd()"><i class="pi pi-plus"></i> Añadir folio</button> }
        </div>

        <div class="tbl-wrap">
          <table class="tbl inner">
            <thead><tr>
              <th>Folio</th><th>Huésped</th><th>Documento</th><th class="c">Hab.</th><th>Check-in</th>
              @if (canSeeAmounts()) { <th class="r">Total</th><th class="r">Pagado</th> }<th class="c">Facturación</th>@if (canEdit) { <th></th> }
            </tr></thead>
            <tbody>
              @for (s of d.stays; track s.id) {
                <tr>
                  <td><span class="code">{{ s.folioCode || '—' }}</span></td>
                  <td>{{ s.guest }}</td>
                  <td>{{ s.documentNumber }}</td>
                  <td class="c">{{ s.room || '—' }}</td>
                  <td>{{ s.checkInAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                  @if (canSeeAmounts()) { <td class="r">S/ {{ s.total | number: '1.2-2' }}</td><td class="r money">S/ {{ s.paid | number: '1.2-2' }}</td> }
                  <td class="c"><span class="bs" [class.fact]="s.billingStatus === 'FACTURADO'" [class.parc]="s.billingStatus === 'PARCIAL'">{{ billLabel(s.billingStatus) }}</span></td>
                  @if (canEdit) { <td class="c"><button class="mini danger" (click)="removeStay(s)"><i class="pi pi-times"></i></button></td> }
                </tr>
              } @empty { <tr><td [attr.colspan]="colspan()" class="empty">Sin estancias. Añade folios de estancia a este maestro.</td></tr> }
            </tbody>
            @if (canSeeAmounts() && d.stays.length) {
              <tfoot><tr class="tot"><td [attr.colspan]="4"></td><td class="r">Totales</td><td class="r">S/ {{ d.totals.total | number: '1.2-2' }}</td><td class="r money">S/ {{ d.totals.paid | number: '1.2-2' }}</td><td class="c">Fact. S/ {{ d.totals.invoiced | number: '1.2-2' }}</td>@if (canEdit) { <td></td> }</tr></tfoot>
            }
          </table>
        </div>
      }
    </p-dialog>

    <!-- Añadir folio (buscar estancia) -->
    <p-dialog [(visible)]="addVisible" [modal]="true" header="Añadir folio de estancia" [style]="{ width: '44rem', maxWidth: '96vw' }" styleClass="fm-dialog">
      <div class="search inline"><i class="pi pi-search"></i><input [(ngModel)]="addQ" (keyup.enter)="searchStays()" placeholder="Buscar por folio, nombre o documento" /><button class="btn s" (click)="searchStays()">Buscar</button></div>
      <div class="tbl-wrap">
        <table class="tbl inner">
          <thead><tr><th>Folio</th><th>Huésped</th><th>Documento</th><th class="c">Hab.</th><th>Check-in</th><th class="c"></th></tr></thead>
          <tbody>
            @for (p of pickRows(); track p.id) {
              <tr>
                <td><span class="code">{{ p.folioCode || '—' }}</span></td>
                <td>{{ pickName(p) }}</td>
                <td>{{ p.guest?.documentNumber || '—' }}</td>
                <td class="c">{{ p.room?.number || '—' }}</td>
                <td>{{ p.checkInAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="c"><button class="mini" [disabled]="busy()" (click)="addStay(p)"><i class="pi pi-plus"></i> Añadir</button></td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">Busca una estancia para añadirla.</td></tr> }
          </tbody>
        </table>
      </div>
    </p-dialog>
  `,
  styles: [
    `
      .wrap { padding: 1.4rem; }
      h1 { margin: 0; font-size: 1.5rem; } .muted { color: #8aa0bd; } .empty { text-align: center; padding: 1.5rem; color: #8aa0bd; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; } .top .muted { font-size: 0.85rem; }
      .bar { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0e1626; border: 1px solid #26364f; border-radius: 10px; padding: 0.5rem 0.8rem; color: #8aa0bd; flex: 1; max-width: 26rem; }
      .search.inline { max-width: none; margin-bottom: 0.8rem; } .search input { flex: 1; background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .btn { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.55rem 1rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: #fff; }
      .btn.p { background: #22c55e; color: #04130d; } .btn.s { background: #334155; } .btn.sm { padding: 0.4rem 0.8rem; font-size: 0.78rem; }
      .count { color: #8aa0bd; font-size: 0.82rem; margin-left: auto; }
      .tbl-wrap { overflow-x: auto; } .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.55rem 0.8rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.84rem; white-space: nowrap; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.74rem; } .tbl .r { text-align: right; } .tbl .c { text-align: center; }
      .tbl.inner th, .tbl.inner td { font-size: 0.8rem; padding: 0.45rem 0.6rem; } .tbl tfoot .tot td { border-top: 2px solid #243245; font-weight: 700; }
      .code { background: #13243a; color: #a5b4fc; border-radius: 6px; padding: 0.12rem 0.5rem; font-weight: 700; font-size: 0.8rem; }
      .money { color: #34d399; font-weight: 700; }
      .pill { background: rgba(148,163,184,0.18); color: #cbd5e1; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.72rem; font-weight: 700; } .pill.billed { background: rgba(16,185,129,0.2); color: #34d399; }
      .bs { background: rgba(245,158,11,0.18); color: #fbbf24; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.72rem; font-weight: 700; } .bs.fact { background: rgba(16,185,129,0.2); color: #34d399; } .bs.parc { background: rgba(59,130,246,0.2); color: #60a5fa; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.3rem 0.6rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; } .mini.danger { color: #fca5a5; border-color: #7f1d1d; }
      .d-head { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; margin-bottom: 0.8rem; }
      .d-head .l { display: block; font-size: 0.7rem; color: #8aa0bd; text-transform: uppercase; } .d-head strong { display: block; }
      .d-actions { margin-bottom: 0.6rem; }
      .form { display: flex; flex-direction: column; gap: 0.35rem; } .form label { font-size: 0.8rem; color: #8aa0bd; margin-top: 0.4rem; }
      :host ::ng-deep .form input[pInputText] { width: 100%; }
      :host ::ng-deep .fm-dialog .p-dialog-content, :host ::ng-deep .fm-dialog .p-dialog-header { background: #0e1622; color: #e6e9ef; }
      @media (max-width: 900px) { .d-head { grid-template-columns: repeat(2, 1fr); } }
    `,
  ],
})
export class FoliosMaestrosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly api = environment.apiUrl;
  private readonly auth = inject(AuthService);

  readonly canEdit = this.auth.can('operations', 'edit');
  readonly canSeeAmounts = computed(() => (this.auth.activeBranch()?.adminPresent ?? true) || this.auth.can('settings', 'edit'));

  readonly rows = signal<MasterRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly busy = signal(false);
  q = '';

  createVisible = false;
  createForm = { payerName: '', payerRuc: '', payerDoc: '', payerAddress: '', notes: '' };

  detailVisible = false;
  readonly detailLoading = signal(false);
  readonly detail = signal<MasterDetail | null>(null);

  addVisible = false;
  addQ = '';
  readonly pickRows = signal<FolioPick[]>([]);

  ngOnInit(): void { this.reload(); }

  statusLabel(s: string): string { return STATUS[s] ?? s; }
  billLabel(s: string): string { return BILL[s] ?? s; }
  pickName(p: FolioPick): string { return p.guest ? `${p.guest.firstName} ${p.guest.lastName ?? ''}`.trim() : '—'; }
  colspan(): number { return 5 + (this.canSeeAmounts() ? 2 : 0) + 1 + (this.canEdit ? 1 : 0); }

  reload(): void {
    this.loading.set(true);
    const params: Record<string, string> = { pageSize: '50' };
    if (this.q.trim()) params['search'] = this.q.trim();
    this.http.get<ApiResponse<MasterRow[]>>(`${this.api}/master-folios`, { params }).subscribe({
      next: (r) => { this.rows.set(r.data ?? []); this.total.set(r.meta?.total ?? (r.data?.length ?? 0)); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar.' }); },
    });
  }

  openCreate(): void { this.createForm = { payerName: '', payerRuc: '', payerDoc: '', payerAddress: '', notes: '' }; this.createVisible = true; }
  doCreate(): void {
    if (!this.createForm.payerName.trim()) { this.toast.add({ severity: 'warn', summary: 'Empresa', detail: 'Indica la razón social.' }); return; }
    this.busy.set(true);
    this.http.post<ApiResponse<MasterRow>>(`${this.api}/master-folios`, this.createForm).subscribe({
      next: (r) => { this.busy.set(false); this.createVisible = false; this.toast.add({ severity: 'success', summary: 'Creado', detail: r.data?.code ?? '' }); this.reload(); if (r.data) this.openDetail(r.data.id); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo crear.' }); },
    });
  }

  openDetail(id: string): void {
    this.detail.set(null); this.detailVisible = true; this.detailLoading.set(true);
    this.http.get<ApiResponse<MasterDetail>>(`${this.api}/master-folios/${id}`).subscribe({
      next: (r) => { this.detail.set(r.data); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle.' }); },
    });
  }

  openAdd(): void { this.addQ = ''; this.pickRows.set([]); this.addVisible = true; }
  searchStays(): void {
    const params: Record<string, string> = { pageSize: '20' };
    if (this.addQ.trim()) params['q'] = this.addQ.trim();
    this.http.get<ApiResponse<FolioPick[]>>(`${this.api}/stays/folios`, { params }).subscribe({
      next: (r) => this.pickRows.set(r.data ?? []),
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo buscar.' }),
    });
  }
  addStay(p: FolioPick): void {
    const d = this.detail(); if (!d) return;
    this.busy.set(true);
    this.http.post<ApiResponse<MasterDetail>>(`${this.api}/master-folios/${d.id}/stays`, { stayId: p.id }).subscribe({
      next: (r) => { this.busy.set(false); this.detail.set(r.data); this.addVisible = false; this.toast.add({ severity: 'success', summary: 'Añadido', detail: p.folioCode ?? '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'warn', summary: 'No se pudo añadir', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
  removeStay(s: StaySummary): void {
    const d = this.detail(); if (!d) return;
    if (!confirm(`¿Quitar el folio ${s.folioCode ?? ''} de este maestro?`)) return;
    this.busy.set(true);
    this.http.delete<ApiResponse<MasterDetail>>(`${this.api}/master-folios/${d.id}/stays/${s.id}`).subscribe({
      next: (r) => { this.busy.set(false); this.detail.set(r.data); this.toast.add({ severity: 'success', summary: 'Quitado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo quitar.' }); },
    });
  }
}
