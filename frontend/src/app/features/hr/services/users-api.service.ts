import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type { ListParams } from '../../settings/services/roles-api.service';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  status: string;
  role: { id: string; name: string };
  branchIds: string[];
  createdAt: string;
}

export interface UserUpsert {
  name: string;
  email: string;
  password?: string;
  roleId: string;
  status: 'active' | 'inactive';
  branchIds: string[];
}

@Injectable({ providedIn: 'root' })
export class UsersApiService {
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

  list(params: ListParams): Observable<ApiResponse<UserRow[]>> {
    return this.http.get<ApiResponse<UserRow[]>>(`${this.api}/users`, {
      params: this.toParams(params),
    });
  }

  create(dto: UserUpsert): Observable<ApiResponse<UserRow>> {
    return this.http.post<ApiResponse<UserRow>>(`${this.api}/users`, dto);
  }

  update(id: string, dto: Partial<UserUpsert>): Observable<ApiResponse<UserRow>> {
    return this.http.put<ApiResponse<UserRow>>(`${this.api}/users/${id}`, dto);
  }

  remove(id: string): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.delete<ApiResponse<{ success: boolean }>>(`${this.api}/users/${id}`);
  }

  /** Restablece/asigna la contraseña. forceChange=false => clave fija que el admin conoce. */
  resetPassword(id: string, opts?: { password?: string; forceChange?: boolean }): Observable<ApiResponse<{ temporaryPassword: string }>> {
    const body: Record<string, unknown> = {};
    if (opts?.password) body['password'] = opts.password;
    if (opts?.forceChange === false) body['forceChange'] = false;
    return this.http.post<ApiResponse<{ temporaryPassword: string }>>(`${this.api}/users/${id}/reset-password`, body);
  }

  /** Ver la contraseña actual (solo cargo máximo). */
  viewPassword(id: string): Observable<ApiResponse<{ available: boolean; password: string | null }>> {
    return this.http.get<ApiResponse<{ available: boolean; password: string | null }>>(`${this.api}/users/${id}/password`);
  }
}
