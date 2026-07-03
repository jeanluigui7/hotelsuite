import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { roleShiftsRepository } from './role-shifts.repository';
import { ROLES, SHIFTS, type SaveRoleShiftsDto } from './role-shifts.schema';

/** Horarios por defecto (basados en la operación típica del hostal). */
const DEFAULTS: Record<string, Record<string, { startTime: string; endTime: string }>> = {
  RECEPCION: {
    MANANA: { startTime: '06:30', endTime: '14:30' },
    TARDE: { startTime: '14:30', endTime: '22:30' },
    NOCHE: { startTime: '22:30', endTime: '06:30' },
  },
  LIMPIEZA: {
    MANANA: { startTime: '07:00', endTime: '15:00' },
    TARDE: { startTime: '15:00', endTime: '23:00' },
    NOCHE: { startTime: '23:00', endTime: '07:00' },
  },
};

function csv(days: number[]): string {
  return [...new Set(days)].sort((a, b) => a - b).join(',');
}

function serialize(r: { role: string; shift: string; startTime: string; endTime: string; toleranceMinutes: number; daysOfWeek: string; status: string }) {
  return {
    role: r.role,
    shift: r.shift,
    startTime: r.startTime,
    endTime: r.endTime,
    toleranceMinutes: r.toleranceMinutes,
    daysOfWeek: r.daysOfWeek ? r.daysOfWeek.split(',').filter(Boolean).map(Number) : [],
    status: r.status,
  };
}

export const roleShiftsService = {
  /** Devuelve los turnos agrupados por rol, sembrando los defaults la primera vez. */
  async list(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    let rows = await roleShiftsRepository.listByBranch(branchId);
    if (rows.length === 0) {
      const seed = [];
      for (const role of ROLES) {
        for (const shift of SHIFTS) {
          const d = DEFAULTS[role][shift];
          seed.push({ branchId, role, shift, startTime: d.startTime, endTime: d.endTime, toleranceMinutes: 5, daysOfWeek: '1,2,3,4,5,6,7', status: 'active' });
        }
      }
      await roleShiftsRepository.createMany(seed);
      rows = await roleShiftsRepository.listByBranch(branchId);
    }
    const order = { MANANA: 0, TARDE: 1, NOCHE: 2 } as Record<string, number>;
    return ROLES.map((role) => ({
      role,
      shifts: rows
        .filter((r) => r.role === role)
        .sort((a, b) => (order[a.shift] ?? 9) - (order[b.shift] ?? 9))
        .map(serialize),
    }));
  },

  /** Guarda (upsert) todos los turnos del formulario. */
  async saveAll(scope: RequestScope, dto: SaveRoleShiftsDto) {
    const branchId = requireActiveBranch(scope);
    for (const s of dto.shifts) {
      await roleShiftsRepository.upsert(branchId, {
        role: s.role,
        shift: s.shift,
        startTime: s.startTime,
        endTime: s.endTime,
        toleranceMinutes: s.toleranceMinutes,
        daysOfWeek: csv(s.daysOfWeek),
        status: s.status,
      });
    }
    return this.list(scope);
  },
};
