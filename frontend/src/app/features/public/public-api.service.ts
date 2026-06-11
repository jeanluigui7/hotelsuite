import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../../core/models/api-response.model';

export interface PublicBranch {
  id: string;
  name: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  currency: string;
  welcome?: string | null;
}

export interface PublicRoomType {
  id: string;
  name: string;
  description?: string | null;
  capacity: number;
  basePrice?: string | number | null;
  attributes: { name: string; icon?: string | null }[];
  rates: { label: string; durationMinutes: number; price: string | number }[];
}

export interface PublicRooms {
  hotel: { id: string; name: string; currency: string };
  roomTypes: PublicRoomType[];
}

export interface PublicRate {
  label: string;
  durationMinutes: number;
  price: number;
}

export interface PublicRoom {
  id: string;
  number: string;
  floor?: string | null;
  available: boolean;
  typeId: string;
  typeName: string;
  description?: string | null;
  capacity: number;
  attributes: { name: string; icon?: string | null }[];
  rates: PublicRate[];
}

export interface PublicLanding {
  hotel: PublicBranch;
  services: { name: string; icon?: string | null }[];
  roomTypes: { id: string; name: string }[];
  rooms: PublicRoom[];
  counts: { total: number; available: number };
}

@Injectable({ providedIn: 'root' })
export class PublicApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  branch(id: string): Observable<ApiResponse<PublicBranch>> {
    return this.http.get<ApiResponse<PublicBranch>>(`${this.api}/public/branches/${id}`);
  }
  rooms(id: string): Observable<ApiResponse<PublicRooms>> {
    return this.http.get<ApiResponse<PublicRooms>>(`${this.api}/public/branches/${id}/rooms`);
  }
  landing(id: string): Observable<ApiResponse<PublicLanding>> {
    return this.http.get<ApiResponse<PublicLanding>>(`${this.api}/public/branches/${id}/landing`);
  }
}
