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
interface Falla { category: string; description: string; critical: boolean; }
interface HistRow {
  id: string; room: string; status: string; estado: string; tipo: string; turno: string;
  collaborator: string; minutes: number; createdAt: string; finishedAt: string | null;
  tipoFalla?: string | null; acciones: string[]; observaciones?: string | null; hasPhoto: boolean; fallas: Falla[];
}

const TIPOS = ['Mobiliario', 'Baño', 'Electricidad', 'Plomería', 'Pintura/Paredes', 'Otros'];
const ACCIONES = ['Limpieza de paredes', 'Cambio de foco', 'Reparación de mueble', 'Destape de desagüe', 'Pintura', 'Revisión general'];
const TURNOS: Record<string, { label: string; icon: string; cls: string }> = {
  M: { label: 'Mañana', icon: '🌅', cls: 'm' },
  T: { label: 'Tarde', icon: '🌇', cls: 't' },
  N: { label: 'Noche', icon: '🌙', cls: 'n' },
};

@Component({
  selector: 'app-revisions',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, SelectModule, InputTextModule],
  template: `
    <section class="rv">
      <header class="top">
        <h1><i class="pi pi-wrench"></i> Revisiones de Mantenimiento</h1>
        <div class="filters">
          <p-select [options]="floorOptions()" [(ngModel)]="pisoFilter" (onChange)="page.set(0)" placeholder="Todos los pisos" [showClear]="true" styleClass="dk" />
          <p-select [options]="colabOptions()" [(ngModel)]="colabFilter" (onChange)="page.set(0)" placeholder="Todos los colaboradores" [showClear]="true" styleClass="dk" />
          <p-select [options]="estadoOpts" [(ngModel)]="estadoFilter" (onChange)="page.set(0)" optionLabel="label" optionValue="value" placeholder="Todos los estados" [showClear]="true" styleClass="dk" />
        </div>
      </header>

      <div class="tablewrap">
        <table class="tbl">
          <thead>
            <tr><th>Habitación</th><th>Fecha</th><th>Turno</th><th>Colaborador</th><th>Tiempo</th><th>Tipo de Mantenimiento</th><th>Observación</th><th class="ac">Acciones</th></tr>
          </thead>
          <tbody>
            @for (r of paged(); track r.roomId) {
              <tr [class.occ]="r.occupied">
                <td class="hab"><strong>{{ r.number }}</strong>@if (r.occupied) { <span class="badge">OCUPADA</span> }</td>
                <td class="muted">{{ r.date ? (r.date | date: 'dd/MM/yyyy') : '-' }}</td>
                <td>{{ turnoLabel(r.turno) }}</td>
                <td>{{ r.collaborator }}</td>
                <td class="muted">{{ r.minutes != null ? r.minutes + ' minutos' : '-' }}</td>
                <td>{{ r.tipo }}</td>
                <td class="muted obs">@if (r.observacion) { {{ r.observacion }} } @else { - }</td>
                <td class="ac">
                  <button class="ico play" [disabled]="r.occupied" (click)="openIniMant(r)" [title]="r.occupied ? 'Habitación ocupada: no disponible' : 'Iniciar mantenimiento (cronómetro)'"><i class="pi pi-play"></i></button>
                  <button class="ico eye" (click)="openHistory(r)" title="Ver historial de mantenimiento"><i class="pi pi-eye"></i></button>
                  <button class="ico ok" [disabled]="r.occupied" (click)="quickOk(r)" title="Finalizar - Todo OK"><i class="pi pi-check-circle"></i></button>
                </td>
              </tr>
            } @empty { <tr><td colspan="8" class="muted center">Sin habitaciones.</td></tr> }
          </tbody>
        </table>
      </div>

      @if (filtered().length > pageSize) {
        <div class="pager">
          <span class="info">{{ rangeFrom() }}–{{ rangeTo() }} de {{ filtered().length }}</span>
          <div class="pbtns">
            <button [disabled]="page() === 0" (click)="page.set(page() - 1)"><i class="pi pi-chevron-left"></i></button>
            <span>{{ page() + 1 }} / {{ totalPages() }}</span>
            <button [disabled]="page() + 1 >= totalPages()" (click)="page.set(page() + 1)"><i class="pi pi-chevron-right"></i></button>
          </div>
        </div>
      }
    </section>

    <!-- Iniciar Mantenimiento (selección de tipo) -->
    <p-dialog [(visible)]="iniMantVisible" [modal]="true" [header]="'Iniciar Mantenimiento - Habitación ' + (sel?.number || '')" [style]="{ width: '34rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <p class="sub">Selecciona el tipo de mantenimiento que se realizará en esta habitación</p>
      <button class="type-card" [class.on]="iniTipo === 'PERIODICO'" (click)="iniTipo = 'PERIODICO'">
        <span class="tc-ico"><i class="pi pi-bolt"></i></span>
        <span class="tc-body"><strong>Acción Periódica <span class="dot"></span></strong><small>Mantenimiento programado y acciones rutinarias de limpieza y cuidado</small></span>
      </button>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="iniMantVisible = false" />
        <p-button label="Iniciar" icon="pi pi-play" [loading]="busy()" (onClick)="confirmIniMant()" />
      </ng-template>
    </p-dialog>

    <!-- Finalizar Revisión Periódica (rápida, desde el check) -->
    <p-dialog [(visible)]="iniVisible" [modal]="true" [header]="'Finalizar Revisión Periódica · Hab. ' + (sel?.number || '')" [style]="{ width: '34rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <div class="form">
        <label>Tipo de falla</label>
        <p-select [options]="tipos" [(ngModel)]="tipoFalla" placeholder="Sin falla / OK" [showClear]="true" styleClass="w" />
        <label>Acciones realizadas</label>
        <div class="acc">
          @for (a of acciones; track a) { <label class="chk"><input type="checkbox" [checked]="selAcc.has(a)" (change)="toggleAcc(a)" /> {{ a }}</label> }
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

    <!-- Historial de Mantenimiento de la habitación -->
    <p-dialog [(visible)]="histVisible" [modal]="true" [style]="{ width: '64rem', maxWidth: '96vw' }" styleClass="dk-dialog hist-dlg">
      <ng-template pTemplate="header">
        <div class="hist-head">
          <div><h2>Historial de Mantenimiento - Habitación {{ sel?.number }}</h2><p>Registro completo de mantenimientos preventivos y periódicos.</p></div>
          <span class="estado-actual" [class.malo]="estadoActual() !== 'Bueno'"><i class="pi pi-check-circle"></i> Estado Actual<br><strong>{{ estadoActual() }}</strong></span>
        </div>
      </ng-template>

      <div class="stats">
        <div class="stat"><div class="n">{{ history().length }}</div><div class="l">Total Mantenimientos</div></div>
        <div class="stat"><div class="n blue">{{ countTipo('Preventivo') }}</div><div class="l">Preventivos</div></div>
        <div class="stat"><div class="n purple">{{ countTipo('Periódico') }}</div><div class="l">Periódicos</div></div>
        <div class="stat"><div class="n orange">{{ countConFallas() }}</div><div class="l">Con Fallas</div></div>
        <div class="stat"><div class="n">{{ avgLabel() }}</div><div class="l">Tiempo Promedio</div></div>
      </div>

      <div class="hist-filters">
        <strong>Filtros</strong>
        <div class="hf-row">
          <div class="hf"><label>Colaborador</label><p-select [options]="histColabOptions()" [(ngModel)]="histColab" placeholder="Todos" [showClear]="true" styleClass="w" /></div>
          <div class="hf"><label>Fecha de Inicio</label><input type="date" [(ngModel)]="histStart" /></div>
          <div class="hf"><label>Fecha de Fin</label><input type="date" [(ngModel)]="histEnd" /></div>
        </div>
      </div>

      <div class="tablewrap inner">
        <table class="tbl">
          <thead><tr><th>📅 Fecha</th><th>Turno</th><th>👤 Colaborador</th><th>🕒 Tiempo</th><th>Tipo</th><th>Estado</th><th class="ac">Acciones</th></tr></thead>
          <tbody>
            @for (h of filteredHistory(); track h.id) {
              <tr>
                <td>{{ h.createdAt | date: 'dd MMM. yyyy' }}</td>
                <td><span class="turno" [class]="turnoCls(h.turno)">{{ turnoIcon(h.turno) }} {{ turnoLabel(h.turno) }}</span></td>
                <td>{{ h.collaborator }}</td>
                <td>{{ durLabel(h.minutes) }}</td>
                <td><span class="tipoTag" [class.prev]="h.tipo === 'Preventivo'" [class.per]="h.tipo === 'Periódico'"><i [class]="h.tipo === 'Preventivo' ? 'pi pi-shield' : 'pi pi-bolt'"></i> {{ h.tipo }}</span></td>
                <td><span class="estTag" [class.bueno]="h.estado === 'Bueno'" [class.inter]="h.estado === 'Intermedio'" [class.curso]="h.estado === 'En curso'">{{ estadoIcon(h.estado) }} {{ h.estado }}</span></td>
                <td class="ac"><button class="btn-ver" (click)="openDetail(h)"><i class="pi pi-eye"></i> Ver</button></td>
              </tr>
            } @empty { <tr><td colspan="7" class="muted center">Sin mantenimientos en el rango seleccionado.</td></tr> }
          </tbody>
        </table>
      </div>
    </p-dialog>

    <!-- Detalle de un mantenimiento -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '40rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <ng-template pTemplate="header"><div class="det-head"><i class="pi pi-wrench"></i> <div><h2>Mantenimiento {{ selHist?.tipo }}</h2><p>Detalles completos del registro de mantenimiento</p></div></div></ng-template>
      @if (selHist; as h) {
        <div class="det-meta">
          <div><span>📅 Fecha</span><strong>{{ h.createdAt | date: 'dd MMM. yyyy' }}</strong></div>
          <div><span>👤 Colaborador</span><strong>{{ h.collaborator }}</strong></div>
          <div><span>🕒 Duración</span><strong>{{ durLabel(h.minutes) }}</strong></div>
          <div><span>Turno</span><span class="turno" [class]="turnoCls(h.turno)">{{ turnoIcon(h.turno) }} {{ turnoLabel(h.turno) }}</span></div>
        </div>

        @if (h.fallas.length) {
          <div class="det-alert"><i class="pi pi-exclamation-triangle"></i><div><strong>Se reportaron {{ h.fallas.length }} problema(s)</strong><small>Este mantenimiento detectó fallas que requieren atención</small></div></div>
          <div class="det-fallas">
            <h3><i class="pi pi-exclamation-circle"></i> Fallas Reportadas ({{ h.fallas.length }})</h3>
            @for (f of h.fallas; track $index) {
              <div class="falla">
                <div class="fh"><span class="cat"><i class="pi pi-map-marker"></i> {{ f.category }}</span>@if (f.critical) { <span class="crit">Crítico</span> }</div>
                <div class="fd">{{ f.description }}</div>
              </div>
            }
          </div>
        } @else {
          <div class="det-ok"><i class="pi pi-check-circle"></i> Sin fallas reportadas — habitación en buen estado.</div>
        }

        @if (h.acciones.length) {
          <div class="det-acc"><h3>Acciones realizadas</h3>@for (a of h.acciones; track a) { <span class="acc-chip">{{ a }}</span> }</div>
        }
        @if (h.observaciones) { <div class="det-obs"><h3>Observaciones</h3><p>{{ h.observaciones }}</p></div> }
        @if (h.hasPhoto) { <div class="det-photo"><i class="pi pi-camera"></i> Foto adjunta por el colaborador</div> }
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="detailVisible = false" /></ng-template>
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
      .muted { color: #8aa499; } .center { text-align: center; } .obs { max-width: 220px; }
      .sub { color: #8aa499; margin: 0 0 1rem; }
      .pager { display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 0.2rem; }
      .pager .info { color: #8aa499; font-size: 0.82rem; }
      .pbtns { display: flex; align-items: center; gap: 0.6rem; color: #cdd8e6; font-size: 0.85rem; }
      .pbtns button { width: 2rem; height: 2rem; border-radius: 8px; border: 1px solid #243245; background: #131b27; color: #e6e9ef; cursor: pointer; }
      .pbtns button:disabled { opacity: 0.4; cursor: not-allowed; }
      .tablewrap { overflow-x: auto; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 14px; }
      .tablewrap.inner { background: #0b1320; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.88rem; min-width: 720px; }
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
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }

      /* Iniciar mantenimiento */
      .type-card { width: 100%; display: flex; align-items: center; gap: 1rem; text-align: left; background: linear-gradient(135deg, #2a1a4a, #1c1233); border: 2px solid #6d28d9; border-radius: 14px; padding: 1.2rem; cursor: pointer; color: #fff; }
      .type-card.on { box-shadow: 0 0 0 3px rgba(124,58,237,0.4); }
      .tc-ico { width: 52px; height: 52px; border-radius: 12px; background: #7c3aed; display: grid; place-items: center; font-size: 1.4rem; flex: 0 0 auto; }
      .tc-body strong { display: flex; align-items: center; gap: 0.5rem; font-size: 1.05rem; } .tc-body .dot { width: 8px; height: 8px; border-radius: 50%; background: #a78bfa; }
      .tc-body small { color: #c4b5fd; display: block; margin-top: 0.25rem; }

      /* Historial */
      :host ::ng-deep .hist-dlg .p-dialog-header { padding-bottom: 0.5rem; }
      .hist-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; width: 100%; }
      .hist-head h2 { margin: 0; font-size: 1.3rem; color: #fff; } .hist-head p { margin: 0.2rem 0 0; color: #8aa499; font-size: 0.85rem; }
      .estado-actual { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.4); color: #6ee7b7; border-radius: 10px; padding: 0.5rem 0.9rem; font-size: 0.72rem; text-align: center; white-space: nowrap; }
      .estado-actual strong { font-size: 0.95rem; } .estado-actual.malo { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.4); color: #fcd34d; }
      .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.8rem; margin: 0.6rem 0 1.2rem; }
      .stat { background: #0b1320; border: 1px solid #1f2a3a; border-radius: 12px; padding: 1rem; }
      .stat .n { font-size: 1.7rem; font-weight: 800; color: #fff; } .stat .n.blue { color: #60a5fa; } .stat .n.purple { color: #c4b5fd; } .stat .n.orange { color: #fb923c; }
      .stat .l { color: #8aa499; font-size: 0.8rem; margin-top: 0.2rem; }
      .hist-filters { background: #0b1320; border: 1px solid #1f2a3a; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; }
      .hist-filters > strong { display: block; margin-bottom: 0.7rem; }
      .hf-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.8rem; }
      .hf label { display: block; font-size: 0.8rem; color: #9fb0c3; margin-bottom: 0.3rem; }
      .hf input[type=date] { width: 100%; background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.5rem 0.7rem; }
      :host ::ng-deep .hf .w .p-select { width: 100%; background: #131b27; border-color: #243245; }
      .turno { display: inline-flex; align-items: center; gap: 0.3rem; border-radius: 999px; padding: 0.2rem 0.7rem; font-size: 0.78rem; font-weight: 700; border: 1px solid; }
      .turno.m { color: #60a5fa; border-color: rgba(96,165,250,0.5); background: rgba(96,165,250,0.12); }
      .turno.t { color: #fb923c; border-color: rgba(251,146,60,0.5); background: rgba(251,146,60,0.12); }
      .turno.n { color: #c4b5fd; border-color: rgba(196,181,253,0.5); background: rgba(196,181,253,0.12); }
      .tipoTag { display: inline-flex; align-items: center; gap: 0.35rem; border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.78rem; font-weight: 700; }
      .tipoTag.prev { color: #60a5fa; background: rgba(96,165,250,0.14); } .tipoTag.per { color: #c4b5fd; background: rgba(124,58,237,0.18); }
      .estTag { font-weight: 700; font-size: 0.82rem; } .estTag.bueno { color: #34d399; } .estTag.inter { color: #fbbf24; } .estTag.curso { color: #60a5fa; }
      .btn-ver { display: inline-flex; align-items: center; gap: 0.35rem; background: #1b2433; border: 1px solid #2b3a4f; color: #e6e9ef; border-radius: 8px; padding: 0.4rem 0.8rem; cursor: pointer; font-size: 0.82rem; }
      .btn-ver:hover { background: #243245; }

      /* Detalle */
      .det-head { display: flex; align-items: center; gap: 0.7rem; } .det-head .pi { color: #60a5fa; font-size: 1.3rem; }
      .det-head h2 { margin: 0; font-size: 1.25rem; color: #fff; } .det-head p { margin: 0.1rem 0 0; color: #8aa499; font-size: 0.82rem; }
      .det-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; background: #0b1320; border: 1px solid #1f2a3a; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; }
      .det-meta span { display: block; color: #8aa499; font-size: 0.78rem; margin-bottom: 0.25rem; } .det-meta strong { color: #fff; }
      .det-alert { display: flex; align-items: center; gap: 0.7rem; background: rgba(127,29,29,0.25); border: 1px solid #b91c1c; border-radius: 12px; padding: 1rem; margin-bottom: 0.8rem; }
      .det-alert .pi { color: #f87171; font-size: 1.4rem; } .det-alert strong { color: #fca5a5; } .det-alert small { color: #fca5a5; display: block; }
      .det-fallas { background: #0b1320; border: 1px solid #3a1414; border-radius: 12px; padding: 1rem; }
      .det-fallas h3 { margin: 0 0 0.7rem; color: #f87171; font-size: 0.95rem; }
      .falla { border: 1px solid #2b1a1a; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.5rem; background: rgba(127,29,29,0.08); }
      .fh { display: flex; align-items: center; justify-content: space-between; }
      .fh .cat { color: #60a5fa; font-weight: 700; font-size: 0.85rem; }
      .crit { background: #7f1d1d; color: #fecaca; border: 1px solid #b91c1c; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.72rem; font-weight: 700; }
      .fd { color: #e6e9ef; margin-top: 0.3rem; }
      .det-ok { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.4); color: #6ee7b7; border-radius: 12px; padding: 1rem; }
      .det-acc { margin-top: 1rem; } .det-acc h3, .det-obs h3 { font-size: 0.9rem; color: #cdd8e6; margin: 0 0 0.5rem; }
      .acc-chip { display: inline-block; background: #1b2433; border: 1px solid #2b3a4f; border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.8rem; margin: 0 0.4rem 0.4rem 0; }
      .det-obs { margin-top: 1rem; } .det-obs p { margin: 0; color: #cbd5e1; }
      .det-photo { margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem; color: #93c5fd; background: rgba(37,99,235,0.1); border: 1px solid rgba(37,99,235,0.35); border-radius: 10px; padding: 0.7rem 0.9rem; font-size: 0.85rem; }
      @media (max-width: 760px) { .stats, .hf-row, .det-meta { grid-template-columns: 1fr 1fr; } }
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
  iniMantVisible = false;
  iniTipo: 'PERIODICO' = 'PERIODICO';
  histVisible = false;
  detailVisible = false;
  sel: RevRow | null = null;
  selHist: HistRow | null = null;
  tipoFalla: string | null = null;
  observaciones = '';
  selAcc = new Set<string>();

  histColab: string | null = null;
  histStart = '';
  histEnd = '';

  readonly floorOptions = computed(() => [...new Set(this.rows().map((r) => r.floor).filter((f): f is string => !!f))].sort());
  readonly colabOptions = computed(() => [...new Set(this.rows().map((r) => r.collaborator).filter((c) => c && c !== '-'))].sort());
  readonly histColabOptions = computed(() => [...new Set(this.history().map((h) => h.collaborator).filter((c) => c && c !== '—'))].sort());

  readonly estadoActual = computed<string>(() => {
    const finalized = this.history().filter((h) => h.status !== 'PENDING');
    return finalized.length ? finalized[0].estado : 'Bueno';
  });

  filtered(): RevRow[] {
    let list = this.rows();
    if (this.pisoFilter) list = list.filter((r) => r.floor === this.pisoFilter);
    if (this.colabFilter) list = list.filter((r) => r.collaborator === this.colabFilter);
    if (this.estadoFilter) list = list.filter((r) => r.tipo === this.estadoFilter);
    return list;
  }

  filteredHistory(): HistRow[] {
    let list = this.history();
    if (this.histColab) list = list.filter((h) => h.collaborator === this.histColab);
    if (this.histStart) { const s = new Date(this.histStart).getTime(); list = list.filter((h) => new Date(h.createdAt).getTime() >= s); }
    if (this.histEnd) { const e = new Date(this.histEnd).getTime() + 86_400_000; list = list.filter((h) => new Date(h.createdAt).getTime() <= e); }
    return list;
  }

  readonly pageSize = 10;
  readonly page = signal(0);
  totalPages(): number { return Math.max(1, Math.ceil(this.filtered().length / this.pageSize)); }
  paged(): RevRow[] { const p = Math.min(this.page(), this.totalPages() - 1); return this.filtered().slice(p * this.pageSize, p * this.pageSize + this.pageSize); }
  rangeFrom = (): number => (this.filtered().length === 0 ? 0 : this.page() * this.pageSize + 1);
  rangeTo = (): number => Math.min(this.filtered().length, (this.page() + 1) * this.pageSize);

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<RevRow[]>>(`${this.api}/cleaning/maintenance-revisions`).subscribe((r) => this.rows.set(r.data ?? []));
  }

  turnoLabel(t: string): string { return TURNOS[t]?.label ?? t; }
  turnoIcon(t: string): string { return TURNOS[t]?.icon ?? ''; }
  turnoCls(t: string): string { return TURNOS[t]?.cls ?? 'm'; }
  estadoIcon(e: string): string { return e === 'Bueno' ? '✓' : e === 'Intermedio' ? '⚠' : '⏱'; }
  durLabel(min: number): string { if (min < 60) return `${min} min`; const h = Math.floor(min / 60); return `${h}h ${min % 60}m`; }

  countTipo(t: string): number { return this.history().filter((h) => h.tipo === t).length; }
  countConFallas(): number { return this.history().filter((h) => h.fallas.length > 0).length; }
  avgLabel(): string {
    const hs = this.history();
    if (!hs.length) return '—';
    return this.durLabel(Math.round(hs.reduce((n, h) => n + h.minutes, 0) / hs.length));
  }

  toggleAcc(a: string): void { if (this.selAcc.has(a)) this.selAcc.delete(a); else this.selAcc.add(a); }

  openIniMant(r: RevRow): void {
    if (r.occupied) return;
    this.sel = r;
    this.iniTipo = 'PERIODICO';
    this.iniMantVisible = true;
  }

  confirmIniMant(): void {
    if (!this.sel) return;
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/${this.sel.roomId}/revision-start`, {}).subscribe({
      next: () => { this.busy.set(false); this.iniMantVisible = false; this.toast.add({ severity: 'success', summary: 'Mantenimiento iniciado', detail: `Hab. ${this.sel?.number}: el cronómetro corre. Aparece en Gestión › En revisión de mantenimiento.` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo iniciar.' }); },
    });
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
    if (r.occupied) return;
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/revision`, { roomId: r.roomId, status: 'OK', acciones: [], observaciones: '' }).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Revisión OK', detail: `Hab. ${r.number}` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  openHistory(r: RevRow): void {
    this.sel = r;
    this.history.set([]);
    this.histColab = null; this.histStart = ''; this.histEnd = '';
    this.histVisible = true;
    this.http.get<ApiResponse<HistRow[]>>(`${this.api}/cleaning/revisions`, { params: { roomId: r.roomId } }).subscribe((res) => this.history.set(res.data ?? []));
  }

  openDetail(h: HistRow): void {
    this.selHist = h;
    this.detailVisible = true;
  }
}
