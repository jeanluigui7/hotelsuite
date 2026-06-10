import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CrudApi, toHttpParams, type ListParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type {
  CreatePurchaseInput,
  ProfitReport,
  Purchase,
  ReorderReport,
  Supplier,
  Valuation,
} from './logistics.models';

@Injectable({ providedIn: 'root' })
export class LogisticsApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly suppliers = new CrudApi<Supplier>(this.http, 'suppliers');

  listPurchases(params: ListParams = {}): Observable<ApiResponse<Purchase[]>> {
    return this.http.get<ApiResponse<Purchase[]>>(`${this.api}/purchases`, { params: toHttpParams(params) });
  }
  createPurchase(input: CreatePurchaseInput): Observable<ApiResponse<Purchase>> {
    return this.http.post<ApiResponse<Purchase>>(`${this.api}/purchases`, input);
  }

  valuation(): Observable<ApiResponse<Valuation>> {
    return this.http.get<ApiResponse<Valuation>>(`${this.api}/logistics/valuation`);
  }
  reorder(): Observable<ApiResponse<ReorderReport>> {
    return this.http.get<ApiResponse<ReorderReport>>(`${this.api}/logistics/reorder`);
  }
  profit(from?: string, to?: string): Observable<ApiResponse<ProfitReport>> {
    return this.http.get<ApiResponse<ProfitReport>>(`${this.api}/logistics/profit`, {
      params: toHttpParams({ from, to }),
    });
  }
}
