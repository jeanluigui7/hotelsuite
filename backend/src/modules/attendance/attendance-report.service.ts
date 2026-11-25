import type { RequestScope } from '../../shared/context';
import { prisma } from '../../config/prisma';
import { requireActiveBranch } from '../../shared/scope';

/**
 * Reporte administrativo de Asistencias (Control diario + Resumen mensual) a partir de DATOS REALES:
 *   - Attendance (marcas físicas IN/OUT: huella o regularización manual).
 *   - WorkShift / CleaningShift = el turno que el trabajador ABRIÓ ese día (fuente del "turno de referencia").
 *   - RoleShift = ventana horaria configurada por rol×turno (RECEPCION/LIMPIEZA × MANANA/TARDE/NOCHE).
 *
 * Reglas (acordadas con el usuario):
 *   - NO existe asignación de horario por trabajador ("Horarios" está apagado). El "turno de referencia"
 *     sale del turno que el trabajador abrió, emparejado con su RoleShift. Sin turno abierto ni RoleShift
 *     → "Sin horario confirmado" y puntualidad "Sin calcular".
 *   - La diferencia entre la entrada física y el inicio del turno de referencia se muestra como dato
 *     ("+8 min"), NUNCA como "tardanza confirmada".
 *   - Una marca omitida nunca genera "Falta confirmada" automática. Sin asignación ni marcas → no se deduce falta.
 *   - El turno nocturno 22:30–06:30 es UNA sola jornada: se emparejan IN→siguiente OUT; la salida lleva su
 *     fecha real y el indicador "+1 día". No se divide ni se duplica.
 */

const PERU_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5 (sin horario de verano)

interface PeruLocal {
  dateKey: string; // YYYY-MM-DD (fecha local Perú)
  minutes: number; // minutos desde medianoche local
  day: number; // día del mes (1..31)
}

/** Convierte un instante UTC a la hora de pared de Perú (UTC-5). */
function peru(d: Date): PeruLocal {
  const local = new Date(d.getTime() - PERU_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = local.getUTCDate();
  const dd = String(day).padStart(2, '0');
  return { dateKey: `${y}-${m}-${dd}`, minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), day };
}

