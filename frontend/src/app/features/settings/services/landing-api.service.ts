import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

export interface LandingConfig {
  branchId: string;
  welcome: string;
}

@Injectable({ providedIn: 'root' })
export class LandingApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  get(): Observable<ApiResponse<LandingConfig>> {
    return this.http.get<ApiResponse<LandingConfig>>(`${this.api}/landing/config`);
  }
  update(welcome: string): Observable<ApiResponse<LandingConfig>> {
    return this.http.put<ApiResponse<LandingConfig>>(`${this.api}/landing/config`, { welcome });
  }
}
