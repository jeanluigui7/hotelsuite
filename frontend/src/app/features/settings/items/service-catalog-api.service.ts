import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type { LinenArticle, SCCategory, ServiceTipo } from './service-catalog.models';

/** Cliente del catálogo Servicios/Penalidades (jerarquía Categoría → Grupo → Concepto). */
@Injectable({ providedIn: 'root' })
export class ServiceCatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/service-catalog`;

  tree(tipo: ServiceTipo): Observable<ApiResponse<SCCategory[]>> {
    return this.http.get<ApiResponse<SCCategory[]>>(this.base, { params: { tipo } });
  }
  linenArticles(): Observable<ApiResponse<LinenArticle[]>> {
    return this.http.get<ApiResponse<LinenArticle[]>>(`${this.base}/linen-articles`);
  }

  createCategory(body: unknown): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/categories`, body);
  }
  updateCategory(id: string, body: unknown): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.base}/categories/${id}`, body);
  }
  deleteCategory(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/categories/${id}`);
  }

  createGroup(body: unknown): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/groups`, body);
  }
  updateGroup(id: string, body: unknown): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.base}/groups/${id}`, body);
  }
  deleteGroup(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/groups/${id}`);
  }

  createConcept(body: unknown): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/concepts`, body);
  }
  updateConcept(id: string, body: unknown): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.base}/concepts/${id}`, body);
  }
  deleteConcept(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/concepts/${id}`);
  }
}
