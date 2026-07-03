import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

export type ShiftKey = 'MANANA' | 'TARDE' | 'NOCHE';
export type RoleKey = 'RECEPCION' | 'LIMPIEZA';

export interface RoleShift {
  role: RoleKey;
  shift: ShiftKey;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  daysOfWeek: number[];
  status: 'active' | 'inactive';
}

export interface RoleShiftGroup {
  role: RoleKey;
  shifts: RoleShift[];
}

@Injectable({ providedIn: 'root' })
export class RoleShiftsApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  list(): Observable<ApiResponse<RoleShiftGroup[]>> {
    return this.http.get<ApiResponse<RoleShiftGroup[]>>(`${this.api}/role-shifts`);
  }
  save(shifts: RoleShift[]): Observable<ApiResponse<RoleShiftGroup[]>> {
    return this.http.put<ApiResponse<RoleShiftGroup[]>>(`${this.api}/role-shifts`, { shifts });
  }
}
