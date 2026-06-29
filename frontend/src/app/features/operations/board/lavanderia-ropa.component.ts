import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface StockRow { articleKind: string; name: string; quantity: number; }
interface EditRow extends StockRow { move: number; }

@Component({
  selector: 'app-lavanderia-ropa',
  standalone: true,
  imports: [FormsModule, InputNumberModule],
  template: `
    <section class="lv">
      <header class="top"><h1>Lavandería (Ropa)</h1><p class="muted">Ciclo: Ropa Sucia Pendiente → Lavandería → Ropa Limpia Central.</p></header>

      <div class="cols">
        <!-- PENDIENTE -->
        <div class="col">
          <h3 class="dirty"><i class="pi pi-inbox"></i> Ropa Sucia Pendiente <span class="c">{{ pending().length }}</span></h3>
          @for (r of pending(); track r.articleKind + r.name) {
            <div class="row"><span class="nm">{{ r.name }}</span><span class="have">{{ r.quantity }}</span><p-inputNumber [(ngModel)]="r.move" [min]="0" [max]="r.quantity" inputStyleClass="q" /></div>
          } @empty { <p class="muted">Nada pendiente de envío.</p> }
          @if (pending().length) { <button class="btn amber" [disabled]="busy()" (click)="send()"><i class="pi pi-send"></i> Enviar a lavandería</button> }
        </div>

        <!-- EN LAVANDERÍA -->
        <div class="col">
          <h3 class="wash"><i class="pi pi-spin pi-cog"></i> En Lavandería <span class="c">{{ inProcess().length }}</span></h3>
          @for (r of inProcess(); track r.articleKind + r.name) {
            <div class="row"><span class="nm">{{ r.name }}</span><span class="have">{{ r.quantity }}</span><p-inputNumber [(ngModel)]="r.move" [min]="0" [max]="r.quantity" inputStyleClass="q" /></div>
          } @empty { <p class="muted">Sin ropa en lavandería.</p> }
          @if (inProcess().length) { <button class="btn green" [disabled]="busy()" (click)="receive()"><i class="pi pi-check"></i> Recibir (a Ropa Limpia)</button> }
        </div>

        <!-- LIMPIA CENTRAL -->
        <div class="col">
          <h3 class="clean"><i class="pi pi-home"></i> Ropa Limpia Central <span class="c">{{ clean().length }}</span></h3>
          @for (r of clean(); track r.articleKind + r.name) {
            <div class="row"><span class="nm">{{ r.name }}</span><span class="have ok">{{ r.quantity }}</span></div>
          } @empty { <p class="muted">Sin stock en el central.</p> }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .lv { background: #0b1410; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6efe9; }
      h1 { margin: 0; color: #fff; font-size: 1.6rem; } .muted { color: #8aa499; }
      .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-top: 1rem; }
      .col { background: #0e1f18; border: 1px solid #1f3a2c; border-radius: 12px; padding: 1.1rem; }
      h3 { margin: 0 0 0.8rem; display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; }
      h3.dirty { color: #fbbf24; } h3.wash { color: #93c5fd; } h3.clean { color: #34d399; }
      .c { background: #14352a; color: #cdeede; border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.75rem; }
      .row { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0; border-bottom: 1px solid #16261e; }
      .row .nm { flex: 1; font-weight: 600; } .have { color: #9fb0a8; min-width: 1.8rem; text-align: center; } .have.ok { color: #34d399; font-weight: 700; }
      .btn { border: 0; border-radius: 8px; padding: 0.55rem 1rem; font-weight: 700; cursor: pointer; color: #04130d; margin-top: 0.8rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .btn.amber { background: #f59e0b; } .btn.green { background: #10b981; } .btn:disabled { opacity: 0.5; }
      :host ::ng-deep .q { width: 4rem; text-align: center; }
    `,
  ],
})
export class LavanderiaRopaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly messages = inject(MessageService);

  readonly pending = signal<EditRow[]>([]);
  readonly inProcess = signal<EditRow[]>([]);
  readonly clean = signal<StockRow[]>([]);
  readonly busy = signal(false);

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<StockRow[]>>(`${this.api}/laundry/pending`).subscribe((r) => this.pending.set((r.data ?? []).map((x) => ({ ...x, move: x.quantity }))));
    this.http.get<ApiResponse<StockRow[]>>(`${this.api}/laundry/in-process`).subscribe((r) => this.inProcess.set((r.data ?? []).map((x) => ({ ...x, move: x.quantity }))));
    this.http.get<ApiResponse<StockRow[]>>(`${this.api}/laundry/clean`).subscribe((r) => this.clean.set(r.data ?? []));
  }

  private post(url: string, rows: EditRow[], okMsg: string): void {
    const items = rows.filter((r) => r.move > 0).map((r) => ({ articleKind: r.articleKind, name: r.name, quantity: r.move }));
    if (!items.length) { this.messages.add({ severity: 'warn', summary: 'Nada que mover', detail: 'Indica las cantidades.' }); return; }
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/laundry/${url}`, { items }).subscribe({
      next: () => { this.busy.set(false); this.messages.add({ severity: 'success', summary: okMsg, detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
  send(): void { this.post('send', this.pending(), 'Enviado a lavandería'); }
  receive(): void { this.post('receive', this.inProcess(), 'Recibido en Ropa Limpia Central'); }
}
