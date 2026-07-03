import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { RoleShiftsApiService, type RoleKey, type RoleShift, type ShiftKey } from './role-shifts-api.service';

interface ShiftForm {
  shift: ShiftKey;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  days: boolean[]; // índice 0..6 = LU..DO
  status: 'active' | 'inactive';
}
interface RoleForm {
  role: RoleKey;
  label: string;
  subtitle: string;
  dot: string;
  shifts: ShiftForm[];
}

const DAY_LABELS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
const SHIFT_META: Record<ShiftKey, { label: string; icon: string; cls: string }> = {
  MANANA: { label: 'Mañana', icon: 'pi-sun', cls: 'manana' },
  TARDE: { label: 'Tarde', icon: 'pi-cloud', cls: 'tarde' },
  NOCHE: { label: 'Noche', icon: 'pi-moon', cls: 'noche' },
};
const ROLE_META: Record<RoleKey, { label: string; subtitle: string; dot: string }> = {
  RECEPCION: { label: 'Recepción', subtitle: 'Configure los 3 turnos para el rol de recepción', dot: '#3b82f6' },
  LIMPIEZA: { label: 'Limpieza', subtitle: 'Configure los 3 turnos para el rol de limpieza', dot: '#22c55e' },
};
const SHIFT_ORDER: ShiftKey[] = ['MANANA', 'TARDE', 'NOCHE'];

