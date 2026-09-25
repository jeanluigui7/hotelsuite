import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Schedule { startDay: number; startTime: string; endDay: number; endTime: string; }
interface TypeRule { id: string; name: string; availability: boolean; schedules: Schedule[]; }
interface Config { enabled: boolean; threshold: number; registerReasonAuto: boolean; allowAdminException: boolean; total: number; availableNow: number; types: TypeRule[]; }

const DAYS = [{ v: 1, l: 'Lunes' }, { v: 2, l: 'Martes' }, { v: 3, l: 'Miércoles' }, { v: 4, l: 'Jueves' }, { v: 5, l: 'Viernes' }, { v: 6, l: 'Sábado' }, { v: 7, l: 'Domingo' }];

@Component({
  selector: 'app-bloqueo-tarifa',
  standalone: true,
  imports: [FormsModule, ToggleSwitchModule, InputNumberModule, ButtonModule, DialogModule, SelectModule],
  template: `
    <section class="wrap">
      <header class="top">
        <div><h1>Tarifa Personalizada <small>Regla de bloqueo</small></h1><p class="sub">Controla cuándo Recepción puede utilizar una tarifa personalizada.</p></div>
        @if (canEdit) { <button class="save" [disabled]="saving()" (click)="save()"><i class="pi pi-check"></i> Guardar cambios</button> }
      </header>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else if (cfg()) {
        @let c = cfg()!;
        <!-- Bloque general -->
        <article class="block accent">
          <h2><i class="pi pi-lock"></i> Bloqueo general y disponibilidad</h2>
          <p class="desc">Define cuándo Recepción puede utilizar una tarifa personalizada.</p>
          <div class="sw-row"><p-toggleswitch [(ngModel)]="c.enabled" [disabled]="!canEdit" /><div><strong>Activar bloqueo de tarifa personalizada</strong><small class="block">Recepción utiliza las tarifas habituales, salvo las excepciones configuradas.</small></div></div>
          <div class="stats">
            <div class="stat"><i class="pi pi-building"></i><div><small>Total de habitaciones</small><b>{{ c.total }}</b></div></div>
            <div class="stat warn"><i class="pi pi-exclamation-circle"></i><div><small>Disponibles ahora</small><b>{{ c.availableNow }}</b></div></div>
          </div>
          <div class="field"><label>Liberar cuando disponibles ≤</label><p-inputNumber [(ngModel)]="c.threshold" [min]="0" [max]="999" [disabled]="!canEdit" styleClass="w-sm" /><span class="hint">Solo para los tipos habilitados en la tabla.</span></div>
          <div class="sw-row"><p-toggleswitch [(ngModel)]="c.registerReasonAuto" [disabled]="!canEdit" /><div><strong>Registrar motivo automáticamente</strong><small class="block">Guarda si la personalizada se permitió por disponibilidad, horario o autorización administrativa.</small></div></div>
          <div class="sw-row"><p-toggleswitch [(ngModel)]="c.allowAdminException" [disabled]="!canEdit" /><div><strong>Permitir excepción Admin/Gerente</strong><small class="block">Autorización expresa para una operación concreta. Toda autorización queda registrada.</small></div></div>
          <p class="foot-i">Al apagar el bloqueo general, esta restricción deja de aplicarse a todos los tipos.</p>
        </article>

        <!-- Reglas por tipo -->
        <article class="block">
          <h2><i class="pi pi-bed"></i> Reglas por Tipo de Habitación</h2>
          <p class="desc">Cada tipo puede liberarse por disponibilidad o por un horario autorizado.</p>
          <div class="tbl">
            <div class="tr th"><span>TIPO DE HABITACIÓN</span><span class="c">LIBERAR POR DISPONIBILIDAD</span><span>EXCEPCIÓN POR DÍAS Y HORARIOS</span></div>
            @for (t of c.types; track t.id) {
              <div class="tr">
                <span class="tname">{{ t.name }}</span>
                <span class="c"><p-toggleswitch [(ngModel)]="t.availability" [disabled]="!canEdit" /> <em>{{ t.availability ? 'Sí' : 'No' }}</em></span>
                <span class="sched">
                  @if (t.schedules.length) {
                    @for (s of t.schedules; track $index) { <span class="chip">{{ dayL(s.startDay) }} {{ s.startTime }} → {{ dayL(s.endDay) }} {{ s.endTime }}</span> }
                  } @else { <em class="muted">Sin horarios configurados</em> }
                  @if (canEdit) { <button class="add" (click)="openSched(t)"><i class="pi pi-pencil"></i> Editar / + Horario</button> }
                </span>
              </div>
            } @empty { <div class="tr"><span class="muted">No hay tipos de habitación registrados.</span></div> }
          </div>
          <p class="foot-i">Con el bloqueo activo, si no aplica ninguna excepción, la personalizada permanece bloqueada.</p>
        </article>
      }

      <!-- Editor de horarios -->
      <p-dialog [(visible)]="schedVisible" [modal]="true" [header]="'Horarios · ' + (schedType()?.name || '')" [style]="{ width: '34rem', maxWidth: '96vw' }" styleClass="dk">
        @if (schedType(); as t) {
          <div class="sd-list">
            @for (s of t.schedules; track $index) {
              <div class="sd-row"><span>{{ dayL(s.startDay) }} {{ s.startTime }} → {{ dayL(s.endDay) }} {{ s.endTime }}</span><button class="del" (click)="removeSched($index)"><i class="pi pi-trash"></i></button></div>
            } @empty { <p class="muted">Sin horarios. Agrega uno abajo.</p> }
          </div>
          <div class="sd-form">
            <div class="sd-f"><label>Día inicio</label><p-select [(ngModel)]="sForm.startDay" [options]="days" optionLabel="l" optionValue="v" appendTo="body" /></div>
            <div class="sd-f"><label>Hora inicio</label><input type="time" [(ngModel)]="sForm.startTime" /></div>
            <div class="sd-f"><label>Día fin</label><p-select [(ngModel)]="sForm.endDay" [options]="days" optionLabel="l" optionValue="v" appendTo="body" /></div>
            <div class="sd-f"><label>Hora fin</label><input type="time" [(ngModel)]="sForm.endTime" /></div>
            <button class="add2" (click)="addSched()"><i class="pi pi-plus"></i> Agregar horario</button>
          </div>
          <small class="muted">El intervalo se repite cada semana. Inicio inclusivo, fin exclusivo. Permite cruces de medianoche (ej. Sábado 23:00 → Domingo 06:30).</small>
        }
        <ng-template pTemplate="footer"><p-button label="Listo" (onClick)="schedVisible = false" /></ng-template>
      </p-dialog>
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.4rem; max-width: 1200px; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      h1 { margin: 0; font-size: 1.5rem; color: var(--p-text-color); } h1 small { font-size: 0.9rem; color: var(--p-text-muted-color, #64748b); font-weight: 500; }
      .sub { margin: 0.2rem 0 0; color: var(--p-text-muted-color, #64748b); font-size: 0.9rem; }
      .save { display: inline-flex; align-items: center; gap: 0.4rem; background: #22c55e; color: #04130d; border: 0; border-radius: 9px; padding: 0.6rem 1.1rem; font-weight: 800; cursor: pointer; } .save:disabled { opacity: 0.6; cursor: not-allowed; }
      .muted { color: var(--p-text-muted-color, #64748b); }
      .block { background: var(--p-content-background, #0e1626); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 14px; padding: 1.1rem 1.2rem; margin-bottom: 1rem; }
      .block.accent { border-color: #b45309; }
      h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.2rem; font-size: 1.05rem; } h2 .pi { color: #60a5fa; }
      .desc { margin: 0 0 0.9rem; color: var(--p-text-muted-color, #64748b); font-size: 0.86rem; }
      .sw-row { display: flex; align-items: flex-start; gap: 0.75rem; margin-top: 0.9rem; padding-top: 0.9rem; border-top: 1px dashed var(--p-content-border-color, #1c2c44); } .sw-row strong { display: block; } .sw-row small.block { display: block; color: var(--p-text-muted-color, #64748b); font-size: 0.8rem; }
      .stats { display: flex; gap: 0.8rem; margin: 1rem 0; flex-wrap: wrap; }
      .stat { display: flex; align-items: center; gap: 0.6rem; background: rgba(255,255,255,0.03); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 10px; padding: 0.7rem 1rem; flex: 1; min-width: 180px; } .stat .pi { font-size: 1.4rem; color: #60a5fa; } .stat small { display: block; font-size: 0.72rem; color: var(--p-text-muted-color, #64748b); } .stat b { font-size: 1.5rem; } .stat.warn .pi { color: #fbbf24; }
      .field { display: flex; align-items: center; gap: 0.7rem; margin-top: 0.9rem; flex-wrap: wrap; } .field label { font-weight: 600; font-size: 0.9rem; } .hint { color: var(--p-text-muted-color, #64748b); font-size: 0.8rem; }
      :host ::ng-deep .w-sm .p-inputnumber-input { width: 6rem; }
      .foot-i { margin: 0.9rem 0 0; font-size: 0.8rem; font-style: italic; color: var(--p-text-muted-color, #64748b); }
      .tbl { display: flex; flex-direction: column; border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 10px; overflow: hidden; }
      .tr { display: grid; grid-template-columns: 1.3fr 1fr 2fr; gap: 0.8rem; align-items: center; padding: 0.75rem 0.9rem; border-top: 1px solid var(--p-content-border-color, #16202e); } .tr:first-child { border-top: 0; }
      .tr.th { background: rgba(255,255,255,0.03); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.03em; color: var(--p-text-muted-color, #64748b); } .tr.th .c { text-align: left; }
      .tname { font-weight: 700; }
      .c { display: flex; align-items: center; gap: 0.5rem; } .c em { color: var(--p-text-muted-color, #64748b); font-style: normal; font-weight: 600; }
      .sched { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
      .chip { background: rgba(59,130,246,0.14); color: #93c5fd; border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.76rem; font-weight: 600; }
      .add { background: transparent; border: 0; color: #34d399; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; } .add:hover { color: #6ee7b7; }
      .sd-list { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.8rem; } .sd-row { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 8px; padding: 0.5rem 0.7rem; font-weight: 600; } .del { background: none; border: 0; color: #f87171; cursor: pointer; }
      .sd-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; align-items: end; margin-bottom: 0.6rem; } .sd-f { display: flex; flex-direction: column; gap: 0.25rem; } .sd-f label { font-size: 0.74rem; color: var(--p-text-muted-color, #64748b); } .sd-f input[type=time] { background: var(--p-content-background, #0b1220); border: 1px solid var(--p-content-border-color, #26364f); border-radius: 8px; color: var(--p-text-color, #e2e8f0); padding: 0.5rem; }
      .add2 { grid-column: span 2; background: #2563eb; color: #fff; border: 0; border-radius: 9px; padding: 0.55rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }
    `,
  ],
})
export class BloqueoTarifaComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly api = environment.apiUrl;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly cfg = signal<Config | null>(null);
  schedVisible = false;
  readonly schedType = signal<TypeRule | null>(null);
  readonly days = DAYS;
  sForm: Schedule = { startDay: 6, startTime: '23:00', endDay: 7, endTime: '06:30' };
  get canEdit(): boolean { return this.auth.can('settings', 'edit'); }

  constructor() {
    effect(() => { const id = this.auth.activeBranchId(); if (id) this.load(); }, { allowSignalWrites: true });
  }

  dayL(v: number): string { return DAYS.find((d) => d.v === v)?.l ?? String(v); }

  private load(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<Config>>(`${this.api}/custom-rate-block`).subscribe({
      next: (r) => { this.cfg.set(r.data ?? null); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la configuración.' }); },
    });
  }

  openSched(t: TypeRule): void { this.schedType.set(t); this.sForm = { startDay: 6, startTime: '23:00', endDay: 7, endTime: '06:30' }; this.schedVisible = true; }
  addSched(): void {
    const t = this.schedType(); if (!t) return;
    const s = this.sForm;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.endTime)) { this.toast.add({ severity: 'warn', summary: 'Horas inválidas', detail: 'Usa el formato HH:MM.' }); return; }
    if (s.startDay === s.endDay && s.startTime === s.endTime) { this.toast.add({ severity: 'warn', summary: 'Intervalo vacío', detail: 'El inicio y el fin no pueden ser iguales.' }); return; }
    t.schedules.push({ ...s });
  }
  removeSched(i: number): void { const t = this.schedType(); if (t) t.schedules.splice(i, 1); }

  save(): void {
    const c = this.cfg(); if (!c) return;
    this.saving.set(true);
    const types: Record<string, { availability: boolean; schedules: Schedule[] }> = {};
    for (const t of c.types) types[t.id] = { availability: t.availability, schedules: t.schedules };
    const body = { enabled: c.enabled, threshold: c.threshold, registerReasonAuto: c.registerReasonAuto, allowAdminException: c.allowAdminException, types };
    this.http.put<ApiResponse<Config>>(`${this.api}/custom-rate-block`, body).subscribe({
      next: (r) => { this.cfg.set(r.data ?? c); this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Regla de tarifa personalizada actualizada.' }); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
}
