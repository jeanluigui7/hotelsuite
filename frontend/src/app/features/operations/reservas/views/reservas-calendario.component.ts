import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ReservasStore } from '../reservas-store.service';
import { RESERVA_ESTADO_META, habitacionesResumen, type Reserva } from '../reservas.model';

type Escala = 'mes' | 'semana' | 'dia';

interface DayCell {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  reservas: Reserva[];
}
interface Lane {
  key: string;
  label: string;
  reservas: Reserva[];
}

const MS_DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_DAY);
/** Lunes de la semana de `d`. */
const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // 0 = lunes
  return addDays(s, -dow);
};

@Component({
  selector: 'app-reservas-calendario',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, SelectModule],
  template: `
    <div class="cal-bar">
      <div class="nav">
        <p-button label="Hoy" severity="secondary" size="small" (onClick)="goToday()" />
        <p-button icon="pi pi-chevron-left" [text]="true" (onClick)="step(-1)" />
        <p-button icon="pi pi-chevron-right" [text]="true" (onClick)="step(1)" />
        <input type="date" [value]="cursorISO()" (change)="pickDate($event)" />
        <strong class="period">{{ periodLabel() }}</strong>
      </div>
      <p-select [options]="escalaOpts" optionLabel="label" optionValue="value" [(ngModel)]="escalaValue" (onChange)="onEscala()" styleClass="esc-sel" />
    </div>

    @if (store.reservas().length === 0) {
      <div class="rv-empty"><i class="pi pi-calendar"></i><p>Sin reservas en este periodo.</p></div>
    }

    <!-- MES -->
    @if (escala() === 'mes') {
      <div class="month">
        @for (d of dows; track d) { <div class="dow">{{ d }}</div> }
        @for (cell of monthCells(); track cell.date.getTime()) {
          <div class="cell" [class.out]="!cell.inMonth" [class.today]="cell.isToday">
            <div class="cell-head">{{ cell.date.getDate() }}</div>
            @for (r of cell.reservas.slice(0, 3); track r.id) {
              <button class="chip" [class]="'st-' + r.estadoReserva" (click)="select.emit(r)" [title]="r.contacto.nombre">
                {{ r.contacto.nombre }}
              </button>
            }
            @if (cell.reservas.length > 3) { <div class="more">Ver {{ cell.reservas.length - 3 }} más</div> }
          </div>
        }
      </div>
    }

    <!-- SEMANA -->
    @if (escala() === 'semana') {
      <div class="grid-scroll">
        <table class="week">
          <thead>
            <tr>
              <th class="lane-col">Habitación</th>
              @for (d of weekDays(); track d.getTime()) {
                <th [class.today]="isToday(d)">{{ d | date: 'EEE dd' }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (lane of weekLanes(); track lane.key) {
              <tr>
                <td class="lane-col">{{ lane.label }}</td>
                @for (d of weekDays(); track d.getTime()) {
                  <td [class.today]="isToday(d)">
                    @for (r of reservasOn(lane, d); track r.id) {
                      <button class="chip" [class]="'st-' + r.estadoReserva" (click)="select.emit(r)">{{ r.contacto.nombre }}</button>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="muted small note"><i class="pi pi-info-circle"></i> Abre una reserva para ver la hora exacta.</p>
    }

    <!-- DÍA -->
    @if (escala() === 'dia') {
      <div class="grid-scroll">
        <div class="day">
          <div class="hours">
            <div class="lane-col"></div>
            @for (h of hours; track h) { <div class="hcol">{{ h }}:00</div> }
          </div>
          @for (lane of dayLanes(); track lane.key) {
            <div class="day-row">
              <div class="lane-col">{{ lane.label }}</div>
              <div class="track">
                @for (h of hours; track h) { <div class="hgrid"></div> }
                @for (r of lane.reservas; track r.id) {
                  <button class="block" [class]="'st-' + r.estadoReserva" [style.left.%]="blockLeft(r)" [style.width.%]="blockWidth(r)" (click)="select.emit(r)">
                    {{ r.contacto.nombre }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </div>
      <p class="muted small note"><i class="pi pi-info-circle"></i> Estadía · Reserva · Preparación se diferencian al conectar con recepción (tanda siguiente).</p>
    }
  `,
  styles: [
    `
      .cal-bar { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
      .nav { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
      .nav input[type='date'] { background: var(--p-content-background, #1e293b); color: inherit; border: 1px solid var(--p-content-border-color, #334155); border-radius: 8px; padding: 0.35rem 0.5rem; }
      .period { text-transform: capitalize; margin-left: 0.3rem; }
      :host ::ng-deep .esc-sel { width: 150px; }
      .note { margin-top: 0.6rem; display: flex; align-items: center; gap: 0.35rem; }

      .month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--p-content-border-color, #334155); border: 1px solid var(--p-content-border-color, #334155); border-radius: 10px; overflow: hidden; }
      .dow { background: var(--p-content-background, #1e293b); padding: 0.4rem; text-align: center; font-size: 0.75rem; color: var(--p-text-muted-color, #94a3b8); text-transform: uppercase; }
      .cell { background: var(--p-content-background, #1e293b); min-height: 92px; padding: 0.3rem; display: flex; flex-direction: column; gap: 2px; }
      .cell.out { opacity: 0.45; }
      .cell.today .cell-head { background: var(--p-primary-color, #34d399); color: #06281d; border-radius: 50%; width: 1.5rem; height: 1.5rem; display: inline-flex; align-items: center; justify-content: center; }
      .cell-head { font-size: 0.8rem; font-weight: 600; }
      .more { font-size: 0.72rem; color: var(--p-primary-color, #34d399); }

      .grid-scroll { overflow-x: auto; }
      table.week { border-collapse: collapse; width: 100%; min-width: 720px; }
      table.week th, table.week td { border: 1px solid var(--p-content-border-color, #334155); padding: 0.35rem; vertical-align: top; min-width: 90px; }
      table.week th { font-size: 0.78rem; color: var(--p-text-muted-color, #94a3b8); font-weight: 600; }
      .lane-col { min-width: 120px; font-size: 0.82rem; color: var(--p-text-muted-color, #94a3b8); background: var(--p-content-background, #1e293b); position: sticky; left: 0; }
      th.today, td.today { background: color-mix(in srgb, var(--p-primary-color, #34d399) 10%, transparent); }

      .chip { display: block; width: 100%; text-align: left; border: none; border-radius: 5px; padding: 0.15rem 0.35rem; margin-bottom: 2px; font-size: 0.72rem; color: #04221a; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

      .day { min-width: 820px; }
      .hours, .day-row { display: grid; grid-template-columns: 120px 1fr; }
      .hours .hcol, .track { border-left: 1px solid var(--p-content-border-color, #334155); }
      .hours { position: relative; }
      .hours > .lane-col + .hcol { display: none; }
      .hours { grid-template-columns: 120px repeat(24, 1fr); }
      .hcol { font-size: 0.66rem; color: var(--p-text-muted-color, #94a3b8); text-align: center; padding: 0.2rem 0; }
      .day-row { align-items: stretch; min-height: 42px; border-top: 1px solid var(--p-content-border-color, #334155); }
      .track { position: relative; }
      .track .hgrid { position: absolute; top: 0; bottom: 0; border-left: 1px solid color-mix(in srgb, var(--p-content-border-color, #334155) 50%, transparent); }
      .track { display: grid; grid-template-columns: repeat(24, 1fr); }
      .block { position: absolute; top: 4px; bottom: 4px; border: none; border-radius: 6px; padding: 0 0.4rem; font-size: 0.72rem; color: #04221a; cursor: pointer; overflow: hidden; white-space: nowrap; z-index: 1; }

      .st-TENTATIVA { background: #fcd34d; }
      .st-CONFIRMADA { background: #34d399; }
      .st-EN_ESTADIA { background: #60a5fa; }
      .st-FINALIZADA { background: #cbd5e1; }
      .st-CANCELADA { background: #fca5a5; text-decoration: line-through; }
      .st-VENCIDA { background: #e2a0f0; }
      .st-NO_SHOW { background: #f87171; }
    `,
  ],
  styleUrls: ['../reservas.styles.scss'],
})
export class ReservasCalendarioComponent {
  readonly store = inject(ReservasStore);
  @Output() select = new EventEmitter<Reserva>();

