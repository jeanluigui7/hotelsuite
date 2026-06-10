import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../models/api-response.model';

export interface ListParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
  [key: string]: string | number | undefined;
}

export function toHttpParams(params: ListParams): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      p = p.set(key, String(value));
    }
  }
  return p;
}

/**
 * Thin typed CRUD client for a REST resource that returns the standard
 * `{ data, meta, error }` envelope. Reused by every catalog screen.
 */
export class CrudApi<T, Upsert = Partial<T>> {
  constructor(
    private readonly http: HttpClient,
    private readonly resource: string,
  ) {}

  private url(suffix = ''): string {
    return `${environment.apiUrl}/${this.resource}${suffix}`;
  }

  list(params: ListParams = {}): Observable<ApiResponse<T[]>> {
    return this.http.get<ApiResponse<T[]>>(this.url(), { params: toHttpParams(params) });
  }

  get(id: string): Observable<ApiResponse<T>> {
    return this.http.get<ApiResponse<T>>(this.url(`/${id}`));
  }

  create(dto: Upsert): Observable<ApiResponse<T>> {
    return this.http.post<ApiResponse<T>>(this.url(), dto);
  }

  update(id: string, dto: Partial<Upsert>): Observable<ApiResponse<T>> {
    return this.http.put<ApiResponse<T>>(this.url(`/${id}`), dto);
  }

  remove(id: string): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.delete<ApiResponse<{ success: boolean }>>(this.url(`/${id}`));
  }
}
