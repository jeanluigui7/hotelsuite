import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CrudApi, toHttpParams, type ListParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type {
  CheckInInput,
  CheckoutSummary,
  ConciergeRequest,
  ConsumptionInput,
  HousekeepingTask,
  InspectInput,
  Maintenance,
  MaintenanceUpsert,
  Observation,
  Reservation,
  Revision,
  RevisionUpsert,
  Room,
  RoomMapItem,
  RoomStatus,
  Stay,
} from './operations.models';

@Injectable({ providedIn: 'root' })
export class OperationsApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Rooms CRUD (admin). */
  readonly rooms = new CrudApi<Room, Room>(this.http, 'rooms');
  readonly reservations = new CrudApi<Reservation>(this.http, 'reservations');
  readonly observations = new CrudApi<Observation>(this.http, 'observations');
  readonly concierge = new CrudApi<ConciergeRequest>(this.http, 'concierge-requests');
  readonly maintenances = new CrudApi<Maintenance, MaintenanceUpsert>(this.http, 'maintenances');
  readonly revisions = new CrudApi<Revision, RevisionUpsert>(this.http, 'revisions');

  map(): Observable<ApiResponse<RoomMapItem[]>> {
    return this.http.get<ApiResponse<RoomMapItem[]>>(`${this.api}/rooms/map`);
  }

  changeRoomStatus(id: string, status: RoomStatus): Observable<ApiResponse<Room>> {
    return this.http.patch<ApiResponse<Room>>(`${this.api}/rooms/${id}/status`, { status });
  }

  checkIn(input: CheckInInput): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/check-in`, input);
  }

  checkOut(stayId: string, roomStatus: 'CLEANING' | 'FREE' = 'CLEANING'): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/${stayId}/check-out`, { roomStatus });
  }

  changeRoom(stayId: string, destRoomId: string, originStatus: 'CLEANING' | 'FREE'): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/${stayId}/change-room`, { destRoomId, originStatus });
  }

  renew(stayId: string, dto: { amount?: number; chargeNow?: boolean; paymentMethod?: string; requestCleaning?: boolean } = {}): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/${stayId}/renew`, dto);
  }
  renewalCleaningDone(stayId: string): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/${stayId}/renewal-cleaning-done`, {});
  }

  receptionPermissions(): Observable<ApiResponse<{ allowChangeRoom: boolean; allowWriteOff: boolean; allowViewCash: boolean }>> {
    return this.http.get<ApiResponse<{ allowChangeRoom: boolean; allowWriteOff: boolean; allowViewCash: boolean }>>(`${this.api}/reception/permissions`);
  }

  stays(params: ListParams = {}): Observable<ApiResponse<Stay[]>> {
    return this.http.get<ApiResponse<Stay[]>>(`${this.api}/stays`, { params: toHttpParams(params) });
  }

  checkoutSummary(stayId: string): Observable<ApiResponse<CheckoutSummary>> {
    return this.http.get<ApiResponse<CheckoutSummary>>(`${this.api}/stays/${stayId}/checkout-summary`);
  }

  // ── Housekeeping ──
  tasks(params: ListParams = {}): Observable<ApiResponse<HousekeepingTask[]>> {
    return this.http.get<ApiResponse<HousekeepingTask[]>>(`${this.api}/housekeeping-tasks`, {
      params: toHttpParams(params),
    });
  }
  createTask(dto: { roomId: string; assignedToUserId?: string | null; notes?: string }): Observable<ApiResponse<HousekeepingTask>> {
    return this.http.post<ApiResponse<HousekeepingTask>>(`${this.api}/housekeeping-tasks`, dto);
  }
  startTask(id: string): Observable<ApiResponse<HousekeepingTask>> {
    return this.http.post<ApiResponse<HousekeepingTask>>(`${this.api}/housekeeping-tasks/${id}/start`, {});
  }
  completeTask(id: string, consumption: ConsumptionInput[]): Observable<ApiResponse<HousekeepingTask>> {
    return this.http.post<ApiResponse<HousekeepingTask>>(`${this.api}/housekeeping-tasks/${id}/complete`, { consumption });
  }
  inspectTask(id: string, input: InspectInput): Observable<ApiResponse<HousekeepingTask>> {
    return this.http.post<ApiResponse<HousekeepingTask>>(`${this.api}/housekeeping-tasks/${id}/inspect`, input);
  }
}
