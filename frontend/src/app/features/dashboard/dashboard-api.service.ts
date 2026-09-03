import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../../core/models/api-response.model';

export interface RecepcionSummary {
  rooms: { byStatus: Record<string, number>; total: number; occupancy: number };
  activeStays: number;
  checkInsToday: number;
  checkOutsToday: number;
  pendingCheckouts: number;
  reservationsPending: number;
}

export interface LimpiezaSummary {
  turno: string; // MANANA | TARDE | NOCHE (turno de limpieza actual)
  shiftStart: string;
  realizadasTurno: number; // limpiezas finalizadas en el turno actual
  enEspera: number; // habitaciones pendientes de limpieza (estado actual)
  enCurso: number; // habitaciones con limpieza iniciada (estado actual)
  mantenimiento: number; // habitaciones en mantenimiento (estado actual)
  byStatus: { status: string; count: number }[];
  byResult: { result: string; count: number }[];
  roomsCleaning: number;
  pendingTasks: number;
  pendingInspections: number;
}

export interface CajaSummary {
  open: boolean;
  session?: { id: string; openedAt: string; openingAmount: number };
  paymentsByMethod?: Record<string, number>;
  totalIncome?: number;
  salesCount?: number;
  movements?: { in: number; out: number };
  expectedCash?: number;
}

export interface TurnoSummary {
  open: boolean;
  session?: { id: string; openedAt: string; openingAmount: number; openedBy: string };
  salesCount?: number;
  movementsCount?: number;
  expectedAmount?: number;
}

export interface TurnoView {
  hasSession: boolean;
  turno?: { sessionId: string; cajaNumber: number | null; day: string; shift: string; interval: string; start: string; end: string; user: string; status: string; openedAt: string };
  nav?: { prevSessionId: string | null; nextSessionId: string | null; isCurrent: boolean };
  caja?: {
    paymentsByMethod: Record<string, number>;
    totalIncome: number;
    byConcepto: { hospedaje: number; productos: number; serviciosPenalidades: number; otrosCobros: number };
    conceptoTotal: number;
    expectedCash: number;
    movements: { in: number; out: number };
    openingAmount: number;
  };
  control?: { disponiblesInicio: number | null; alquileresTurno: number; limpiezasTurno: number; checkOutsTurno: number; disponiblesActual: number };
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  recepcion(): Observable<ApiResponse<RecepcionSummary>> {
    return this.http.get<ApiResponse<RecepcionSummary>>(`${this.api}/dashboard/recepcion`);
  }
  limpieza(): Observable<ApiResponse<LimpiezaSummary>> {
    return this.http.get<ApiResponse<LimpiezaSummary>>(`${this.api}/dashboard/limpieza`);
  }
  caja(): Observable<ApiResponse<CajaSummary>> {
    return this.http.get<ApiResponse<CajaSummary>>(`${this.api}/dashboard/caja`);
  }
  turno(): Observable<ApiResponse<TurnoSummary>> {
    return this.http.get<ApiResponse<TurnoSummary>>(`${this.api}/dashboard/turno`);
  }
  turnoView(sessionId?: string): Observable<ApiResponse<TurnoView>> {
    const params: Record<string, string> = {};
    if (sessionId) params['sessionId'] = sessionId;
    return this.http.get<ApiResponse<TurnoView>>(`${this.api}/dashboard/turno-view`, { params });
  }
}
