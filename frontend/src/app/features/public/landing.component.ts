import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PublicApiService, type PublicBranch } from './public-api.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, ButtonModule],
  template: `
    <div class="landing">
      @if (hotel(); as h) {
        <header class="hero">
          @if (h.logoUrl) { <img [src]="h.logoUrl" alt="logo" class="logo" /> }
          <h1>{{ h.name }}</h1>
          @if (h.welcome) { <p class="welcome">{{ h.welcome }}</p> }
          <a [routerLink]="['/landing', h.id, 'habitaciones']"><p-button label="Ver habitaciones y tarifas" icon="pi pi-th-large" /></a>
        </header>

        <section class="info">
          @if (h.address) { <div class="row"><i class="pi pi-map-marker"></i> {{ h.address }}</div> }
          @if (h.phone) { <div class="row"><i class="pi pi-phone"></i> {{ h.phone }}</div> }
          @if (h.email) { <div class="row"><i class="pi pi-envelope"></i> {{ h.email }}</div> }
        </section>

        <footer class="foot muted">{{ h.legalName ?? h.name }}</footer>
      } @else if (notFound()) {
        <div class="center muted">Hotel no disponible.</div>
      } @else {
        <div class="center muted">Cargando…</div>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: var(--p-content-background, #18181b); color: var(--p-text-color, #e4e4e7); }
      .landing { max-width: 760px; margin: 0 auto; padding: 3rem 1.5rem; }
      .hero { text-align: center; padding: 2rem 0; }
      .logo { max-height: 80px; margin-bottom: 1rem; }
      h1 { font-size: 2.2rem; margin: 0 0 1rem; color: var(--p-primary-color, #34d399); }
      .welcome { font-size: 1.1rem; margin: 0 0 1.5rem; }
      .info { display: flex; flex-direction: column; gap: 0.6rem; align-items: center; margin-top: 2rem; }
      .row { display: flex; align-items: center; gap: 0.6rem; }
      .foot { text-align: center; margin-top: 3rem; font-size: 0.85rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; padding: 4rem 0; }
    `,
  ],
})
export class LandingComponent implements OnInit {
  private readonly api = inject(PublicApiService);
  @Input() branchId = '';

  readonly hotel = signal<PublicBranch | null>(null);
  readonly notFound = signal(false);

  ngOnInit(): void {
    if (!this.branchId) {
      this.notFound.set(true);
      return;
    }
    this.api.branch(this.branchId).subscribe({
      next: (res) => this.hotel.set(res.data),
      error: () => this.notFound.set(true),
    });
  }
}
