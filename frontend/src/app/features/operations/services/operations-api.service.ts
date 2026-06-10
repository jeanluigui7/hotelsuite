import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CrudApi, toHttpParams, type ListParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type {
  CheckInInput,
  ConciergeRequest,
  Observation,
  Reservation,
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

  stays(params: ListParams = {}): Observable<ApiResponse<Stay[]>> {
    return this.http.get<ApiResponse<Stay[]>>(`${this.api}/stays`, { params: toHttpParams(params) });
  }
}
