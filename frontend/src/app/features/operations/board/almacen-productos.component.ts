import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Req { id: string; status: string; createdAt: string; items: { productId: string; name: string; quantity: number }[]; }

@Component({
  selector: 'app-almacen-productos',
  standalone: true,
  imports: [DatePipe, ButtonModule, TagModule],
  template: `
    <section class="ap">
      <header class="top"><h1>Almacén de Productos</h1><button class="refresh" (click)="reload()"><i class="pi pi-refresh"></i></button></header>
      <p class="muted">Atiende las solicitudes de productos de Recepción: envíalas para que Recepción las recepcione.</p>

      <h3>Solicitudes por enviar <span class="count">{{ pending().length }}</span></h3>
      <div class="reqs">
        @for (r of pending(); track r.id) {
          <div class="req">
            <div class="req-head"><span>Solicitud {{ r.id.slice(0,8) }}</span><span class="muted">{{ r.createdAt | date: 'dd/MM HH:mm' }}</span></div>
            <div class="items">@for (i of r.items; track i.productId) { <span class="chip">{{ i.name }} x{{ i.quantity }}</span> }</div>
            <p-button label="Enviar Productos" icon="pi pi-send" size="small" [loading]="busy()" (onClick)="send(r)" />
          </div>
        } @empty { <p class="muted">No hay solicitudes pendientes de envío.</p> }
      </div>

      <h3>Enviadas (esperando recepción)</h3>
      <div class="reqs">
        @for (r of sent(); track r.id) {
          <div class="req sent">
            <div class="req-head"><span>Solicitud {{ r.id.slice(0,8) }}</span><p-tag value="Enviada" severity="info" /></div>
            <div class="items">@for (i of r.items; track i.productId) { <span class="chip">{{ i.name }} x{{ i.quantity }}</span> }</div>
          </div>
        } @empty { <p class="muted">Nada en tránsito.</p> }
      </div>
    </section>
  `,
  styles: [
    `
      .ap { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; } h3 { margin: 1.3rem 0 0.6rem; color: #ec4899; }
      .count { background: #7c2d4d; color: #ffd9e7; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.8rem; }
      .top { display: flex; align-items: center; justify-content: space-between; }
      .refresh { background: #131d2b; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.7rem; cursor: pointer; }
      .muted { color: #8b97a8; }
      .reqs { display: flex; flex-direction: column; gap: 0.6rem; }
      .req { background: #131d2b; border: 1px solid #243245; border-radius: 10px; padding: 0.8rem; }
      .req.sent { opacity: 0.85; }
      .req-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
      .items { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
      .chip { background: #1b2433; border: 1px solid #2a3850; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.78rem; }
    `,
  ],
})
export class AlmacenProductosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly requests = signal<Req[]>([]);
  readonly busy = signal(false);
  readonly pending = computed(() => this.requests().filter((r) => r.status === 'REQUESTED'));
  readonly sent = computed(() => this.requests().filter((r) => r.status === 'SENT'));

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<Req[]>>(`${this.api}/reception-inventory/requests`).subscribe((r) => this.requests.set(r.data ?? []));
  }

  send(r: Req): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/requests/${r.id}/send`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Enviado a recepción', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
