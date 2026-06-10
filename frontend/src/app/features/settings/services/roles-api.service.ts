import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

export interface Permission {
  id: string;
  module: string;
  action: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissionIds: string[];
  permissions: Permission[];
}

export interface RoleListItem {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  _count: { permissions: number; users: number };
}

export interface RoleUpsert {
  name: string;
  description?: string;
  permissionIds: string[];
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class RolesApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  private toParams(params: ListParams): HttpParams {
    let p = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        p = p.set(key, String(value));
      }
    }
    return p;
  }

  list(params: ListParams): Observable<ApiResponse<RoleListItem[]>> {
    return this.http.get<ApiResponse<RoleListItem[]>>(`${this.api}/roles`, {
      params: this.toParams(params),
    });
  }

  /** Lightweight list for dropdowns (first 100 roles). */
  options(): Observable<ApiResponse<RoleListItem[]>> {
    return this.list({ pageSize: 100, sortBy: 'name', sortDir: 'asc' });
  }

  getById(id: string): Observable<ApiResponse<Role>> {
    return this.http.get<ApiResponse<Role>>(`${this.api}/roles/${id}`);
  }

  permissions(): Observable<ApiResponse<Permission[]>> {
    return this.http.get<ApiResponse<Permission[]>>(`${this.api}/permissions`);
  }

  create(dto: RoleUpsert): Observable<ApiResponse<Role>> {
    return this.http.post<ApiResponse<Role>>(`${this.api}/roles`, dto);
  }

  update(id: string, dto: Partial<RoleUpsert>): Observable<ApiResponse<Role>> {
    return this.http.put<ApiResponse<Role>>(`${this.api}/roles/${id}`, dto);
  }

  remove(id: string): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.delete<ApiResponse<{ success: boolean }>>(`${this.api}/roles/${id}`);
  }
}
