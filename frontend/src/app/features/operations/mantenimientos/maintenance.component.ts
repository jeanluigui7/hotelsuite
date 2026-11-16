import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { OperationsApiService } from '../services/operations-api.service';
import type { FaultSeverity, Maintenance } from '../services/operations.models';

type St = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
const META: Record<St, { label: string; severity: 'warn' | 'info' | 'success' | 'danger' }> = {
  OPEN: { label: 'Pendiente', severity: 'warn' },
  IN_PROGRESS: { label: 'En atención', severity: 'info' },
  DONE: { label: 'Resuelto', severity: 'success' },
  CANCELLED: { label: 'Anulado', severity: 'danger' },
};

interface ResolveForm {
  resolutionNotes: string;
  repairedBy: string;
  cost: number | null;
  resolutionPhoto: string | null;
}

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Mantenimientos</h1>
          <p class="muted">Fallas reportadas por habitación. Las <strong>críticas</strong> bloquean el alquiler hasta resolverse.</p>
        </div>
      </header>

      <div class="filters">
        <p-select [options]="statusFilterOpts" optionLabel="label" optionValue="value" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)" styleClass="flt" />
        <span class="p-input-icon-left search">
          <input pInputText placeholder="Buscar falla o habitación…" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        </span>
        <span class="spacer"></span>
        <span class="counter">{{ filtered().length }} de {{ items().length }}</span>
      </div>

      <p-table [value]="filtered()" [loading]="loading()" [paginator]="true" [rows]="12" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th style="width:5.5rem">Hab.</th>
            <th>Falla</th>
            <th style="width:8rem">Gravedad</th>
            <th style="width:12rem">Reportó</th>
            <th style="width:9rem">Estado</th>
            <th style="width:11rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr [class.row-crit]="row.status !== 'DONE' && row.status !== 'CANCELLED' && row.severity === 'CRITICA'">
            <td><strong>{{ row.roomNumber ?? '—' }}</strong></td>
            <td>
              {{ row.faultLabel || row.title }}
              @if (row.categoryLabel) { <div class="muted small">{{ row.categoryLabel }}</div> }
              @if (row.description) { <div class="muted small desc">{{ row.description }}</div> }
            </td>
            <td>
              @if (row.severity) { <span class="sevb" [class.leve]="row.severity==='LEVE'" [class.inter]="row.severity==='INTERMEDIA'" [class.crit]="row.severity==='CRITICA'">{{ sevLabel(row.severity) }}</span> }
              @else { <span class="muted">—</span> }
            </td>
            <td>
              <div>{{ row.reporterName ?? '—' }}</div>
              <div class="muted small">{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</div>
            </td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td class="cat-actions">
              @if (row.status === 'OPEN' || row.status === 'IN_PROGRESS') {
                @if (canResolve) {
                  <p-button label="Resolver" icon="pi pi-wrench" size="small" (onClick)="openResolve(row)" />
                } @else {
                  <p-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (onClick)="openDetail(row)" />
                }
              } @else {
                <p-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (onClick)="openDetail(row)" />
              }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin fallas registradas.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- Resolver / Ver detalle -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '40rem', maxWidth: '96vw' }"
      [header]="mode() === 'resolve' ? 'Resolver falla' : 'Detalle de la falla'">
      @if (current(); as m) {
        <div class="rv">
          <!-- Reporte original (siempre visible) -->
          <div class="rv-report">
            <div class="rv-top">
              <strong>{{ m.faultLabel || m.title }}</strong>
              @if (m.severity) { <span class="sevb" [class.leve]="m.severity==='LEVE'" [class.inter]="m.severity==='INTERMEDIA'" [class.crit]="m.severity==='CRITICA'">{{ sevLabel(m.severity) }}</span> }
              <p-tag [value]="meta(m.status).label" [severity]="meta(m.status).severity" />
            </div>
            <div class="rv-meta">
              <span>Hab. <strong>{{ m.roomNumber ?? '—' }}</strong></span>
              @if (m.categoryLabel) { <span>· {{ m.categoryLabel }}</span> }
              <span>· Reportó {{ m.reporterName ?? '—' }} el {{ m.createdAt | date: 'dd/MM/yy HH:mm' }}</span>
            </div>
            @if (m.description) { <p class="rv-desc">{{ m.description }}</p> }
            @if (m.photo) { <img [src]="m.photo" class="rv-photo" alt="foto de la falla" /> }
          </div>

          @if (mode() === 'resolve') {
            <div class="rv-form">
              <label>Trabajo realizado *</label>
              <textarea pInputText rows="3" [(ngModel)]="form.resolutionNotes" placeholder="Describe la reparación…"></textarea>
              <div class="rv-grid">
                <div><label>Quién reparó</label><input pInputText [(ngModel)]="form.repairedBy" placeholder="Nombre (interno o externo)" /></div>
                <div><label>Costo (opcional)</label><p-inputNumber [(ngModel)]="form.cost" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" /></div>
              </div>
              <label>Foto de evidencia (opcional)</label>
              <div class="rv-up-row">
                <label class="rv-up"><i class="pi pi-camera"></i> {{ form.resolutionPhoto ? 'Cambiar foto' : 'Adjuntar foto' }}<input type="file" accept="image/*" (change)="onPhoto($event)" hidden /></label>
                @if (form.resolutionPhoto) { <img [src]="form.resolutionPhoto" class="rv-thumb" alt="evidencia" /> <button class="rv-rm" (click)="form.resolutionPhoto = null"><i class="pi pi-trash"></i></button> }
              </div>
            </div>
          } @else if (m.status === 'DONE' || m.status === 'CANCELLED') {
            <div class="rv-resolution">
              <div class="rv-rhead"><i class="pi pi-check-circle"></i> {{ m.status === 'CANCELLED' ? 'Anulada' : 'Resuelta' }}</div>
              @if (m.resolutionNotes) { <p class="rv-desc">{{ m.resolutionNotes }}</p> }
              <div class="rv-meta">
                @if (m.repairedBy) { <span>Reparó: <strong>{{ m.repairedBy }}</strong></span> }
                <span>· Registró {{ m.resolverName ?? '—' }}</span>
                @if (m.resolvedAt) { <span>· {{ m.resolvedAt | date: 'dd/MM/yy HH:mm' }}</span> }
                @if (m.cost != null) { <span>· Costo S/ {{ m.cost }}</span> }
              </div>
              @if (m.resolutionPhoto) { <img [src]="m.resolutionPhoto" class="rv-photo" alt="evidencia" /> }
            </div>
          }
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        @if (mode() === 'resolve') {
          <p-button label="Anular falla" severity="danger" [outlined]="true" [loading]="saving()" (onClick)="submitResolve('CANCELLED')" />
          <p-button label="Registrar resolución" icon="pi pi-check" [loading]="saving()" (onClick)="submitResolve('DONE')" />
        }
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .filters { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
    .filters .search input { min-width: 16rem; }
    .filters .spacer { flex: 1; }
    .filters .counter { color: var(--p-text-muted-color, #71717a); font-size: 0.82rem; }
    .small { font-size: 0.78rem; }
    .desc { max-width: 42ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row-crit > td { background: rgba(220,38,38,0.06); }
    .sevb { font-size: 0.72rem; font-weight: 800; border-radius: 999px; padding: 0.12rem 0.6rem; }
    .sevb.leve { color: #374151; background: #e5e7eb; }
    .sevb.inter { color: #92400e; background: #fde68a; }
    .sevb.crit { color: #fff; background: #dc2626; }
    .rv { display: flex; flex-direction: column; gap: 1rem; }
    .rv-report { border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 10px; padding: 0.8rem; }
    .rv-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .rv-top strong { font-size: 1rem; }
    .rv-meta { color: var(--p-text-muted-color, #71717a); font-size: 0.82rem; margin-top: 0.3rem; display: flex; gap: 0.3rem; flex-wrap: wrap; }
    .rv-desc { margin: 0.5rem 0 0; font-size: 0.9rem; }
    .rv-photo { max-width: 180px; max-height: 140px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; margin-top: 0.5rem; }
    .rv-form { display: flex; flex-direction: column; gap: 0.5rem; }
    .rv-form label { font-size: 0.82rem; font-weight: 700; }
    .rv-form textarea, .rv-form input[pInputText] { width: 100%; }
    .rv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
    .rv-grid > div { display: flex; flex-direction: column; gap: 0.3rem; }
    .rv-up-row { display: flex; align-items: center; gap: 0.6rem; }
    .rv-up { display: inline-flex; align-items: center; gap: 0.4rem; background: var(--p-content-hover-background, #f3f4f6); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 8px; padding: 0.4rem 0.7rem; font-size: 0.8rem; cursor: pointer; }
    .rv-thumb { width: 42px; height: 42px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; }
    .rv-rm { border: 0; background: transparent; color: #dc2626; cursor: pointer; }
    .rv-resolution { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 0.8rem; }
    .rv-rhead { font-weight: 800; color: #15803d; display: flex; align-items: center; gap: 0.4rem; }
    :host ::ng-deep .w-full { width: 100%; }
    :host ::ng-deep .rv-grid .p-inputnumber { width: 100%; }
  `],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class MaintenanceComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Maintenance[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusFilter = signal<St | 'ALL' | 'PENDING'>('PENDING');
  readonly search = signal('');

  readonly current = signal<Maintenance | null>(null);
  readonly mode = signal<'resolve' | 'view'>('view');
  dialogVisible = false;
  form: ResolveForm = { resolutionNotes: '', repairedBy: '', cost: null, resolutionPhoto: null };

  readonly canResolve = this.auth.can('maintenance', 'approve');
  readonly canDelete = this.auth.can('operations', 'delete');

  readonly statusFilterOpts = [
    { label: 'Pendientes (sin resolver)', value: 'PENDING' },
    { label: 'Todos', value: 'ALL' },
    { label: 'Pendiente', value: 'OPEN' },
    { label: 'En atención', value: 'IN_PROGRESS' },
    { label: 'Resuelto', value: 'DONE' },
    { label: 'Anulado', value: 'CANCELLED' },
  ];

  readonly filtered = computed<Maintenance[]>(() => {
    const f = this.statusFilter();
    const q = this.search().trim().toLowerCase();
    return this.items().filter((m) => {
      if (f === 'PENDING') { if (m.status !== 'OPEN' && m.status !== 'IN_PROGRESS') return false; }
      else if (f !== 'ALL') { if (m.status !== f) return false; }
      if (q) {
        const hay = `${m.faultLabel ?? ''} ${m.title} ${m.categoryLabel ?? ''} ${m.roomNumber ?? ''} ${m.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  ngOnInit(): void { this.reload(); }

  meta(s: St) { return META[s]; }
  sevLabel(s: FaultSeverity): string { return { LEVE: 'Leve', INTERMEDIA: 'Intermedia', CRITICA: 'Crítica' }[s]; }

  reload(): void {
    this.loading.set(true);
    this.ops.maintenances.list({ pageSize: 300, sortBy: 'createdAt', sortDir: 'desc' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openResolve(row: Maintenance): void {
    this.current.set(row);
    this.mode.set('resolve');
    this.form = { resolutionNotes: '', repairedBy: '', cost: null, resolutionPhoto: null };
    this.dialogVisible = true;
  }

  openDetail(row: Maintenance): void {
    this.current.set(row);
    this.mode.set('view');
    this.dialogVisible = true;
  }

  onPhoto(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { this.messages.add({ severity: 'warn', summary: 'Imagen muy grande', detail: 'La foto no debe superar 3 MB.' }); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { this.form.resolutionPhoto = reader.result as string; };
    reader.readAsDataURL(file);
  }

  submitResolve(status: 'DONE' | 'CANCELLED'): void {
    const m = this.current();
    if (!m) return;
    if (status === 'DONE' && !this.form.resolutionNotes.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Falta el trabajo realizado', detail: 'Describe la reparación antes de registrar.' });
      return;
    }
    const notes = this.form.resolutionNotes.trim() || (status === 'CANCELLED' ? 'Falla anulada.' : '');
    this.saving.set(true);
    this.ops.resolveFault(m.id, {
      resolutionNotes: notes,
      repairedBy: this.form.repairedBy.trim() || undefined,
      resolutionPhoto: this.form.resolutionPhoto || undefined,
      cost: this.form.cost ?? undefined,
      status,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.dialogVisible = false;
        const still = res.data?.stillBlocked;
        this.messages.add({
          severity: 'success',
          summary: status === 'CANCELLED' ? 'Falla anulada' : 'Falla resuelta',
          detail: still ? 'Quedan otras fallas críticas abiertas: la habitación sigue bloqueada.' : 'La habitación quedó liberada del bloqueo por falla.',
        });
        this.reload();
      },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo resolver.' }); },
    });
  }

  confirmDelete(row: Maintenance): void {
    this.confirm.confirm({
      header: 'Eliminar registro',
      message: `¿Eliminar la falla "${row.faultLabel || row.title}" (Hab. ${row.roomNumber ?? '—'})? Se recalcula el bloqueo de la habitación.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.ops.maintenances.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Registro eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
