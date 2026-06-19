import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface PernoctaConfig {
  checkInHour: number;
  checkOutHour: number;
  earlyRatePerHour: number;
  lateRatePerHour: number;
}
interface Quote {
  plannedCheckoutAt: string;
  earlyHours: number;
  earlyCharge: number;
}

@Component({
  selector: 'app-pernocta-config',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, InputNumberModule, ButtonModule],
  template: `
    <section>
      <header class="head">
        <h1>Pernoctación (Día Hotelero)</h1>
        <p class="muted">El día hotelero no es 24h: tiene horario fijo. El ingreso antes de la hora de check-in cobra <strong>early check-in</strong>; la salida después del check-out cobra <strong>late check-out</strong>.</p>
      </header>

      <div class="card">
        <div class="row2">
          <div class="field">
            <label>Hora de check-in hotelero</label>
            <p-inputNumber [(ngModel)]="form.checkInHour" [min]="0" [max]="23" suffix=":00" />
            <small class="muted">Desde esta hora inicia la pernocta (ej. 13 = 1:00 p.m.).</small>
          </div>
          <div class="field">
            <label>Hora de check-out hotelero</label>
            <p-inputNumber [(ngModel)]="form.checkOutHour" [min]="0" [max]="23" suffix=":00" />
            <small class="muted">Hasta esta hora del día siguiente (ej. 12 = 12:00 p.m.).</small>
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label>Tarifa early check-in (por hora)</label>
            <p-inputNumber [(ngModel)]="form.earlyRatePerHour" mode="decimal" [minFractionDigits]="2" [min]="0" />
          </div>
          <div class="field">
            <label>Tarifa late check-out (por hora)</label>
            <p-inputNumber [(ngModel)]="form.lateRatePerHour" mode="decimal" [minFractionDigits]="2" [min]="0" />
          </div>
        </div>
        <div class="actions">
          <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
        </div>
      </div>

      <div class="card preview">
        <h3>Ejemplo</h3>
        <p class="muted">Con un check-in <strong>hoy a las {{ sampleHour }}:00</strong>:</p>
        @if (quote(); as q) {
          <div class="kv"><span>Salida prevista</span><strong>{{ q.plannedCheckoutAt | date: 'EEE dd/MM HH:mm' }}</strong></div>
          <div class="kv"><span>Horas anticipadas (early)</span><strong>{{ q.earlyHours }}</strong></div>
          <div class="kv"><span>Cargo early check-in</span><strong>{{ q.earlyCharge | number: '1.2-2' }}</strong></div>
        }
        <div class="sample">
          <label>Probar otra hora de ingreso:</label>
          <p-inputNumber [(ngModel)]="sampleHour" [min]="0" [max]="23" suffix=":00" (onInput)="loadQuote()" />
          <p-button label="Calcular" size="small" severity="secondary" (onClick)="loadQuote()" />
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 0 0 0.6rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .card { background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 12px; padding: 1.5rem; max-width: 620px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 1.25rem; }
      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      label { font-size: 0.9rem; font-weight: 600; }
      small { font-size: 0.8rem; }
      .actions { margin-top: 0.5rem; }
      .preview .kv { display: flex; justify-content: space-between; padding: 0.35rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.95rem; }
      .sample { display: flex; align-items: center; gap: 0.6rem; margin-top: 1rem; flex-wrap: wrap; }
      .sample label { font-weight: 500; }
    `,
  ],
})
export class PernoctaConfigComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly api = environment.apiUrl;

  readonly saving = signal(false);
  readonly quote = signal<Quote | null>(null);
  form: PernoctaConfig = { checkInHour: 13, checkOutHour: 12, earlyRatePerHour: 0, lateRatePerHour: 0 };
  sampleHour = 6;

  ngOnInit(): void {
    this.http.get<ApiResponse<PernoctaConfig>>(`${this.api}/pernocta/config`).subscribe((res) => {
      if (res.data) this.form = { ...res.data };
      this.loadQuote();
    });
  }

  save(): void {
    this.saving.set(true);
    this.http.put<ApiResponse<PernoctaConfig>>(`${this.api}/pernocta/config`, this.form).subscribe({
      next: (res) => {
        if (res.data) this.form = { ...res.data };
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuración de pernoctación actualizada.' });
        this.loadQuote();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  loadQuote(): void {
    const d = new Date();
    d.setHours(this.sampleHour, 0, 0, 0);
    this.http.post<ApiResponse<Quote>>(`${this.api}/pernocta/quote`, { checkInAt: d.toISOString() }).subscribe((res) => this.quote.set(res.data));
  }
}
