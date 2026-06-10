import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { LogisticsApiService } from '../services/logistics-api.service';
import type { ProfitReport } from '../services/logistics.models';

@Component({
  selector: 'app-profit',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <section>
      <header class="head">
        <h1>Reporte de Ganancias</h1>
        <p class="muted">Ventas menos costo de los productos vendidos.</p>
      </header>

      <div class="filters">
        <div><label>Desde</label><input pInputText type="date" [(ngModel)]="from" /></div>
        <div><label>Hasta</label><input pInputText type="date" [(ngModel)]="to" /></div>
        <p-button label="Calcular" icon="pi pi-calculator" (onClick)="load()" />
      </div>

      @if (data(); as d) {
        <div class="cards">
          <div class="card"><span>Ingresos (ventas)</span><strong>{{ d.revenue | number: '1.2-2' }}</strong></div>
          <div class="card"><span>Costo de ventas</span><strong>{{ d.cost | number: '1.2-2' }}</strong></div>
          <div class="card profit"><span>Ganancia</span><strong>{{ d.profit | number: '1.2-2' }}</strong></div>
          <div class="card"><span>Líneas vendidas</span><strong>{{ d.lineCount }}</strong></div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); margin: 0.25rem 0 0; }
      .filters { display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1.5rem; }
      .filters label { display: block; font-size: 0.82rem; color: var(--p-text-muted-color, #a1a1aa); margin-bottom: 0.3rem; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
      .card { background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; padding: 1.2rem; display: flex; flex-direction: column; gap: 0.4rem; }
      .card span { color: var(--p-text-muted-color, #a1a1aa); font-size: 0.82rem; }
      .card strong { font-size: 1.4rem; }
      .card.profit strong { color: var(--p-primary-color, #34d399); }
    `,
  ],
})
export class ProfitComponent implements OnInit {
  private readonly logistics = inject(LogisticsApiService);
  readonly data = signal<ProfitReport | null>(null);
  from = '';
  to = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.logistics.profit(this.from || undefined, this.to || undefined).subscribe((res) => this.data.set(res.data));
  }
}
