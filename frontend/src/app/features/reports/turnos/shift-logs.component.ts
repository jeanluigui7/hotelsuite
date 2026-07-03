import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { ShiftLogsApiService, type ShiftLogDetail, type ShiftLogRow } from './shift-logs-api.service';

const ROLE_LABEL: Record<string, string> = { RECEPCION: 'Recepción', LIMPIEZA: 'Limpieza' };
const SHIFT_LABEL: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', NOCHE: 'Noche' };

@Component({
  selector: 'app-shift-logs',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, SelectModule],
  template: `
    <section class="wrap">
      <header class="head">
        <div><h1>Historial de Turnos</h1><p class="muted">Cortes de inventario y actividad por turno (Recepción y Limpieza).</p></div>
        @if (canEdit) {
          <div class="actions">
            <button class="btn recep" (click)="close('RECEPCION')">Cerrar turno Recepción</button>
            <button class="btn limp" (click)="close('LIMPIEZA')">Cerrar turno Limpieza</button>
          </div>
        }
      </header>

      <div class="toolbar">
        <p-select [options]="roleOpts" optionLabel="label" optionValue="value" [(ngModel)]="roleFilter" (onChange)="reload()" styleClass="flt" />
        <span class="muted">{{ rows().length }} corte(s)</span>
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Fecha</th><th>Rol</th><th>Turno</th><th>Cerrado</th><th>Origen</th><th class="ac">Ver</th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td>{{ r.businessDate }}</td>
                <td>{{ roleLabel(r.role) }}</td>
                <td><span class="pill" [class]="r.shift.toLowerCase()">{{ shiftLabel(r.shift) }}</span></td>
                <td>{{ r.closedAt | date: 'dd/MM HH:mm' }} · {{ r.closedByName }}</td>
                <td>{{ r.auto ? 'Automático' : 'Manual' }}</td>
                <td class="ac"><button class="mini" (click)="open(r)">Ver</button></td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">Sin cortes registrados.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>

    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '54rem', maxWidth: '96vw' }" [header]="detailHeader()">
      @if (detail(); as d) {
        @if (d.role === 'LIMPIEZA') {
          <div class="cards">
            <div class="mc"><span>Ropa restante</span><strong>{{ d.snapshot.totals?.rem ?? 0 }}</strong></div>
            <div class="mc"><span>Ropa total</span><strong>{{ d.snapshot.totals?.sum ?? 0 }}</strong></div>
            <div class="mc"><span>Limpiezas</span><strong>{{ d.snapshot.cleaningsDone ?? 0 }}</strong></div>
            <div class="mc"><span>Mantenimientos</span><strong>{{ d.snapshot.maintenances ?? 0 }}</strong></div>
            <div class="mc"><span>Ropa a lavandería</span><strong>{{ d.snapshot.laundryItems ?? 0 }}</strong></div>
          </div>
          @for (f of d.snapshot.floors ?? []; track f.floor) {
            <h4>{{ f.floor }}</h4>
            <table class="tbl mini"><thead><tr><th>Ítem</th><th>Tipo</th><th class="r">Restante</th><th class="r">Total</th></tr></thead>
              <tbody>@for (row of f.rows; track row.name) { <tr><td>{{ row.name }}</td><td>{{ row.type }}</td><td class="r">{{ row.rem }}</td><td class="r">{{ row.sum }}</td></tr> }</tbody>
            </table>
          }
        } @else {
          <div class="cards">
            <div class="mc"><span>Ventas del turno</span><strong>S/ {{ d.snapshot.sales?.total ?? 0 | number: '1.2-2' }}</strong></div>
            <div class="mc"><span># Ventas</span><strong>{{ d.snapshot.sales?.count ?? 0 }}</strong></div>
            <div class="mc"><span>Efectivo</span><strong>S/ {{ d.snapshot.sales?.byMethod?.CASH ?? 0 | number: '1.2-2' }}</strong></div>
            <div class="mc"><span>Yape</span><strong>S/ {{ d.snapshot.sales?.byMethod?.WALLET ?? 0 | number: '1.2-2' }}</strong></div>
            <div class="mc"><span>Solicitudes</span><strong>{{ d.snapshot.requests ?? 0 }}</strong></div>
          </div>
          <h4>Stock de recepción al corte</h4>
          <table class="tbl mini"><thead><tr><th>Producto</th><th class="r">Cantidad</th></tr></thead>
            <tbody>@for (s of d.snapshot.stock ?? []; track s.name) { <tr><td>{{ s.name }}</td><td class="r">{{ s.quantity }}</td></tr> }
              @empty { <tr><td colspan="2" class="empty">Sin stock.</td></tr> }</tbody>
          </table>
        }
      }
    </p-dialog>
  `,
  styles: [
    `
      .wrap { padding: 1.5rem; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
      h1 { margin: 0; font-size: 1.5rem; } .muted { color: #8aa0bd; margin: 0.2rem 0 0; }
      h4 { margin: 1rem 0 0.4rem; color: #8aa0bd; font-size: 0.85rem; }
      .actions { display: flex; gap: 0.6rem; }
      .btn { border: 0; border-radius: 8px; padding: 0.55rem 0.9rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: #fff; }
      .btn.recep { background: #3b82f6; } .btn.limp { background: #22c55e; color: #04130d; }
      .toolbar { display: flex; align-items: center; gap: 1rem; margin: 1rem 0 0.5rem; }
      .tbl-wrap { overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.6rem 0.7rem; border-bottom: 1px solid #1c2c44; text-align: left; font-size: 0.86rem; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.75rem; }
      .tbl .r { text-align: right; } .tbl .ac { text-align: right; }
      .pill { font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.6rem; border-radius: 999px; }
      .pill.manana { background: rgba(245,158,11,0.2); color: #f59e0b; } .pill.tarde { background: rgba(248,113,113,0.2); color: #f87171; } .pill.noche { background: rgba(79,110,247,0.24); color: #93a5f7; }
      .mini { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 7px; padding: 0.3rem 0.7rem; font-size: 0.78rem; cursor: pointer; }
      .empty { text-align: center; color: #8aa0bd; padding: 1.5rem; }
      .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.6rem; margin-bottom: 0.6rem; }
      .mc { background: rgba(255,255,255,0.03); border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.2rem; }
      .mc span { font-size: 0.7rem; color: #8aa0bd; } .mc strong { font-size: 1.05rem; }
      table.mini th, table.mini td { padding: 0.4rem 0.6rem; font-size: 0.82rem; }
      @media (max-width: 720px) { .cards { grid-template-columns: repeat(2, 1fr); } }
    `,
  ],
})
export class ShiftLogsComponent implements OnInit {
  private readonly api = inject(ShiftLogsApiService);
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly rows = signal<ShiftLogRow[]>([]);
  readonly detail = signal<ShiftLogDetail | null>(null);
  detailVisible = false;
  detailRow: ShiftLogRow | null = null;
  roleFilter = '';
  readonly roleOpts = [
    { label: 'Todos los roles', value: '' },
    { label: 'Recepción', value: 'RECEPCION' },
    { label: 'Limpieza', value: 'LIMPIEZA' },
  ];
  readonly canEdit = this.auth.can('operations', 'edit');

  ngOnInit(): void { this.reload(); }

  roleLabel(r: string): string { return ROLE_LABEL[r] ?? r; }
  shiftLabel(s: string): string { return SHIFT_LABEL[s] ?? s; }
  detailHeader(): string {
    const r = this.detailRow;
    return r ? `${this.roleLabel(r.role)} · ${this.shiftLabel(r.shift)} · ${r.businessDate}` : 'Detalle';
  }

  reload(): void {
    this.api.list({ role: this.roleFilter || undefined }).subscribe({
      next: (res) => this.rows.set(res.data ?? []),
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el historial.' }),
    });
  }

  open(r: ShiftLogRow): void {
    this.detailRow = r; this.detail.set(null); this.detailVisible = true;
    this.api.get(r.id).subscribe({ next: (res) => this.detail.set(res.data), error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle.' }) });
  }

  close(role: 'RECEPCION' | 'LIMPIEZA'): void {
    if (!confirm(`¿Cerrar el turno actual de ${this.roleLabel(role)} y grabar el corte?`)) return;
    this.api.close(role).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Corte grabado', detail: 'Turno cerrado.' }); this.reload(); },
      error: (e: { error?: { error?: { message?: string } } }) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cerrar.' }),
    });
  }
}
