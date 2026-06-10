import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CrudApi } from '../../../core/http/crud-api';
import type {
  Area,
  ChecklistItem,
  ClientTier,
  CustomRate,
  Guest,
  InventoryCategory,
  Item,
  LaundryMachine,
  Rate,
  RoomAttribute,
  RoomType,
  Schedule,
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
  readonly areas = new CrudApi<Area>(this.http, 'areas');
  readonly inventoryCategories = new CrudApi<InventoryCategory>(this.http, 'inventory-categories');
  readonly items = new CrudApi<Item>(this.http, 'items');
  readonly schedules = new CrudApi<Schedule>(this.http, 'schedules');
  readonly checklistItems = new CrudApi<ChecklistItem>(this.http, 'checklist-items');
  readonly laundryMachines = new CrudApi<LaundryMachine>(this.http, 'laundry-machines');
}