/** Instante UTC del inicio de un día local Perú (YYYY-MM-DD). */
function peruDayStartUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000-05:00`);
}

/** Instante UTC de "YYYY-MM-DD" + "HH:mm" en hora local Perú. */
function peruAt(dateKey: string, hhmm: string): Date {
  return new Date(`${dateKey}T${hhmm}:00.000-05:00`);
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Duración de un turno en minutos (soporta cruce de medianoche). */
function shiftDurationMin(start: string, end: string): number {
  const s = hhmmToMin(start);
  const e = hhmmToMin(end);
  const diff = (e - s + 1440) % 1440;
  return diff === 0 ? 1440 : diff;
}

export type Situacion = 'PRESENTE' | 'FINALIZADO' | 'FALTA_SALIDA' | 'SIN_ENTRADA' | 'SIN_HORARIO';
export type PuntualidadKind = 'PUNTUAL' | 'TARDE' | 'SIN_CALCULAR' | 'PENDIENTE';

export interface DailyRow {
  key: string;
  userId: string;
  userName: string;
  roleName: string;
  businessDate: string;
  reference: { role: string; shift: string; start: string; end: string; toleranceMinutes: number } | null;
  entradaAt: string | null;
  salidaAt: string | null;
  salidaNextDay: boolean;
  situacion: Situacion;
  puntualidad: { kind: PuntualidadKind; lateMinutes: number | null };
  source: 'BIOMETRIC' | 'MANUAL' | 'MIXED' | null;
  isRegularization: boolean;
  note: string | null;
}

interface BuildFilters {
  role?: string;
  shift?: string;
  userId?: string;
  search?: string;
}

const SHIFT_LABEL: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', NOCHE: 'Noche' };

export const attendanceReportService = {
  /** Control diario: una fila por trabajador y jornada en [from, to] (fechas locales Perú YYYY-MM-DD). */
  async daily(scope: RequestScope, from: string, to: string, filters: BuildFilters = {}) {
    const branchId = requireActiveBranch(scope);
    const rows = await buildRows(branchId, from, to, filters);

    // Indicadores. "Presentes ahora" solo si la ventana incluye el día de hoy (no en consultas históricas).
    const todayKey = peru(new Date()).dateKey;
    const includesToday = from <= todayKey && todayKey <= to;
    const presentesAhora = includesToday
      ? rows.filter((r) => r.situacion === 'PRESENTE' && r.businessDate === todayKey).length
      : null;
    const sinEntrada = rows.filter((r) => r.situacion === 'SIN_ENTRADA').length;
    const tardanzasRef = rows.filter((r) => r.puntualidad.kind === 'TARDE').length;

    return { rows, indicators: { presentesAhora, sinEntrada, tardanzasRef } };
  },

  /** Resumen mensual: una fila por persona con calendario del mes + totales (solo datos reales). */
  async monthly(scope: RequestScope, month: string, filters: BuildFilters = {}) {
    // month = YYYY-MM
    const from = `${month}-01`;
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    const rows = await buildRows(requireActiveBranch(scope), from, to, filters);

    const byUser = new Map<string, { userId: string; userName: string; roleName: string; days: Record<number, string>; jornadas: number; asistencias: number; tardanzasRef: number; minutosTardeRef: number; marcasPendientes: number }>();
    for (const r of rows) {
      let u = byUser.get(r.userId);
      if (!u) {
        u = { userId: r.userId, userName: r.userName, roleName: r.roleName, days: {}, jornadas: 0, asistencias: 0, tardanzasRef: 0, minutosTardeRef: 0, marcasPendientes: 0 };
        byUser.set(r.userId, u);
      }
      const day = Number(r.businessDate.slice(8, 10));
      // Prioridad de marca de calendario: TARDE > SIN_ENTRADA > PRESENTE/FINALIZADO.
      const cell = r.situacion === 'SIN_ENTRADA' ? 'SIN_ENTRADA' : r.puntualidad.kind === 'TARDE' ? 'TARDE' : 'PRESENTE';
      if (!u.days[day] || cell === 'TARDE' || (cell === 'SIN_ENTRADA' && u.days[day] === 'PRESENTE')) u.days[day] = cell;
      if (r.situacion === 'SIN_ENTRADA') {
        u.marcasPendientes++;
      } else {
        u.jornadas++;
        u.asistencias++;
        if (r.puntualidad.kind === 'TARDE') {
          u.tardanzasRef++;
          u.minutosTardeRef += r.puntualidad.lateMinutes ?? 0;
        }
        if (r.situacion === 'PRESENTE' || r.situacion === 'FALTA_SALIDA') u.marcasPendientes++;
      }
    }

    const people = [...byUser.values()]
      .sort((a, b) => a.userName.localeCompare(b.userName))
      .map((u) => ({
        userId: u.userId,
        userName: u.userName,
        roleName: u.roleName,
        days: u.days,
        totals: {
          jornadas: u.jornadas,
          asistencias: u.asistencias,
          tardanzasRef: u.tardanzasRef,
          minutosTardeRef: u.minutosTardeRef,
          marcasPendientes: u.marcasPendientes,
          descansos: null as number | null, // no modelado
          faltasConfirmadas: null as number | null, // no modelado (no se deduce)
        },
      }));

    return { month, daysInMonth, people };
  },
};

/** Construye las filas de jornada (compartido por diario y mensual). */
async function buildRows(branchId: string, from: string, to: string, filters: BuildFilters): Promise<DailyRow[]> {
  if (!branchId) return [];
  const windowStart = peruDayStartUtc(from);
  // Hasta el fin del día "to" + 12h para capturar la salida de un turno nocturno iniciado el último día.
  const toEnd = new Date(peruDayStartUtc(to).getTime() + 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);

  const [users, marks, workShifts, cleaningShifts, roleShifts] = await Promise.all([
    prisma.user.findMany({ where: { branches: { some: { branchId } } }, select: { id: true, name: true, role: { select: { name: true } } } }),
    prisma.attendance.findMany({ where: { branchId, at: { gte: windowStart, lt: toEnd } }, orderBy: { at: 'asc' }, select: { id: true, userId: true, type: true, source: true, at: true, note: true } }),
    prisma.workShift.findMany({ where: { branchId, startedAt: { gte: windowStart, lt: toEnd } }, select: { userId: true, shift: true, startedAt: true } }),
    prisma.cleaningShift.findMany({ where: { branchId, openedAt: { gte: windowStart, lt: toEnd } }, select: { userId: true, shiftType: true, openedAt: true } }),
    prisma.roleShift.findMany({ where: { branchId, status: 'active' }, select: { role: true, shift: true, startTime: true, endTime: true, toleranceMinutes: true } }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, { name: u.name, role: u.role?.name ?? '—' }]));
  const roleShiftMap = new Map(roleShifts.map((r) => [`${r.role}|${r.shift}`, r]));

  // Turno abierto por (userId + businessDate del inicio): preferimos WorkShift (RECEPCION) o CleaningShift (LIMPIEZA).
  type OpenedShift = { role: 'RECEPCION' | 'LIMPIEZA'; shift: string };
  const openedByUserDay = new Map<string, OpenedShift>();
  for (const ws of workShifts) {
    const key = `${ws.userId}|${peru(ws.startedAt).dateKey}`;
    if (!openedByUserDay.has(key)) openedByUserDay.set(key, { role: 'RECEPCION', shift: ws.shift });
  }
  for (const cs of cleaningShifts) {
    const key = `${cs.userId}|${peru(cs.openedAt).dateKey}`;
    if (!openedByUserDay.has(key)) openedByUserDay.set(key, { role: 'LIMPIEZA', shift: cs.shiftType });
  }

  const resolveReference = (userId: string, businessDate: string): DailyRow['reference'] => {
    const opened = openedByUserDay.get(`${userId}|${businessDate}`);
    if (!opened) return null;
    const rs = roleShiftMap.get(`${opened.role}|${opened.shift}`);
    if (!rs) return null;
    return { role: opened.role, shift: opened.shift, start: rs.startTime, end: rs.endTime, toleranceMinutes: rs.toleranceMinutes };
  };

  const inWindow = (dateKey: string): boolean => dateKey >= from && dateKey <= to;
  const now = Date.now();
  const rows: DailyRow[] = [];
  const coveredByIn = new Set<string>(); // userId|businessDate con al menos una jornada con entrada

  // 1) Jornadas a partir de las marcas (IN → siguiente OUT), por usuario.
  const byUserMarks = new Map<string, typeof marks>();
  for (const m of marks) {
    const arr = byUserMarks.get(m.userId) ?? [];
    arr.push(m);
    byUserMarks.set(m.userId, arr);
  }

  for (const [userId, arr] of byUserMarks) {
    const uinfo = userMap.get(userId);
    if (!uinfo) continue;
    let i = 0;
    while (i < arr.length) {
      const mk = arr[i];
      if (mk.type !== 'IN') { i++; continue; }
      // Busca el siguiente OUT.
      let j = i + 1;
      while (j < arr.length && arr[j].type !== 'OUT') j++;
      const out = j < arr.length ? arr[j] : null;
      const inLocal = peru(mk.at);
      const businessDate = inLocal.dateKey;
      i = out ? j + 1 : i + 1;
      if (!inWindow(businessDate)) continue;

      coveredByIn.add(`${userId}|${businessDate}`);
      const reference = resolveReference(userId, businessDate);
      const salidaNextDay = !!out && peru(out.at).dateKey !== businessDate;

      // Puntualidad (dato de referencia, no tardanza confirmada).
      let puntualidad: DailyRow['puntualidad'] = { kind: 'SIN_CALCULAR', lateMinutes: null };
      if (reference) {
        const startMin = hhmmToMin(reference.start);
        let entMin = inLocal.minutes;
        // Turno nocturno: si el inicio es tarde en la noche y la entrada cae de madrugada, ajusta +24h.
        if (startMin > hhmmToMin(reference.end) && entMin + 600 < startMin) entMin += 1440;
        const late = entMin - startMin;
        if (late > reference.toleranceMinutes) puntualidad = { kind: 'TARDE', lateMinutes: late };
        else puntualidad = { kind: 'PUNTUAL', lateMinutes: late < 0 ? 0 : late };
      }

      // Situación.
      let situacion: Situacion;
      if (out) situacion = 'FINALIZADO';
      else if (!reference) situacion = 'PRESENTE';
      else {
        const endInstant = peruAt(businessDate, reference.start).getTime() + shiftDurationMin(reference.start, reference.end) * 60000;
        situacion = now > endInstant ? 'FALTA_SALIDA' : 'PRESENTE';
      }
      if (!reference && out) situacion = 'FINALIZADO';

      const srcIn = mk.source;
      const srcOut = out?.source;
      const source: DailyRow['source'] = out ? (srcIn === srcOut ? (srcIn as 'BIOMETRIC' | 'MANUAL') : 'MIXED') : (srcIn as 'BIOMETRIC' | 'MANUAL');
      const isRegularization = mk.source === 'MANUAL' || out?.source === 'MANUAL';
      const note = [mk.note, out?.note].filter(Boolean).join(' · ') || null;

      rows.push({
        key: `${userId}-${businessDate}-${mk.id}`,
        userId,
        userName: uinfo.name,
        roleName: uinfo.role,
        businessDate,
        reference,
        entradaAt: mk.at.toISOString(),
        salidaAt: out ? out.at.toISOString() : null,
        salidaNextDay,
        situacion,
        puntualidad,
        source,
        isRegularization,
        note,
      });
    }
  }

  // 2) "Sin entrada por revisar": turnos ABIERTOS en la ventana sin ninguna jornada con entrada ese día.
  for (const [key, opened] of openedByUserDay) {
    const [userId, businessDate] = key.split('|');
    if (!inWindow(businessDate)) continue;
    if (coveredByIn.has(key)) continue;
    const uinfo = userMap.get(userId);
    if (!uinfo) continue;
    const rs = roleShiftMap.get(`${opened.role}|${opened.shift}`);
    rows.push({
      key: `${userId}-${businessDate}-noin`,
      userId,
      userName: uinfo.name,
      roleName: uinfo.role,
      businessDate,
      reference: rs ? { role: opened.role, shift: opened.shift, start: rs.startTime, end: rs.endTime, toleranceMinutes: rs.toleranceMinutes } : null,
      entradaAt: null,
      salidaAt: null,
      salidaNextDay: false,
      situacion: 'SIN_ENTRADA',
      puntualidad: { kind: 'PENDIENTE', lateMinutes: null },
      source: null,
      isRegularization: false,
      note: null,
    });
  }

  // Filtros en memoria.
  let result = rows;
  if (filters.userId) result = result.filter((r) => r.userId === filters.userId);
  if (filters.role) result = result.filter((r) => r.roleName === filters.role);
  if (filters.shift) result = result.filter((r) => r.reference?.shift === filters.shift);
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    if (q) result = result.filter((r) => r.userName.toLowerCase().includes(q));
  }

  // Orden: por fecha asc, luego por nombre.
  result.sort((a, b) => (a.businessDate === b.businessDate ? a.userName.localeCompare(b.userName) : a.businessDate.localeCompare(b.businessDate)));
  return result;
}

export { SHIFT_LABEL };
