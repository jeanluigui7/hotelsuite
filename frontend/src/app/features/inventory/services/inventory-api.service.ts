import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CrudApi, toHttpParams, type ListParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type {
  InventoryConfig,
  InventoryMovement,
  Product,
  ProductUpsert,
  Warehouse,
  WarehouseStock,
} from './inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly products = new CrudApi<Product, ProductUpsert>(this.http, 'products');
  readonly warehouses = new CrudApi<Warehouse>(this.http, 'warehouses');

  listMovements(params: ListParams = {}): Observable<ApiResponse<InventoryMovement[]>> {
    return this.http.get<ApiResponse<InventoryMovement[]>>(`${this.api}/movements`, {
      params: toHttpParams(params),
    });
  }
  warehouseStock(id: string): Observable<ApiResponse<WarehouseStock>> {
    return this.http.get<ApiResponse<WarehouseStock>>(`${this.api}/warehouses/${id}/stock`);
  }
  getConfig(): Observable<ApiResponse<InventoryConfig>> {
    return this.http.get<ApiResponse<InventoryConfig>>(`${this.api}/inventory/config`);
  }
  updateConfig(dto: Partial<InventoryConfig>): Observable<ApiResponse<InventoryConfig>> {
    return this.http.put<ApiResponse<InventoryConfig>>(`${this.api}/inventory/config`, dto);
  }
  adjust(dto: { productId: string; warehouseId: string; quantity: number; reference?: string }): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/movements/adjust`, dto);
  }
  transfer(dto: {
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    reference?: string;
  }): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/movements/transfer`, dto);
  }
}
