import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class PrintingApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  certificate(): Observable<ApiResponse<{ configured: boolean; certificate: string }>> {
    return this.http.get<ApiResponse<{ configured: boolean; certificate: string }>>(
      `${this.api}/printing/certificate`,
    );
  }

  sign(request: string): Observable<ApiResponse<{ signature: string }>> {
    return this.http.post<ApiResponse<{ signature: string }>>(`${this.api}/printing/sign`, { request });
  }
}
