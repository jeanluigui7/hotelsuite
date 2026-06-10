import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CrudApi } from '../../../core/http/crud-api';

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
  readonly laundryTasks = new CrudApi<LaundryTask, LaundryTaskUpsert>(this.http, 'laundry-tasks');
}
