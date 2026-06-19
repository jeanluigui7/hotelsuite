import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface InvItem { productId: string; name: string; sku?: string | null; stock: number; min: number; ingresos: number; salidas: number; belowMin: boolean; }
interface Req { id: string; status: string; createdAt: string; items: { productId: string; name: string; quantity: number }[]; }
interface PrintJob { id: string; type: string; title: string; status: string; createdAt: string; }

@Component({
  selector: 'app-inventario-recepcion',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, TagModule],
  template: `
    <section class="inv">
      <header class="top">
        <h1>Inventario de Recepción</h1>
        <div class="acts">
          @if (sentRequests().length) {
            <p-button [label]="'Recepcionar productos (' + sentRequests().length + ')'" icon="pi pi-inbox" (onClick)="recVisible = true" />
          }
          <p-button label="Solicitar seleccionados" icon="pi pi-send" severity="secondary" [disabled]="selected().size === 0" (onClick)="openRequest()" />
          <p-button label="Dar de baja" icon="pi pi-minus-circle" severity="danger" [outlined]="true" [disabled]="selected().size === 0" (onClick)="openWriteOff()" />
        </div>
      </header>

      <table class="tbl">
        <thead><tr><th class="ck"></th><th>Producto</th><th>SKU</th><th class="n">Stock</th><th class="n">Mín</th><th class="n">Ingresos</th><th class="n">Salidas</th><th>Estado</th></tr></thead>
        <tbody>
          @for (it of items(); track it.productId) {
            <tr [class.low]="it.belowMin">
              <td class="ck"><input type="checkbox" [checked]="selected().has(it.productId)" (change)="toggle(it.productId)" /></td>
              <td>{{ it.name }}</td><td class="muted">{{ it.sku || '—' }}</td>
              <td class="n"><strong>{{ it.stock }}</strong></td><td class="n">{{ it.min }}</td>
              <td class="n pos">+{{ it.ingresos }}</td><td class="n neg">-{{ it.salidas }}</td>
              <td>@if (it.belowMin) { <p-tag value="Reponer" severity="warn" /> } @else { <p-tag value="OK" severity="success" /> }</td>
            </tr>
          } @empty { <tr><td colspan="8" class="muted center">Sin productos.</td></tr> }
        </tbody>
      </table>

      <h3 class="sec">Cola de impresión</h3>
      <div class="queue">
        @for (j of queue(); track j.id) {
          <div class="job"><span class="jt">{{ j.title }}</span><span class="muted">{{ j.createdAt | date: 'dd/MM HH:mm' }}</span><p-tag [value]="j.status === 'PENDING' ? 'Pendiente' : 'Impreso'" [severity]="j.status === 'PENDING' ? 'warn' : 'secondary'" /></div>
        } @empty { <p class="muted">Sin impresiones en cola.</p> }
      </div>
    </section>

    <!-- Solicitar -->
    <p-dialog [(visible)]="reqVisible" [modal]="true" header="Solicitar productos" [style]="{ width: '30rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (it of selectedItems(); track it.productId) {
          <div class="qrow"><span>{{ it.name }}</span><p-inputNumber [(ngModel)]="qty[it.productId]" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="reqVisible = false" />
        <p-button label="Enviar Solicitudes" icon="pi pi-send" [loading]="busy()" (onClick)="sendRequest()" />
      </ng-template>
    </p-dialog>

    <!-- Dar de baja -->
    <p-dialog [(visible)]="woVisible" [modal]="true" header="Dar de baja" [style]="{ width: '30rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (it of selectedItems(); track it.productId) {
          <div class="qrow"><span>{{ it.name }} (stock {{ it.stock }})</span><p-inputNumber [(ngModel)]="qty[it.productId]" [min]="1" [max]="it.stock" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
        <label>Motivo</label>
        <input pInputText [(ngModel)]="woReason" placeholder="Ej. producto vencido" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="woVisible = false" />
        <p-button label="Dar de Baja" icon="pi pi-check" severity="danger" [disabled]="!woReason" [loading]="busy()" (onClick)="doWriteOff()" />
      </ng-template>
    </p-dialog>

    <!-- Recepcionar -->
    <p-dialog [(visible)]="recVisible" [modal]="true" header="Recepcionar productos" [style]="{ width: '34rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (r of sentRequests(); track r.id) {
          <div class="req">
            <div class="req-head"><span>Solicitud {{ r.id.slice(0,8) }}</span><span class="muted">{{ r.createdAt | date: 'dd/MM HH:mm' }}</span></div>
            <div class="req-items">@for (i of r.items; track i.productId) { <span class="chip">{{ i.name }} x{{ i.quantity }}</span> }</div>
            <p-button label="Confirmar recepción" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="receive(r.id)" />
          </div>
        } @empty { <p class="muted">No hay productos enviados por recepcionar.</p> }
      </div>
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="recVisible = false" /></ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .inv { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; } h3.sec { margin: 1.5rem 0 0.6rem; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      .acts { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .muted { color: #8b97a8; } .center { text-align: center; } .n { text-align: right; } .pos { color: #34d399; } .neg { color: #f87171; }
      .tbl { width: 100%; border-collapse: collapse; background: #131d2b; border: 1px solid #243245; border-radius: 10px; overflow: hidden; }
      .tbl th { text-align: left; padding: 0.6rem 0.8rem; background: #0e1622; color: #9fb0c3; font-size: 0.8rem; }
      .tbl td { padding: 0.6rem 0.8rem; border-top: 1px solid #1c2a3a; font-size: 0.9rem; }
      .tbl th.n, .tbl td.n { text-align: right; } .ck { width: 2.2rem; text-align: center; }
      .tbl tr.low td { background: rgba(245,158,11,0.08); }
      .queue { display: flex; flex-direction: column; gap: 0.4rem; }
      .job { display: flex; align-items: center; gap: 0.8rem; background: #131d2b; border: 1px solid #243245; border-radius: 8px; padding: 0.5rem 0.8rem; }
      .jt { flex: 1; }
      .form { display: flex; flex-direction: column; gap: 0.5rem; }
      .form label { font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      :host ::ng-deep .form input { width: 100%; }
      .qrow { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
      .req { border: 1px solid #243245; border-radius: 8px; padding: 0.7rem; margin-bottom: 0.6rem; }
      .req-head { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
      .req-items { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
      .chip { background: #1b2433; border: 1px solid #2a3850; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.78rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class InventarioRecepcionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly items = signal<InvItem[]>([]);
  readonly requests = signal<Req[]>([]);
  readonly queue = signal<PrintJob[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  qty: Record<string, number> = {};
  woReason = '';
  reqVisible = false; woVisible = false; recVisible = false;

  readonly sentRequests = computed(() => this.requests().filter((r) => r.status === 'SENT'));
  readonly selectedItems = computed(() => this.items().filter((i) => this.selected().has(i.productId)));

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<{ items: InvItem[] }>>(`${this.api}/reception-inventory`).subscribe((r) => this.items.set(r.data?.items ?? []));
    this.http.get<ApiResponse<Req[]>>(`${this.api}/reception-inventory/requests`).subscribe((r) => this.requests.set(r.data ?? []));
    this.http.get<ApiResponse<PrintJob[]>>(`${this.api}/reception-inventory/print-queue`).subscribe((r) => this.queue.set(r.data ?? []));
  }

  toggle(id: string): void {
    const s = new Set(this.selected());
    if (s.has(id)) s.delete(id); else { s.add(id); this.qty[id] = this.qty[id] || 1; }
    this.selected.set(s);
  }

  openRequest(): void { for (const it of this.selectedItems()) this.qty[it.productId] = this.qty[it.productId] || 1; this.reqVisible = true; }
  openWriteOff(): void { for (const it of this.selectedItems()) this.qty[it.productId] = this.qty[it.productId] || 1; this.woReason = ''; this.woVisible = true; }

  sendRequest(): void {
    this.busy.set(true);
    const items = this.selectedItems().map((it) => ({ productId: it.productId, quantity: this.qty[it.productId] || 1 }));
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/requests`, { items }).subscribe({
      next: () => { this.busy.set(false); this.reqVisible = false; this.selected.set(new Set()); this.toast.add({ severity: 'success', summary: 'Solicitud enviada', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  doWriteOff(): void {
    this.busy.set(true);
    const items = this.selectedItems();
    let done = 0; let failed = 0;
    const next = (i: number) => {
      if (i >= items.length) {
        this.busy.set(false); this.woVisible = false; this.selected.set(new Set());
        this.toast.add({ severity: failed ? 'warn' : 'success', summary: 'Bajas', detail: `${done} dadas de baja${failed ? `, ${failed} con error` : ''}` });
        this.reload(); return;
      }
      const it = items[i];
      this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/write-off`, { productId: it.productId, quantity: this.qty[it.productId] || 1, reason: this.woReason }).subscribe({
        next: () => { done++; next(i + 1); }, error: () => { failed++; next(i + 1); },
      });
    };
    next(0);
  }

  receive(id: string): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/requests/${id}/receive`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Recepcionado', detail: 'Stock actualizado.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
