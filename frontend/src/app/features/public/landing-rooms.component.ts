import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { PublicApiService, type PublicRooms } from './public-api.service';

@Component({
  selector: 'app-landing-rooms',
  standalone: true,
  imports: [DecimalPipe, RouterLink, TagModule],
  template: `
    <div class="landing">
      @if (data(); as d) {
        <header class="head">
          <a [routerLink]="['/landing', d.hotel.id]" class="back"><i class="pi pi-arrow-left"></i> {{ d.hotel.name }}</a>
          <h1>Habitaciones y tarifas</h1>
        </header>

        <div class="grid">
          @for (rt of d.roomTypes; track rt.id) {
            <div class="card">
              <h2>{{ rt.name }}</h2>
              @if (rt.description) { <p class="muted">{{ rt.description }}</p> }
              <div class="cap muted">Capacidad: {{ rt.capacity }} · {{ rt.attributes.length }} atributos</div>
              <div class="attrs">
                @for (a of rt.attributes; track a.name) { <p-tag [value]="a.name" severity="secondary" styleClass="attr" /> }
              </div>
              <table class="rates">
                @for (r of rt.rates; track r.label) {
                  <tr><td>{{ r.label }}</td><td class="right">{{ d.hotel.currency }} {{ r.price | number: '1.2-2' }}</td></tr>
                }
                @if (rt.rates.length === 0) { <tr><td class="muted">Consultar tarifas</td><td></td></tr> }
              </table>
            </div>
          }
          @if (d.roomTypes.length === 0) { <div class="muted">No hay habitaciones publicadas.</div> }
        </div>
      } @else if (notFound()) {
        <div class="center muted">Hotel no disponible.</div>
      } @else {
        <div class="center muted">Cargando…</div>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: var(--p-content-background, #f8fafc); color: var(--p-text-color, #1f2937); }
      .landing { max-width: 980px; margin: 0 auto; padding: 2.5rem 1.5rem; }
      .head { margin-bottom: 1.5rem; }
      .back { color: var(--p-primary-color, #34d399); display: inline-flex; gap: 0.4rem; align-items: center; }
      h1 { font-size: 1.8rem; margin: 0.5rem 0 0; }
      h2 { font-size: 1.2rem; margin: 0 0 0.4rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
      .card { background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 14px; padding: 1.4rem; }
      .cap { font-size: 0.82rem; margin: 0.4rem 0; }
      .attrs { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.8rem; }
      :host ::ng-deep .attr { margin: 0; }
      table.rates { width: 100%; border-collapse: collapse; }
      table.rates td { padding: 0.35rem 0; border-bottom: 1px solid var(--p-content-border-color, #2b2b30); }
      .right { text-align: right; font-weight: 600; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; padding: 4rem 0; }
    `,
  ],
})
export class LandingRoomsComponent implements OnInit {
  private readonly api = inject(PublicApiService);
  @Input() branchId = '';

  readonly data = signal<PublicRooms | null>(null);
  readonly notFound = signal(false);

  ngOnInit(): void {
    if (!this.branchId) {
      this.notFound.set(true);
      return;
    }
    this.api.rooms(this.branchId).subscribe({
      next: (res) => this.data.set(res.data),
      error: () => this.notFound.set(true),
    });
  }
}
