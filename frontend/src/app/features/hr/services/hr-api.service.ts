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
  branchId?: string | null;
  userEmail?: string | null;
  action: string;
  module: string;
  entityId?: string | null;
  summary: string;
  createdAt: string;
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
  listActivity(params: ListParams = {}): Observable<ApiResponse<ActivityLog[]>> {
    return this.http.get<ApiResponse<ActivityLog[]>>(`${this.api}/activity-logs`, { params: toHttpParams(params) });
  }
}
