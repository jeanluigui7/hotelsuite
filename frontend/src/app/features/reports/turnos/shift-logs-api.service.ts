import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

export interface ShiftLogRow {
  id: string;
  role: 'RECEPCION' | 'LIMPIEZA';
  shift: 'MANANA' | 'TARDE' | 'NOCHE';
  businessDate: string;
  closedAt: string;
  auto: boolean;
  closedByName: string;
}

export interface ShiftLogDetail {
  id: string;
  role: 'RECEPCION' | 'LIMPIEZA';
  shift: string;
  businessDate: string;
  closedAt: string;
  auto: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: any;
}

@Injectable({ providedIn: 'root' })
export class ShiftLogsApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  list(params: { role?: string; from?: string; to?: string } = {}): Observable<ApiResponse<ShiftLogRow[]>> {
    let qs = '';
    const parts = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
    if (parts.length) qs = '&' + parts.join('&');
    return this.http.get<ApiResponse<ShiftLogRow[]>>(`${this.api}/shift-logs?_=1${qs}`);
  }
  get(id: string): Observable<ApiResponse<ShiftLogDetail>> {
    return this.http.get<ApiResponse<ShiftLogDetail>>(`${this.api}/shift-logs/${id}`);
  }
  close(role: 'RECEPCION' | 'LIMPIEZA'): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/shift-logs/close`, { role });
  }
}