  readonly escala = signal<Escala>('mes');
  escalaValue: Escala = 'mes';
  readonly cursor = signal<Date>(startOfDay(new Date()));

  readonly dows = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  readonly hours = Array.from({ length: 24 }, (_, i) => i);
  readonly escalaOpts: { label: string; value: Escala }[] = [
    { label: 'Mes', value: 'mes' },
    { label: 'Semana', value: 'semana' },
    { label: 'Día', value: 'dia' },
  ];

  @Input() set escalaInput(v: Escala | null | undefined) {
    if (v && v !== this.escala()) {
      this.escala.set(v);
      this.escalaValue = v;
    }
  }
  /** Permite al shell leer la escala actual para reflejarla en la URL. */
  @Output() escalaChange = new EventEmitter<Escala>();

  cursorISO = computed(() => {
    const d = this.cursor();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  periodLabel = computed(() => {
    const d = this.cursor();
    if (this.escala() === 'dia') return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (this.escala() === 'semana') {
      const s = startOfWeek(d);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}`;
    }
    return d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  });

  isToday(d: Date): boolean {
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }

  /** Reservas que cubren el día `day` (por día de calendario). */
  private coversDay(r: Reserva, day: Date): boolean {
    const d0 = startOfDay(new Date(r.entradaAt)).getTime();
    const d1 = startOfDay(new Date(r.salidaAt)).getTime();
    const t = startOfDay(day).getTime();
    return t >= d0 && t <= d1;
  }

  monthCells = computed<DayCell[]>(() => {
    const d = this.cursor();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const start = startOfWeek(first);
    const cells: DayCell[] = [];
    const all = this.store.reservas();
    for (let i = 0; i < 42; i++) {
      const date = addDays(start, i);
      cells.push({
        date,
        inMonth: date.getMonth() === d.getMonth(),
        isToday: this.isToday(date),
        reservas: all.filter((r) => this.coversDay(r, date)),
      });
    }
    return cells;
  });

  weekDays = computed<Date[]>(() => {
    const s = startOfWeek(this.cursor());
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  });

  private lanesFor(range: Reserva[]): Lane[] {
    const lanes: Lane[] = [];
    const byRoom = new Map<string, Lane>();
    for (const r of range) {
      for (const h of r.habitaciones) {
        if (h.roomId && h.roomNumber) {
          const key = h.roomId;
          if (!byRoom.has(key)) byRoom.set(key, { key, label: `Hab. ${h.roomNumber}`, reservas: [] });
          if (!byRoom.get(key)!.reservas.includes(r)) byRoom.get(key)!.reservas.push(r);
        }
      }
    }
    lanes.push(...[...byRoom.values()].sort((a, b) => a.label.localeCompare(b.label)));
    const sinAsignar = range.filter((r) => r.habitaciones.some((h) => !h.roomId));
    if (sinAsignar.length) lanes.push({ key: '__none', label: 'Sin asignar', reservas: sinAsignar });
    return lanes.length ? lanes : [{ key: '__none', label: 'Sin asignar', reservas: [] }];
  }

  weekLanes = computed<Lane[]>(() => {
    const days = this.weekDays();
    const inRange = this.store.reservas().filter((r) => days.some((d) => this.coversDay(r, d)));
    return this.lanesFor(inRange);
  });

  reservasOn(lane: Lane, day: Date): Reserva[] {
    return lane.reservas.filter((r) => this.coversDay(r, day));
  }

  dayLanes = computed<Lane[]>(() => {
    const day = this.cursor();
    const inRange = this.store.reservas().filter((r) => this.coversDay(r, day));
    return this.lanesFor(inRange);
  });

  blockLeft(r: Reserva): number {
    const day = startOfDay(this.cursor()).getTime();
    const start = new Date(r.entradaAt).getTime();
    const h = start <= day ? 0 : (start - day) / 3600000;
    return Math.max(0, Math.min(23, h)) * (100 / 24);
  }
  blockWidth(r: Reserva): number {
    const day = startOfDay(this.cursor()).getTime();
    const dayEnd = day + MS_DAY;
    const start = Math.max(new Date(r.entradaAt).getTime(), day);
    const end = Math.min(new Date(r.salidaAt).getTime(), dayEnd);
    const hours = Math.max(0.5, (end - start) / 3600000);
    return Math.min(24, hours) * (100 / 24);
  }

  resumen = habitacionesResumen;
  estadoMeta = RESERVA_ESTADO_META;

  goToday(): void { this.cursor.set(startOfDay(new Date())); }
  step(dir: number): void {
    const d = new Date(this.cursor());
    if (this.escala() === 'dia') d.setDate(d.getDate() + dir);
    else if (this.escala() === 'semana') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    this.cursor.set(startOfDay(d));
  }
  pickDate(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    if (v) this.cursor.set(startOfDay(new Date(v + 'T00:00:00')));
  }
  onEscala(): void {
    this.escala.set(this.escalaValue);
    this.escalaChange.emit(this.escalaValue);
  }
}
