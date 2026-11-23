import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CrudApi, toHttpParams, type ListParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';

export interface BiometricDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  status: 'offline' | 'online' | 'error';
  lastSyncAt?: string | null;
  notes?: string | null;
  realtimeActive?: boolean;
}

export interface DeviceEnrollment {
  id: string;
  deviceId: string;
  userId: string;
  deviceUserId: string;
  name?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BiometricsApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly devices = new CrudApi<BiometricDevice>(this.http, 'biometric-devices');

  test(id: string): Observable<ApiResponse<{ ok: boolean; info: unknown }>> {
    return this.http.post<ApiResponse<{ ok: boolean; info: unknown }>>(`${this.api}/biometric-devices/${id}/test`, {});
  }
  connect(id: string): Observable<ApiResponse<BiometricDevice>> {
    return this.http.post<ApiResponse<BiometricDevice>>(`${this.api}/biometric-devices/${id}/connect`, {});
  }
  disconnect(id: string): Observable<ApiResponse<BiometricDevice>> {
    return this.http.post<ApiResponse<BiometricDevice>>(`${this.api}/biometric-devices/${id}/disconnect`, {});
  }
  enrollments(deviceId: string, params: ListParams = {}): Observable<ApiResponse<DeviceEnrollment[]>> {
    return this.http.get<ApiResponse<DeviceEnrollment[]>>(`${this.api}/biometric-devices/${deviceId}/enrollments`, {
      params: toHttpParams(params),
    });
  }
  enroll(deviceId: string, dto: { userId: string; deviceUserId: string; name?: string }): Observable<ApiResponse<DeviceEnrollment>> {
    return this.http.post<ApiResponse<DeviceEnrollment>>(`${this.api}/biometric-devices/${deviceId}/enrollments`, dto);
  }
  removeEnrollment(deviceId: string, id: string): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.delete<ApiResponse<{ success: boolean }>>(`${this.api}/biometric-devices/${deviceId}/enrollments/${id}`);
  }

  // ── Agente local (el huellero LAN no es alcanzable desde la nube) ──
  agentStatus(id: string): Observable<ApiResponse<{ configured: boolean; lastSeen: string | null }>> {
    return this.http.get<ApiResponse<{ configured: boolean; lastSeen: string | null }>>(`${this.api}/biometric-devices/${id}/agent-status`);
  }
  generateAgentToken(id: string): Observable<ApiResponse<{ token: string; ingestUrl: string }>> {
    return this.http.post<ApiResponse<{ token: string; ingestUrl: string }>>(`${this.api}/biometric-devices/${id}/agent-token`, {});
  }

  // ── ADMS / nube (el huellero empuja sus marcas directo al servidor) ──
  admsStatus(id: string): Observable<ApiResponse<AdmsStatus>> {
    return this.http.get<ApiResponse<AdmsStatus>>(`${this.api}/biometric-devices/${id}/adms-status`);
  }
  bindSerial(id: string, serial: string): Observable<ApiResponse<{ serial: string }>> {
    return this.http.post<ApiResponse<{ serial: string }>>(`${this.api}/biometric-devices/${id}/adms-serial`, { serial });
  }
}

export interface AdmsStatus {
  serial: string | null;
  lastSeen: string | null;
  serverAddress: string;
  detected: { serial: string; at: string } | null;
}
