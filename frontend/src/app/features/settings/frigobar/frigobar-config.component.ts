import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface FrigoRoom {
  id: string; number: string; type: string; floor: string | null;
  frigobarEnabled: boolean; dotStatus: 'NO_APLICA' | 'SIN_DOTAR' | 'DOTADO' | 'INCOMPLETO'; lastDotacion: string | null;
}
const STATUS_META: Record<string, { label: string; cls: string }> = {
  NO_APLICA: { label: 'No aplica', cls: 'na' },
  SIN_DOTAR: { label: 'Sin dotar', cls: 'sd' },
  DOTADO: { label: 'Dotado', cls: 'ok' },
  INCOMPLETO: { label: 'Incompleto', cls: 'inc' },
};

@Component({
  selector: 'app-frigobar-config',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, SelectModule, InputTextModule, ToggleSwitchModule],
  template: `
    <section class="fg">
      <header class="top">
        <div><h1><i class="pi pi-inbox"></i> Frigobar</h1><p class="sub">Activa o desactiva qué habitaciones participan en el sistema de frigobar.</p></div>
        <div class="acts">
          <button class="btn ghost" [class.on]="onlyFrigo" (click)="onlyFrigo = !onlyFrigo"><i class="pi pi-eye"></i> Ver habitaciones activas</button>
          <button class="btn green" [disabled]="pendingCount() === 0 || busy()" (click)="save()"><i class="pi pi-save"></i> Guardar cambios @if (pendingCount()) { <span class="b">{{ pendingCount() }}</span> }</button>
        </div>
      </header>

      <div class="card">
        <h3>Listado de habitaciones</h3>
        <div class="bar">
          <span class="search"><i class="pi pi-search"></i><input pInputText placeholder="Buscar habitación…" [(ngModel)]="search" /></span>
          <p-select [options]="typeOptions()" [(ngModel)]="typeFilter" placeholder="Tipo de habitación" [showClear]="true" styleClass="dk" />
          <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="statusFilter" placeholder="Estado" [showClear]="true" styleClass="dk" />
          <label class="only"><p-toggleswitch [(ngModel)]="onlyFrigo" /> Solo con frigobar</label>
        </div>

        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Habitación</th><th>Tipo</th><th>Piso</th><th class="c">Tiene frigobar</th><th class="c">Estado de dotación</th><th>Última dotación</th></tr></thead>
            <tbody>
              @for (r of filtered(); track r.id) {
                <tr>
                  <td class="num">{{ r.number }}</td>
                  <td>{{ r.type }}</td>
                  <td>{{ r.floor || '—' }}</td>
                  <td class="c"><p-toggleswitch [ngModel]="enabledOf(r)" (ngModelChange)="toggle(r, $event)" /></td>
                  <td class="c"><span class="badge" [class]="statusCls(r)">{{ statusLabel(r) }}</span></td>
                  <td class="muted">{{ r.lastDotacion ? (r.lastDotacion | date: 'dd/MM/yyyy hh:mm a') : '—' }}</td>
                </tr>
              } @empty { <tr><td colspan="6" class="empty">Sin habitaciones.</td></tr> }
            </tbody>
          </table>
        </div>
        <p class="note"><i class="pi pi-info-circle"></i> Solo las habitaciones con frigobar activo podrán usarse en Primera Dotación y Setear Frigobar.</p>
      </div>
    </section>
  `,
  styles: [
    `
      .fg { padding: 1.4rem; color: #e6eefc; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      h1 { margin: 0; font-size: 1.6rem; display: flex; align-items: center; gap: 0.5rem; } h1 .pi { color: #34d399; }
      .sub { margin: 0.15rem 0 0; color: #8aa0bd; font-size: 0.86rem; }
      .acts { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .btn { display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid #274468; border-radius: 10px; padding: 0.6rem 1rem; font-weight: 700; font-size: 0.85rem; cursor: pointer; background: transparent; color: #cbd5e1; }
      .btn.ghost.on { background: #12314a; color: #7dd3fc; border-color: #2f6f9a; }
      .btn.green { background: linear-gradient(180deg, #10b981, #059669); color: #04130d; border: 0; } .btn.green:disabled { opacity: 0.45; cursor: not-allowed; }
      .btn .b { background: #04130d; color: #6ee7b7; border-radius: 999px; font-size: 0.72rem; font-weight: 800; padding: 0.05rem 0.45rem; }
      .card { background: #0e1a2b; border: 1px solid #1c2c44; border-radius: 14px; padding: 1.1rem; }
      h3 { margin: 0 0 0.8rem; font-size: 1.15rem; }
      .bar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0b1220; border: 1px solid #26364f; border-radius: 10px; padding: 0.5rem 0.9rem; color: #8aa0bd; min-width: 220px; } .search input { background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .only { display: inline-flex; align-items: center; gap: 0.5rem; color: #cbd5e1; font-size: 0.85rem; }
      .tbl-wrap { overflow-x: auto; border: 1px solid #16233a; border-radius: 12px; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.7rem 0.8rem; border-bottom: 1px solid #14233a; text-align: left; font-size: 0.85rem; white-space: nowrap; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; background: #101a2c; }
      .tbl .c { text-align: center; } .tbl .num { font-weight: 800; font-size: 1rem; color: #fff; } .tbl .muted { color: #8aa0bd; }
      .empty { text-align: center; color: #8aa0bd; padding: 1.5rem; }
      .badge { border-radius: 999px; padding: 0.15rem 0.7rem; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; }
      .badge.na { background: #1f2937; color: #94a3b8; } .badge.sd { background: rgba(245,158,11,0.18); color: #fbbf24; }
      .badge.ok { background: rgba(16,185,129,0.18); color: #34d399; } .badge.inc { background: rgba(240,0,24,0.18); color: #f87171; }
      .note { display: flex; align-items: center; gap: 0.45rem; color: #8aa0bd; font-size: 0.82rem; margin: 0.9rem 0 0; } .note .pi { color: #60a5fa; }
      :host ::ng-deep .dk { min-width: 12rem; }
    `,
  ],
})
export class FrigobarConfigComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly rooms = signal<FrigoRoom[]>([]);
  readonly busy = signal(false);
  /** Cambios locales de activación pendientes de guardar (roomId → enabled). */
  readonly pending = signal<Record<string, boolean>>({});
  search = '';
  typeFilter: string | null = null;
  statusFilter: string | null = null;
  onlyFrigo = false;
  readonly statusOptions = [
    { label: 'No aplica', value: 'NO_APLICA' }, { label: 'Sin dotar', value: 'SIN_DOTAR' },
    { label: 'Dotado', value: 'DOTADO' }, { label: 'Incompleto', value: 'INCOMPLETO' },
  ];

  ngOnInit(): void { this.reload(); }
  reload(): void {
    this.http.get<ApiResponse<FrigoRoom[]>>(`${this.api}/frigobar/rooms`).subscribe({
      next: (r) => { this.rooms.set(r.data ?? []); this.pending.set({}); },
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las habitaciones.' }),
    });
  }
  typeOptions(): string[] { return [...new Set(this.rooms().map((r) => r.type))].sort((a, b) => a.localeCompare(b)); }
  enabledOf(r: FrigoRoom): boolean { const p = this.pending()[r.id]; return p === undefined ? r.frigobarEnabled : p; }
  toggle(r: FrigoRoom, v: boolean): void {
    const p = { ...this.pending() };
    if (v === r.frigobarEnabled) delete p[r.id]; else p[r.id] = v; // solo guarda diferencias reales
    this.pending.set(p);
  }
  pendingCount(): number { return Object.keys(this.pending()).length; }
  statusLabel(r: FrigoRoom): string {
    // Si se acaba de activar/desactivar localmente, refleja "No aplica" / "Sin dotar" al instante.
    if (!this.enabledOf(r)) return STATUS_META['NO_APLICA'].label;
    if (r.dotStatus === 'NO_APLICA') return STATUS_META['SIN_DOTAR'].label;
    return STATUS_META[r.dotStatus].label;
  }
  statusCls(r: FrigoRoom): string {
    if (!this.enabledOf(r)) return 'badge na';
    if (r.dotStatus === 'NO_APLICA') return 'badge sd';
    return 'badge ' + STATUS_META[r.dotStatus].cls;
  }
  filtered(): FrigoRoom[] {
    const q = this.search.trim().toLowerCase();
    return this.rooms().filter((r) => {
      if (q && !(r.number.toLowerCase().includes(q) || r.type.toLowerCase().includes(q))) return false;
      if (this.typeFilter && r.type !== this.typeFilter) return false;
      if (this.statusFilter && r.dotStatus !== this.statusFilter) return false;
      if (this.onlyFrigo && !this.enabledOf(r)) return false;
      return true;
    });
  }
  save(): void {
    const changes = Object.entries(this.pending()).map(([roomId, enabled]) => ({ roomId, enabled }));
    if (!changes.length) return;
    this.busy.set(true);
    this.http.post<ApiResponse<{ updated: number }>>(`${this.api}/frigobar/rooms/bulk`, { rooms: changes }).subscribe({
      next: (r) => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Guardado', detail: `${r.data?.updated ?? changes.length} habitación(es) actualizadas.` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
}
