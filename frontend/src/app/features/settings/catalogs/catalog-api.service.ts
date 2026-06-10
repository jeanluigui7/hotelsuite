import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CrudApi } from '../../../core/http/crud-api';
import type {
  ClientTier,
  CustomRate,
  Guest,
  Rate,
  RoomAttribute,
  RoomType,
} from './catalog.models';

/** Central access point to every catalog REST resource (FASE 2). */
@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);

  readonly roomAttributes = new CrudApi<RoomAttribute>(this.http, 'room-attributes');
  readonly roomTypes = new CrudApi<RoomType>(this.http, 'room-types');
  readonly clientTiers = new CrudApi<ClientTier>(this.http, 'client-tiers');
  readonly guests = new CrudApi<Guest>(this.http, 'guests');
  readonly rates = new CrudApi<Rate>(this.http, 'rates');
  readonly customRates = new CrudApi<CustomRate>(this.http, 'custom-rates');
}
