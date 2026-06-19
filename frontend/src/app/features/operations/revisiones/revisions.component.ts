import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface RevRow {
  roomId: string; number: string; floor?: string | null; typeName: string;
  occupied: boolean; date: string | null; turno: string; collaborator: string;
  minutes: number | null; tipo: string; observacion: string | null; status: string;
}
interface HistRow { id: string; room: string; status: string; createdAt: string; tipoFalla?: string | null; acciones?: string[]; observaciones?: string | null; }

const TIPOS = ['Mobiliario', 'Baño', 'Electricidad', 'Plomería', 'Pintura/Paredes', 'Otros'];
const ACCIONES = ['Limpieza de paredes', 'Cambio de foco', 'Reparación de mueble', 'Destape de desagüe', 'Pintura', 'Revisión general'];
const TURNOS: Record<string, string> = { M: 'Mañana', T: 'Tarde', N: 'Noche' };

@Component({
  selector: 'app-revisions',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, SelectModule, InputTextModule],
  template: `
    <section class="rv">
      <header class="top">
        <h1><i class="pi pi-wrench"></i> Revisiones de Mantenimiento</h1>
        <div class="filters">
          <p-select [options]="floorOptions()" [(ngModel)]="pisoFilter" placeholder="Todos los pisos" [showClear]="true" styleClass="dk" />
          <p-select [options]="colabOptions()" [(ngModel)]="colabFilter" placeholder="Todos los colaboradores" [showClear]="true" styleClass="dk" />
          <p-select [options]="estadoOpts" [(ngModel)]="estadoFilter" optionLabel="label" optionValue="value" placeholder="Todos los estados" [showClear]="true" styleClass="dk" />
        </div>
      </header>

      <div class="tablewrap">
        <table class="tbl">
          <thead>
            <tr><th>Habitación</th><th>Fecha</th><th>Turno</th><th>Colaborador</th><th>Tiempo</th><th>Tipo de Mantenimiento</th><th>Observación</th><th class="ac">Acciones</th></tr>
          </thead>
          <tbody>
            @for (r of filtered(); track r.roomId) {
              <tr [class.occ]="r.occupied">
                <td class="hab"><strong>{{ r.number }}</strong>@if (r.occupied) { <span class="badge">OCUPADA</span> }</td>
                <td class="muted">{{ r.date ? (r.date | date: 'dd/MM/yyyy') : '-' }}</td>
                <td>{{ turnoLabel(r.turno) }}</td>
                <td>{{ r.collaborator }}</td>
                <td class="muted">{{ r.minutes != null ? r.minutes + ' minutos' : '-' }}</td>
                <td>{{ r.tipo }}</td>
                <td class="muted">{{ r.observacion || '-' }}</td>
                <td class="ac">
                  <button class="ico play" [disabled]="r.occupied" (click)="openIniciar(r)" title="Iniciar revisión"><i class="pi pi-play"></i></button>
                  <button class="ico eye" (click)="openHistory(r)" title="Ver historial"><i class="pi pi-eye"></i></button>
                  <button class="ico ok" [disabled]="r.occupied" (click)="quickOk(r)" title="Finalizar - Todo OK"><i class="pi pi-check-circle"></i></button>
                </td>
              </tr>
            } @empty { <tr><td colspan="8" class="muted center">Sin habitaciones.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>

    <!-- Iniciar / Finalizar Revisión Periódica -->
    <p-dialog [(visible)]="iniVisible" [modal]="true" [header]="'Finalizar Revisión Periódica · Hab. ' + (sel?.number || '')" [style]="{ width: '34rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <div class="form">
        <label>Tipo de falla</label>
        <p-select [options]="tipos" [(ngModel)]="tipoFalla" placeholder="Sin falla / OK" [showClear]="true" styleClass="w" />
        <label>Acciones realizadas</label>
        <div class="acc">
          @for (a of acciones; track a) {
            <label class="chk"><input type="checkbox" [checked]="selAcc.has(a)" (change)="toggleAcc(a)" /> {{ a }}</label>
          }
        </div>
        <label>Observaciones</label>
        <input pInputText [(ngModel)]="observaciones" placeholder="Detalle de la revisión" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="iniVisible = false" />
        <p-button label="Finalizar con observación" severity="warn" icon="pi pi-exclamation-triangle" [loading]="busy()" (onClick)="finalizar('ISSUE')" />
        <p-button label="Finalizar - Todo OK" icon="pi pi-check" [loading]="busy()" (onClick)="finalizar('OK')" />
      </ng-template>
    </p-dialog>

    <!-- Historial -->
    <p-dialog [(visible)]="histVisible" [modal]="true" [header]="'Historial · Hab. ' + (sel?.number || '')" [style]="{ width: '32rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      @for (h of history(); track h.id) {
        <div class="hrow">
          <div class="hh"><strong>{{ h.createdAt | date: 'dd/MM/yy HH:mm' }}</strong>
            <span class="tag" [class.ok]="h.status === 'OK'" [class.issue]="h.status !== 'OK'">{{ h.status === 'OK' ? 'OK' : 'Observación' }}</span>
          </div>
          @if (h.tipoFalla) { <div class="muted">Falla: {{ h.tipoFalla }}</div> }
          @if (h.acciones?.length) { <div class="muted">Acciones: {{ h.acciones?.join(', ') }}</div> }
          @if (h.observaciones) { <div>{{ h.observaciones }}</div> }
        </div>
      } @empty { <p class="muted">Sin revisiones registradas para esta habitación.</p> }
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="histVisible = false" /></ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .rv { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.1rem; }
      h1 { margin: 0; color: #fff; font-size: 1.4rem; display: flex; align-items: center; gap: 0.5rem; }
      h1 .pi { color: #34d399; }
      .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      :host ::ng-deep .dk .p-select { background: #131b27; border-color: #243245; min-width: 170px; }
      .muted { color: #8aa499; } .center { text-align: center; }
      .tablewrap { overflow-x: auto; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 14px; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.88rem; min-width: 820px; }
      .tbl th { text-align: left; padding: 0.85rem 1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; background: #101a28; }
      .tbl td { padding: 0.8rem 1rem; border-bottom: 1px solid #16202e; }
      .tbl tr:last-child td { border-bottom: 0; }
      .tbl tr.occ { background: rgba(127,29,29,0.12); }
      .hab strong { font-size: 1rem; } .badge { background: #b45309; color: #fff; font-size: 0.62rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 999px; margin-left: 0.4rem; }
      .ac { white-space: nowrap; } th.ac { text-align: center; }
      .ico { background: transparent; border: 0; cursor: pointer; font-size: 1rem; padding: 0.3rem 0.4rem; border-radius: 7px; }
      .ico.play { color: #34d399; } .ico.eye { color: #cbd5e1; } .ico.ok { color: #22c55e; }
      .ico:hover:not(:disabled) { background: #1a2333; }
      .ico:disabled { opacity: 0.3; cursor: not-allowed; }
      .form { display: flex; flex-direction: column; gap: 0.5rem; }
      .form label { font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      :host ::ng-deep .form .w .p-select, :host ::ng-deep .form input[pInputText] { width: 100%; }
      .acc { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; }
      .chk { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #cdd8e6; }
      .hrow { border: 1px solid #1f2a3a; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.6rem; }
      .hh { display: flex; align-items: center; justify-content: space-between; }
      .tag { font-size: 0.7rem; font-weight: 700; padding: 0.1rem 0.5rem; border-radius: 999px; }
      .tag.ok { background: #064e3b; color: #6ee7b7; } .tag.issue { background: #7c2d12; color: #fdba74; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class RevisionsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly rows = signal<RevRow[]>([]);
  readonly history = signal<HistRow[]>([]);
  readonly busy = signal(false);
  readonly tipos = TIPOS;
  readonly acciones = ACCIONES;
  readonly estadoOpts = [
    { label: 'Preventivo', value: 'Preventivo' },
    { label: 'Acción Periódica', value: 'Acción Periódica' },
  ];

  pisoFilter: string | null = null;
  colabFilter: string | null = null;
  estadoFilter: string | null = null;

  iniVisible = false;
  histVisible = false;
  sel: RevRow | null = null;
  tipoFalla: string | null = null;
  observaciones = '';
  selAcc = new Set<string>();

  readonly floorOptions = computed(() => [...new Set(this.rows().map((r) => r.floor).filter((f): f is string => !!f))].sort());
  readonly colabOptions = computed(() => [...new Set(this.rows().map((r) => r.collaborator).filter((c) => c && c !== '-'))].sort());

  readonly filtered = computed<RevRow[]>(() => {
    let list = this.rows();
    if (this.pisoFilter) list = list.filter((r) => r.floor === this.pisoFilter);
    if (this.colabFilter) list = list.filter((r) => r.collaborator === this.colabFilter);
    if (this.estadoFilter) list = list.filter((r) => r.tipo === this.estadoFilter);
    return list;
  });

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<RevRow[]>>(`${this.api}/cleaning/maintenance-revisions`).subscribe((r) => this.rows.set(r.data ?? []));
  }

  turnoLabel(t: string): string { return TURNOS[t] ?? t; }

  toggleAcc(a: string): void {
    if (this.selAcc.has(a)) this.selAcc.delete(a);
    else this.selAcc.add(a);
  }

  openIniciar(r: RevRow): void {
    this.sel = r;
    this.tipoFalla = null;
    this.observaciones = '';
    this.selAcc = new Set();
    this.iniVisible = true;
  }

  finalizar(status: 'OK' | 'ISSUE'): void {
    if (!this.sel) return;
    this.busy.set(true);
    const dto = { roomId: this.sel.roomId, status, tipoFalla: this.tipoFalla ?? undefined, acciones: [...this.selAcc], observaciones: this.observaciones || '' };
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/revision`, dto).subscribe({
      next: () => { this.busy.set(false); this.iniVisible = false; this.toast.add({ severity: 'success', summary: 'Revisión registrada', detail: `Hab. ${this.sel?.number}` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar.' }); },
    });
  }

  quickOk(r: RevRow): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/revision`, { roomId: r.roomId, status: 'OK', acciones: [], observaciones: '' }).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Revisión OK', detail: `Hab. ${r.number}` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  openHistory(r: RevRow): void {
    this.sel = r;
    this.history.set([]);
    this.histVisible = true;
    this.http.get<ApiResponse<HistRow[]>>(`${this.api}/cleaning/revisions`, { params: { roomId: r.roomId } }).subscribe((res) => this.history.set(res.data ?? []));
  }
}
