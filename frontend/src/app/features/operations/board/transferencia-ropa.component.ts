import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface LinenItem { id: string; type: string; name: string; }
interface Floor { floor: string; }
interface Req { id: string; type: string; name: string; floor: string; quantity: number; createdAt: string; }

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sábana', EDREDON: 'Edredón', AMENITY: 'Amenity' };

@Component({
  selector: 'app-transferencia-ropa',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, SelectModule, InputNumberModule],
  template: `
    <section class="tr">
      <header class="top"><h1>Transferencia de Ropa</h1><button class="refresh" (click)="reload()"><i class="pi pi-refresh"></i></button></header>

      <h3>Enviar Ropa Solicitada <span class="count">{{ requests().length }}</span></h3>
      <div class="reqs">
        @for (r of requests(); track r.id) {
          <div class="req">
            <div><strong>{{ typeLabel(r.type) }} {{ r.name }}</strong> · Piso {{ r.floor }} · <span class="qty">x{{ r.quantity }}</span></div>
            <span class="muted">{{ r.createdAt | date: 'dd/MM HH:mm' }}</span>
            <p-button label="Enviar Ropa" icon="pi pi-send" size="small" [loading]="busy()" (onClick)="fulfill(r)" />
          </div>
        } @empty { <p class="muted">No hay solicitudes de ropa pendientes.</p> }
      </div>

      <h3>Transferir ropa a un piso</h3>
      <div class="form">
        <div class="field"><label>Ropa</label>
          <p-select [options]="items()" [(ngModel)]="linenItemId" optionValue="id" [filter]="true" filterBy="name" placeholder="Selecciona ropa" styleClass="w">
            <ng-template let-i pTemplate="item">{{ typeLabel(i.type) }} · {{ i.name }}</ng-template>
            <ng-template let-i pTemplate="selectedItem">{{ typeLabel(i.type) }} · {{ i.name }}</ng-template>
          </p-select>
        </div>
        <div class="field"><label>Piso destino</label>
          <p-select [options]="floors()" [(ngModel)]="toFloor" optionLabel="floor" optionValue="floor" placeholder="Piso" styleClass="w" />
        </div>
        <div class="field"><label>Cantidad</label><p-inputNumber [(ngModel)]="quantity" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
        <p-button label="Confirmar Transferencia" icon="pi pi-arrow-right" [disabled]="!linenItemId || !toFloor" [loading]="busy()" (onClick)="transfer()" />
      </div>
    </section>
  `,
  styles: [
    `
      .tr { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; } h3 { margin: 1.4rem 0 0.7rem; color: #ec4899; }
      .count { background: #7c2d4d; color: #ffd9e7; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.8rem; margin-left: 0.3rem; }
      .top { display: flex; align-items: center; justify-content: space-between; }
      .refresh { background: #131d2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.7rem; cursor: pointer; }
      .muted { color: #8b97a8; }
      .reqs { display: flex; flex-direction: column; gap: 0.5rem; }
      .req { display: flex; align-items: center; gap: 1rem; background: #131d2b; border: 1px solid #243245; border-radius: 10px; padding: 0.6rem 0.9rem; flex-wrap: wrap; }
      .req > div:first-child { flex: 1; } .qty { color: #34d399; font-weight: 700; }
      .form { display: flex; gap: 0.8rem; align-items: flex-end; flex-wrap: wrap; background: #131d2b; border: 1px solid #243245; border-radius: 12px; padding: 1.1rem; max-width: 760px; }
      .field { display: flex; flex-direction: column; gap: 0.3rem; min-width: 180px; }
      label { font-size: 0.8rem; color: #9fb0c3; }
      :host ::ng-deep .w .p-select { width: 100%; background: #0e1622; border-color: #243245; }
    `,
  ],
})
export class TransferenciaRopaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly items = signal<LinenItem[]>([]);
  readonly floors = signal<Floor[]>([]);
  readonly requests = signal<Req[]>([]);
  readonly busy = signal(false);
  linenItemId: string | null = null;
  toFloor: string | null = null;
  quantity = 1;

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<LinenItem[]>>(`${this.api}/cleaning/linen-items`).subscribe((r) => this.items.set(r.data ?? []));
    this.http.get<ApiResponse<{ floors: Floor[] }>>(`${this.api}/cleaning/linen-inventory`).subscribe((r) => this.floors.set(r.data?.floors ?? []));
    this.http.get<ApiResponse<Req[]>>(`${this.api}/admin/linen/requests`).subscribe((r) => this.requests.set(r.data ?? []));
  }
  typeLabel(t: string): string { return TYPE_LABEL[t] ?? t; }

  fulfill(r: Req): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/requests/${r.id}/fulfill`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Ropa enviada', detail: `Piso ${r.floor}` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
  transfer(): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/transfer`, { linenItemId: this.linenItemId, toFloor: this.toFloor, quantity: this.quantity }).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Transferencia realizada', detail: '' }); this.linenItemId = null; this.toFloor = null; this.quantity = 1; this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
