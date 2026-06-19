import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

export interface WhatsAppInstance {
  id: string;
  name: string;
  provider: 'mock' | 'cloud' | 'twilio';
  phoneNumber?: string | null;
  status: 'connected' | 'disconnected';
  config?: string | null;
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  status: string;
}

export interface MessageLog {
  id: string;
  templateId?: string | null;
  to: string;
  body: string;
  status: string;
  createdAt: string;
}

export interface SendInput {
  templateId?: string;
  body?: string;
  to: string;
  variables: Record<string, string>;
}

export const TEMPLATE_VARIABLES = ['cliente', 'habitacion', 'fecha', 'hotel', 'total'];

@Injectable({ providedIn: 'root' })
export class WhatsappApiService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/whatsapp`;

  listInstances(): Observable<ApiResponse<WhatsAppInstance[]>> {
    return this.http.get<ApiResponse<WhatsAppInstance[]>>(`${this.api}/instances`);
  }
  createInstance(dto: Partial<WhatsAppInstance>): Observable<ApiResponse<WhatsAppInstance>> {
    return this.http.post<ApiResponse<WhatsAppInstance>>(`${this.api}/instances`, dto);
  }
  updateInstance(id: string, dto: Partial<WhatsAppInstance>): Observable<ApiResponse<WhatsAppInstance>> {
    return this.http.put<ApiResponse<WhatsAppInstance>>(`${this.api}/instances/${id}`, dto);
  }
  toggleInstance(id: string): Observable<ApiResponse<WhatsAppInstance>> {
    return this.http.post<ApiResponse<WhatsAppInstance>>(`${this.api}/instances/${id}/toggle`, {});
  }
  removeInstance(id: string): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.delete<ApiResponse<{ success: boolean }>>(`${this.api}/instances/${id}`);
  }

  listTemplates(): Observable<ApiResponse<MessageTemplate[]>> {
    return this.http.get<ApiResponse<MessageTemplate[]>>(`${this.api}/templates`);
  }
  createTemplate(dto: Partial<MessageTemplate>): Observable<ApiResponse<MessageTemplate>> {
    return this.http.post<ApiResponse<MessageTemplate>>(`${this.api}/templates`, dto);
  }
  updateTemplate(id: string, dto: Partial<MessageTemplate>): Observable<ApiResponse<MessageTemplate>> {
    return this.http.put<ApiResponse<MessageTemplate>>(`${this.api}/templates/${id}`, dto);
  }
  removeTemplate(id: string): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.delete<ApiResponse<{ success: boolean }>>(`${this.api}/templates/${id}`);
  }

  send(input: SendInput): Observable<ApiResponse<MessageLog>> {
    return this.http.post<ApiResponse<MessageLog>>(`${this.api}/send`, input);
  }
  logs(): Observable<ApiResponse<MessageLog[]>> {
    return this.http.get<ApiResponse<MessageLog[]>>(`${this.api}/logs`);
  }

  getNotifyConfig(): Observable<ApiResponse<{ adminPhone: string }>> {
    return this.http.get<ApiResponse<{ adminPhone: string }>>(`${this.api}/notify-config`);
  }
  setNotifyConfig(adminPhone: string): Observable<ApiResponse<{ adminPhone: string }>> {
    return this.http.put<ApiResponse<{ adminPhone: string }>>(`${this.api}/notify-config`, { adminPhone });
  }
}
