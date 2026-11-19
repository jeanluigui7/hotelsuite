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
  FaultCatalogCategory,
  HousekeepingTask,
  InspectInput,
  Maintenance,
  MaintenanceUpsert,
  Observation,
  ReportFaultLine,
  ReportFaultsResult,
  ResolveFaultInput,
  Reservation,
  Revision,
  RevisionUpsert,
  Room,
  RoomMapItem,
  RoomStatus,
  Stay,
} from './operations.models';
import type { Anticipo, AvailabilityResult, Proforma, Reserva as ReservaLike, ReservaApiInput, ReservasConfigData } from '../reservas/reservas.model';

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

  // ── Reservas (ETAPA 2: modelo rico) ──
  reservationGet(id: string): Observable<ApiResponse<ReservaLike>> {
    return this.http.get<ApiResponse<ReservaLike>>(`${this.api}/reservations/${id}`);
  }
  reservationCreate(dto: ReservaApiInput): Observable<ApiResponse<ReservaLike>> {
    return this.http.post<ApiResponse<ReservaLike>>(`${this.api}/reservations`, dto);
  }
  reservationUpdate(id: string, dto: ReservaApiInput): Observable<ApiResponse<ReservaLike>> {
    return this.http.put<ApiResponse<ReservaLike>>(`${this.api}/reservations/${id}`, dto);
  }
  reservationStatus(id: string, body: { estado: 'CONFIRMADA' | 'CANCELADA' | 'NO_SHOW' | 'VENCIDA'; motivo?: string }): Observable<ApiResponse<ReservaLike>> {
    return this.http.post<ApiResponse<ReservaLike>>(`${this.api}/reservations/${id}/status`, body);
  }
  reservationCancel(id: string, body: { rooms?: string[]; motivo?: string }): Observable<ApiResponse<ReservaLike>> {
    return this.http.post<ApiResponse<ReservaLike>>(`${this.api}/reservations/${id}/cancel`, body);
  }
  proformaList(): Observable<ApiResponse<Proforma[]>> {
    return this.http.get<ApiResponse<Proforma[]>>(`${this.api}/proformas`);
  }
  proformaCreate(dto: { cliente: string; telefono?: string; habitaciones: number; total?: number | null; validezDias?: number }): Observable<ApiResponse<Proforma>> {
    return this.http.post<ApiResponse<Proforma>>(`${this.api}/proformas`, dto);
  }
  proformaConvert(id: string, body: { reservationId: string }): Observable<ApiResponse<Proforma>> {
    return this.http.post<ApiResponse<Proforma>>(`${this.api}/proformas/${id}/convert`, body);
  }
  reservationAvailability(params: { from: string; to: string; roomTypeId?: string; vehicles?: number; excludeReservationId?: string }): Observable<ApiResponse<AvailabilityResult>> {
    return this.http.get<ApiResponse<AvailabilityResult>>(`${this.api}/reservations/availability`, { params: toHttpParams(params) });
  }
  reservationsConfig(): Observable<ApiResponse<ReservasConfigData>> {
    return this.http.get<ApiResponse<ReservasConfigData>>(`${this.api}/reservations-config`);
  }
  reservationAddPayment(id: string, dto: { importe: number; medio: string; destino?: string; operacion?: string; observacion?: string; fecha?: string }): Observable<ApiResponse<ReservaLike>> {
    return this.http.post<ApiResponse<ReservaLike>>(`${this.api}/reservations/${id}/payments`, dto);
  }
  advanceList(): Observable<ApiResponse<Anticipo[]>> {
    return this.http.get<ApiResponse<Anticipo[]>>(`${this.api}/advances`);
  }
  advanceCreate(dto: { cliente: string; telefono?: string; importe: number; medio?: string; destino?: string; operacion?: string; referencia?: string; observacion?: string; fecha?: string }): Observable<ApiResponse<Anticipo>> {
    return this.http.post<ApiResponse<Anticipo>>(`${this.api}/advances`, dto);
  }
  advanceApply(id: string, dto: { reservationId: string; importe: number }): Observable<ApiResponse<Anticipo>> {
    return this.http.post<ApiResponse<Anticipo>>(`${this.api}/advances/${id}/apply`, dto);
  }

  /** Catálogo de fallas (agrupado por categoría) para el modal "Reportar falla". */
  faultCatalog(): Observable<ApiResponse<FaultCatalogCategory[]>> {
    return this.http.get<ApiResponse<FaultCatalogCategory[]>>(`${this.api}/fault-types/catalog`);
  }

  /** Reporta una o más fallas de una habitación (crea un mantenimiento por cada una). */
  reportFaults(roomId: string, fallas: ReportFaultLine[]): Observable<ApiResponse<ReportFaultsResult>> {
    return this.http.post<ApiResponse<ReportFaultsResult>>(`${this.api}/maintenances/report-fault`, { roomId, fallas });
  }

  /** Resuelve una falla (solo Admin + personal de Mantenimiento). */
  resolveFault(id: string, dto: ResolveFaultInput): Observable<ApiResponse<Maintenance & { stillBlocked: boolean }>> {
    return this.http.post<ApiResponse<Maintenance & { stillBlocked: boolean }>>(`${this.api}/maintenances/${id}/resolve`, dto);
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

  renew(
    stayId: string,
    dto: {
      mode?: 'NIGHTS' | 'HOURS';
      newCheckoutAt?: string;
      nights?: number;
      hours?: number;
      amount: number;
      payments?: { method: string; amount: number; reference?: string }[];
      notes?: string;
      requestCleaning?: boolean;
    },
  ): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/${stayId}/renew`, dto);
  }
  /** Cobra el pendiente de la estancia (abona a sus ventas OPEN / adeudo). */
  payStay(stayId: string, dto: { method: string; amount: number; reference?: string }): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/${stayId}/pay`, dto);
  }
  renewalCleaning(stayId: string, action: 'start' | 'advance' | 'finish' | 'reject'): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/${stayId}/renewal-cleaning/${action}`, {});
  }

  updateStayDetails(
    stayId: string,
    dto: {
      phone?: string;
      vehiclePlate?: string;
      addGuests?: { documentType: string; documentNumber: string; firstName: string; lastName?: string; phone?: string }[];
      removeGuestIds?: string[];
    },
  ): Observable<ApiResponse<Stay>> {
    return this.http.post<ApiResponse<Stay>>(`${this.api}/stays/${stayId}/details`, dto);
  }

  receptionPermissions(): Observable<ApiResponse<{ allowChangeRoom: boolean; allowWriteOff: boolean; allowViewCash: boolean; declareStay: boolean }>> {
    return this.http.get<ApiResponse<{ allowChangeRoom: boolean; allowWriteOff: boolean; allowViewCash: boolean; declareStay: boolean }>>(`${this.api}/reception/permissions`);
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
