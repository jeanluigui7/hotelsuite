import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toHttpParams, type ListParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';

export interface Attendance {
  id: string;
  userId: string;
  userName: string;
  type: 'IN' | 'OUT';
  source: 'MANUAL' | 'BIOMETRIC';
  at: string;
  note?: string | null;
}

export interface ActivityLog {
  id: string;
  createdAt: string;
  activity: string | null;
  area: string | null;
  reference: string | null;
  detail: string | null;
  shift: string | null;
  roomId?: string | null;
  entityId?: string | null;
  userId?: string | null;
  userName?: string | null;
  authorizedByName?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  meta?: Record<string, unknown> | null;
}

// ── Reporte administrativo de Asistencias ──
export interface AttendanceReference {
  role: string;
  shift: string;
  start: string;
  end: string;
  toleranceMinutes: number;
}
export type Situacion = 'PRESENTE' | 'FINALIZADO' | 'FALTA_SALIDA' | 'SIN_ENTRADA' | 'SIN_HORARIO';
export type PuntualidadKind = 'PUNTUAL' | 'TARDE' | 'SIN_CALCULAR' | 'PENDIENTE';

export interface DailyRow {
  key: string;
  userId: string;
  userName: string;
  roleName: string;
  businessDate: string;
  reference: AttendanceReference | null;
  entradaAt: string | null;
  salidaAt: string | null;
  salidaNextDay: boolean;
  situacion: Situacion;
  puntualidad: { kind: PuntualidadKind; lateMinutes: number | null };
  source: 'BIOMETRIC' | 'MANUAL' | 'MIXED' | null;
  isRegularization: boolean;
  note: string | null;
}
export interface DailyResponse {
  rows: DailyRow[];
  indicators: { presentesAhora: number | null; sinEntrada: number; tardanzasRef: number };
}
export interface MonthlyPerson {
  userId: string;
  userName: string;
  roleName: string;
  days: Record<number, string>;
  totals: {
    jornadas: number;
    asistencias: number;
    tardanzasRef: number;
    minutosTardeRef: number;
    marcasPendientes: number;
    descansos: number | null;
    faltasConfirmadas: number | null;
  };
}
export interface MonthlyResponse {
  month: string;
  daysInMonth: number;
  people: MonthlyPerson[];
}

@Injectable({ providedIn: 'root' })
export class HrApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  listAttendances(params: ListParams = {}): Observable<ApiResponse<Attendance[]>> {
    return this.http.get<ApiResponse<Attendance[]>>(`${this.api}/attendances`, { params: toHttpParams(params) });
  }
  createAttendance(dto: { userId: string; type: 'IN' | 'OUT'; note?: string }): Observable<ApiResponse<Attendance>> {
    return this.http.post<ApiResponse<Attendance>>(`${this.api}/attendances`, dto);
  }
  dailyReport(params: { from: string; to?: string; role?: string; shift?: string; userId?: string; search?: string }): Observable<ApiResponse<DailyResponse>> {
    return this.http.get<ApiResponse<DailyResponse>>(`${this.api}/attendances/daily`, { params: toHttpParams(params) });
  }
  monthlyReport(params: { month: string; role?: string; userId?: string; search?: string }): Observable<ApiResponse<MonthlyResponse>> {
    return this.http.get<ApiResponse<MonthlyResponse>>(`${this.api}/attendances/monthly`, { params: toHttpParams(params) });
  }
  listActivity(params: ListParams = {}): Observable<ApiResponse<ActivityLog[]>> {
    return this.http.get<ApiResponse<ActivityLog[]>>(`${this.api}/activity-logs`, { params: toHttpParams(params) });
  }
}
