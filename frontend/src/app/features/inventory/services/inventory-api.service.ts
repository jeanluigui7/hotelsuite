import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CrudApi } from '../../../core/http/crud-api';
import type { Product, ProductUpsert } from './inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly http = inject(HttpClient);

  readonly products = new CrudApi<Product, ProductUpsert>(this.http, 'products');
}
