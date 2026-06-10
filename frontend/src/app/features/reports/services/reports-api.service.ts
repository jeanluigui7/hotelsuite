import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CrudApi } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';

export interface PerformanceItem {
  userId: string;
  name: string;
  role: string;
  cleaningDone: number;
  salesCount: number;
  attendanceCount: number;
}

export interface LaundryTask {
  id: string;
  machineId?: string | null;
  machineName?: string | null;
  description: string;
  status: 'PENDING' | 'WASHING' | 'DONE';
  createdAt: string;
  completedAt?: string | null;
}

export interface LaundryTaskUpsert {
  machineId?: string | null;
  description: string;
  status: 'PENDING' | 'WASHING' | 'DONE';
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  readonly laundryTasks = new CrudApi<LaundryTask, LaundryTaskUpsert>(this.http, 'laundry-tasks');

  performance(): Observable<ApiResponse<{ items: PerformanceItem[] }>> {
    return this.http.get<ApiResponse<{ items: PerformanceItem[] }>>(`${this.api}/performance`);
  }
}