@Component({
  selector: 'app-role-shifts',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="wrap">
      <header class="head">
        <h1><i class="pi pi-clock"></i> Configuración de Horarios por Rol</h1>
        <p>Define los 3 turnos (Mañana, Tarde, Noche) para cada rol del sistema</p>
      </header>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        @for (r of roles(); track r.role) {
          <div class="role-card" [style.--dot]="r.dot">
            <div class="role-head"><span class="dot"></span><div><h2>{{ r.label }}</h2><p>{{ r.subtitle }}</p></div></div>
            <div class="shifts">
              @for (s of r.shifts; track s.shift) {
                <div class="shift" [class]="meta(s.shift).cls">
                  <div class="shift-head"><i class="pi" [class]="meta(s.shift).icon"></i> {{ meta(s.shift).label }}</div>
                  <div class="shift-body">
                    <div class="times">
                      <label>Entrada<input type="time" [(ngModel)]="s.startTime" /></label>
                      <label>Salida<input type="time" [(ngModel)]="s.endTime" /></label>
                    </div>
                    <label class="tol">Tolerancia (minutos)<input type="number" min="0" max="240" [(ngModel)]="s.toleranceMinutes" /></label>
                    <div class="days">
                      <span class="days-lbl">Días Laborales</span>
                      <div class="days-grid">
                        @for (d of dayLabels; track $index) {
                          <button type="button" class="day" [class.on]="s.days[$index]" (click)="s.days[$index] = !s.days[$index]">{{ d }}</button>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <div class="footer">
          <button class="btn ghost" (click)="volver()"><i class="pi pi-arrow-left"></i> Volver</button>
          <button class="btn save" [disabled]="saving() || !canEdit" (click)="save()"><i class="pi pi-save"></i> {{ saving() ? 'Guardando…' : 'Guardar Configuraciones' }}</button>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.5rem; max-width: 1100px; margin: 0 auto; }
      .head h1 { display: flex; align-items: center; gap: 0.6rem; margin: 0; font-size: 1.6rem; }
      .head h1 .pi-clock { color: #10b981; }
      .head p { color: #8aa0bd; margin: 0.3rem 0 0; }
      .muted { color: #8aa0bd; }
      .role-card { border: 1px solid var(--dot); border-radius: 16px; padding: 1.2rem 1.3rem; margin-top: 1.5rem; background: rgba(255,255,255,0.015); }
      .role-head { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 1rem; }
      .role-head .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--dot); box-shadow: 0 0 8px var(--dot); }
      .role-head h2 { margin: 0; font-size: 1.15rem; } .role-head p { margin: 0.1rem 0 0; color: #8aa0bd; font-size: 0.82rem; }
      .shifts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
      .shift { border: 1px solid #1c2c44; border-radius: 12px; overflow: hidden; background: #0b1220; }
      .shift-head { padding: 0.9rem 1rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem; font-size: 1.05rem; }
      .shift.manana .shift-head { background: linear-gradient(135deg, #f59e0b, #d97706); }
      .shift.tarde .shift-head { background: linear-gradient(135deg, #f87171, #ef4444); }
      .shift.noche .shift-head { background: linear-gradient(135deg, #4f6ef7, #6d3bf5); }
      .shift-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.9rem; }
      .times { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
      label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.72rem; color: #8aa0bd; }
      input[type=time], input[type=number] { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.55rem 0.6rem; font-size: 0.9rem; width: 100%; }
      input:focus { outline: none; border-color: #3b82f6; }
      .days-lbl { font-size: 0.72rem; color: #8aa0bd; display: block; margin-bottom: 0.4rem; }
      .days-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; }
      .day { border: 0; border-radius: 8px; padding: 0.5rem 0; font-weight: 700; font-size: 0.78rem; color: #64748b; background: #16233a; cursor: pointer; transition: all 0.12s; }
      .shift.manana .day.on { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; }
      .shift.tarde .day.on { background: linear-gradient(135deg, #f87171, #ef4444); color: #fff; }
      .shift.noche .day.on { background: linear-gradient(135deg, #4f6ef7, #6d3bf5); color: #fff; }
      .footer { display: flex; justify-content: flex-end; gap: 0.8rem; margin-top: 1.8rem; }
      .btn { display: inline-flex; align-items: center; gap: 0.5rem; border: 0; border-radius: 10px; padding: 0.7rem 1.3rem; font-weight: 700; cursor: pointer; font-size: 0.9rem; }
      .btn.ghost { background: #1e293b; color: #cbd5e1; }
      .btn.save { background: #10b981; color: #04130d; } .btn.save:disabled { opacity: 0.5; cursor: not-allowed; }
      @media (max-width: 820px) { .shifts { grid-template-columns: 1fr; } }
    `,
  ],
})
export class RoleShiftsComponent implements OnInit {
  private readonly api = inject(RoleShiftsApiService);
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);
  private readonly location = inject(Location);

  readonly roles = signal<RoleForm[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dayLabels = DAY_LABELS;
  readonly canEdit = this.auth.can('settings', 'edit');

  ngOnInit(): void { this.reload(); }

  meta(s: ShiftKey) { return SHIFT_META[s]; }

  reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (res) => {
        const groups = res.data ?? [];
        this.roles.set(
          groups.map((g) => {
            const m = ROLE_META[g.role];
            const byShift = new Map(g.shifts.map((s) => [s.shift, s]));
            return {
              role: g.role,
              label: m.label,
              subtitle: m.subtitle,
              dot: m.dot,
              shifts: SHIFT_ORDER.map((sk) => {
                const s = byShift.get(sk);
                const days = Array.from({ length: 7 }, (_, i) => (s?.daysOfWeek ?? []).includes(i + 1));
                return {
                  shift: sk,
                  startTime: s?.startTime ?? '00:00',
                  endTime: s?.endTime ?? '00:00',
                  toleranceMinutes: s?.toleranceMinutes ?? 5,
                  days,
                  status: (s?.status as 'active' | 'inactive') ?? 'active',
                };
              }),
            };
          }),
        );
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los horarios.' }); },
    });
  }

  save(): void {
    const payload: RoleShift[] = [];
    for (const r of this.roles()) {
      for (const s of r.shifts) {
        payload.push({
          role: r.role,
          shift: s.shift,
          startTime: s.startTime,
          endTime: s.endTime,
          toleranceMinutes: Number(s.toleranceMinutes) || 0,
          daysOfWeek: s.days.map((on, i) => (on ? i + 1 : 0)).filter((x) => x > 0),
          status: s.status,
        });
      }
    }
    this.saving.set(true);
    this.api.save(payload).subscribe({
      next: () => { this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Horarios actualizados.' }); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  volver(): void { this.location.back(); }
}
