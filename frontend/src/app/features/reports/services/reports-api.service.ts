import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CrudApi, toHttpParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';

export interface PerformanceItem {
  userId: string;
  name: string;
  role: string;
  cleaningDone: number;
  salesCount: number;
  attendanceCount: number;
}

export interface RoomsReport {
  byStatus: Record<string, number>;
  total: number;
  occupancy: number;
}

export interface HousekeepingReport {
  byStatus: { status: string; count: number }[];
  byResult: { result: string; count: number }[];
}

export interface SalesDetailedItem {
  saleId: string;
  date: string;
  customer: string;
  description: string;
  quantity: number;
  unitPrice: string | number;
  subtotal: string | number;
}

export interface ProductLimitItem {
  id: string;
  name: string;
  stock: number;
  sold30: number;
  avgDaily: number;
  daysOfCover: number | null;
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

export interface InspectionItem {
  id: string;
  date: string | null;
  room: string;
  checklistItem: string;
  passed: boolean;
  note?: string | null;
  inspector: string;
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  readonly laundryTasks = new CrudApi<LaundryTask, LaundryTaskUpsert>(this.http, 'laundry-tasks');

  performance(): Observable<ApiResponse<{ items: PerformanceItem[] }>> {
    return this.http.get<ApiResponse<{ items: PerformanceItem[] }>>(`${this.api}/performance`);
  }

  rooms(): Observable<ApiResponse<RoomsReport>> {
    return this.http.get<ApiResponse<RoomsReport>>(`${this.api}/reports/rooms`);
  }
  housekeeping(): Observable<ApiResponse<HousekeepingReport>> {
    return this.http.get<ApiResponse<HousekeepingReport>>(`${this.api}/reports/housekeeping`);
  }
  salesDetailed(from?: string, to?: string): Observable<ApiResponse<{ items: SalesDetailedItem[] }>> {
    return this.http.get<ApiResponse<{ items: SalesDetailedItem[] }>>(`${this.api}/reports/sales-detailed`, {
      params: toHttpParams({ from, to }),
    });
  }
  productLimit(): Observable<ApiResponse<{ items: ProductLimitItem[] }>> {
    return this.http.get<ApiResponse<{ items: ProductLimitItem[] }>>(`${this.api}/reports/product-limit`);
  }
  inspections(from?: string, to?: string): Observable<ApiResponse<{ items: InspectionItem[] }>> {
    return this.http.get<ApiResponse<{ items: InspectionItem[] }>>(`${this.api}/reports/inspections`, {
      params: toHttpParams({ from, to }),
    });
  }
}
