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
}
