import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toHttpParams, type ListParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type {
  CashCurrent,
  CashSession,
  CloseResult,
  CreateSaleInput,
  Sale,
  SessionReport,
} from './finance.models';

@Injectable({ providedIn: 'root' })
export class FinanceApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  cashCurrent(): Observable<ApiResponse<CashCurrent>> {
    return this.http.get<ApiResponse<CashCurrent>>(`${this.api}/cash/current`);
  }
  openCash(dto: { openingAmount: number; notes?: string }): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/cash/open`, dto);
  }
  closeCash(dto: { closingAmount: number; notes?: string }): Observable<ApiResponse<CloseResult>> {
    return this.http.post<ApiResponse<CloseResult>>(`${this.api}/cash/close`, dto);
  }
  addMovement(dto: { type: 'IN' | 'OUT'; amount: number; concept: string }): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/cash/movements`, dto);
  }
  listSessions(params: ListParams = {}): Observable<ApiResponse<CashSession[]>> {
    return this.http.get<ApiResponse<CashSession[]>>(`${this.api}/cash/sessions`, { params: toHttpParams(params) });
  }
  sessionReport(id: string): Observable<ApiResponse<SessionReport>> {
    return this.http.get<ApiResponse<SessionReport>>(`${this.api}/cash/sessions/${id}/report`);
  }

  createSale(input: CreateSaleInput): Observable<ApiResponse<Sale>> {
    return this.http.post<ApiResponse<Sale>>(`${this.api}/sales`, input);
  }
  listSales(params: ListParams = {}): Observable<ApiResponse<Sale[]>> {
    return this.http.get<ApiResponse<Sale[]>>(`${this.api}/sales`, { params: toHttpParams(params) });
  }
  cancelSale(id: string): Observable<ApiResponse<Sale>> {
    return this.http.post<ApiResponse<Sale>>(`${this.api}/sales/${id}/cancel`, {});
  }
}
