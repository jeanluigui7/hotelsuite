import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Req { id: string; type: string; name: string; floor: string; quantity: number; createdAt: string; }

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sábana', EDREDON: 'Edredón', AMENITY: 'Amenity' };

@Component({
  selector: 'app-transferencia-ropa',
  standalone: true,
  imports: [DatePipe, ButtonModule],
  template: `
    <section class="tr">
      <header class="top"><h1>Solicitudes de Ropa</h1><button class="refresh" (click)="reload()"><i class="pi pi-refresh"></i></button></header>
      <p class="muted note">La transferencia manual de ropa se realiza desde el atajo <b>Ropa</b> › botón <b>Transferencia</b> (envío masivo por pisos). Aquí solo se atienden las solicitudes que envía limpieza.</p>

      <h3>Enviar Ropa Solicitada <span class="count">{{ requests().length }}</span></h3>
      <div class="reqs">
        @for (r of requests(); track r.id) {
          <div class="req">
            <div><strong>{{ typeLabel(r.type) }} {{ r.name }}</strong> · Piso {{ r.floor }} · <span class="qty">x{{ r.quantity }}</span></div>
            <span class="muted">{{ r.createdAt | date: 'dd/MM HH:mm' }}</span>
            <span class="req-acts">
              <p-button label="Enviar Ropa" icon="pi pi-send" size="small" [loading]="busy()" (onClick)="fulfill(r)" />
              <p-button label="Rechazar" icon="pi pi-times" size="small" severity="danger" [text]="true" [loading]="busy()" (onClick)="reject(r)" />
            </span>
          </div>
        } @empty { <p class="muted">No hay solicitudes de ropa pendientes.</p> }
      </div>
    </section>
  `,
  styles: [
    `
      .tr { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; } h3 { margin: 1.4rem 0 0.7rem; color: #ec4899; }
      .note { max-width: 760px; }
      .count { background: #7c2d4d; color: #ffd9e7; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.8rem; margin-left: 0.3rem; }
      .top { display: flex; align-items: center; justify-content: space-between; }
      .refresh { background: #131d2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.7rem; cursor: pointer; }
      .muted { color: #8b97a8; }
      .reqs { display: flex; flex-direction: column; gap: 0.5rem; }
      .req { display: flex; align-items: center; gap: 1rem; background: #131d2b; border: 1px solid #243245; border-radius: 10px; padding: 0.6rem 0.9rem; flex-wrap: wrap; }
      .req > div:first-child { flex: 1; } .qty { color: #34d399; font-weight: 700; }
    `,
  ],
})
export class TransferenciaRopaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly requests = signal<Req[]>([]);
  readonly busy = signal(false);

  ngOnInit(): void { this.reload(); }

  reload(): void {
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
  /** Rechaza la solicitud (falta de tiempo/stock); solo la cancela. */
  reject(r: Req): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/requests/${r.id}/reject`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Solicitud rechazada', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
