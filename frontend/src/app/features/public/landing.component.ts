import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { PublicApiService, type PublicLanding, type PublicRoom } from './public-api.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ToggleSwitchModule],
  template: `
    @if (data(); as d) {
      <!-- NAVBAR -->
      <header class="nav">
        <div class="wrap nav-inner">
          <a class="logo" href="#top">
            @if (d.hotel.logoUrl) { <img [src]="d.hotel.logoUrl" [alt]="d.hotel.name" /> }
            <span>{{ d.hotel.name }}</span>
          </a>
          <nav class="links">
            <a href="#habitaciones">Habitaciones</a>
            <a href="#servicios">Servicios</a>
            <a href="#testimonios">Testimonios</a>
            <a href="#ubicacion">Ubicación</a>
            <a href="#contacto">Contacto</a>
          </nav>
        </div>
      </header>

      <!-- HERO -->
      <section id="top" class="hero">
        <div class="hero-overlay"></div>
        <div class="wrap hero-content">
          <h1 class="serif">Bienvenido a {{ d.hotel.name }}</h1>
          <p class="hero-sub">{{ d.hotel.welcome || 'La mejor experiencia de hospedaje' }}</p>
          <div class="search">
            <div class="field"><label>Check-in</label><input type="date" [(ngModel)]="checkIn" /></div>
            <div class="field"><label>Check-out</label><input type="date" [(ngModel)]="checkOut" /></div>
            <div class="field"><label>Huéspedes</label>
              <select [(ngModel)]="guests">
                <option [value]="1">1 Huésped</option>
                <option [value]="2">2 Huéspedes</option>
                <option [value]="3">3 Huéspedes</option>
                <option [value]="4">4+ Huéspedes</option>
              </select>
            </div>
            <button class="btn-primary" (click)="consult()">Consultar</button>
          </div>
        </div>
      </section>

      <!-- SERVICIOS -->
      <section id="servicios" class="section">
        <div class="wrap center">
          <div class="eyebrow">COMODIDADES</div>
          <h2 class="serif">Servicios del Hotel</h2>
          <div class="services">
            @for (s of d.services; track s.name) {
              <div class="service-card">
                <i [class]="s.icon || 'pi pi-check-circle'"></i>
                <span>{{ s.name }}</span>
              </div>
            } @empty {
              <p class="muted">Pronto publicaremos nuestros servicios.</p>
            }
          </div>
        </div>
      </section>

      <!-- HABITACIONES -->
      <section id="habitaciones" class="section alt">
        <div class="wrap center">
          <div class="eyebrow">ALOJAMIENTO</div>
          <h2 class="serif">Nuestras Habitaciones</h2>
          <p class="muted lead">Encuentra el espacio perfecto para tu estadía. Diseñadas para tu máximo confort.</p>
        </div>

        <div class="wrap rooms-head">
          <div class="count">
            <strong>{{ d.counts.total }}</strong> habitaciones ·
            <strong class="ok">{{ d.counts.available }} disponibles</strong>
          </div>
          <label class="only-avail">
            <p-toggleswitch [(ngModel)]="onlyAvailable" />
            <span>Solo disponibles</span>
          </label>
        </div>

        <div class="wrap chips">
          <button class="chip" [class.active]="typeFilter() === null" (click)="setType(null)">Todos los tipos</button>
          @for (t of d.roomTypes; track t.id) {
            <button class="chip" [class.active]="typeFilter() === t.id" (click)="setType(t.id)">{{ t.name }}</button>
          }
        </div>

        <div class="wrap grid">
          @for (r of filteredRooms(); track r.id) {
            <article class="room" [class.unavailable]="!r.available">
              <div class="room-photo">
                <span class="badge" [class.up]="r.available">{{ r.available ? '● Disponible' : 'No disponible' }}</span>
                <i class="pi pi-image"></i>
                <div class="photo-text serif">Imagen no disponible</div>
                <div class="photo-sub">FOTOGRAFÍA PRÓXIMAMENTE</div>
              </div>
              <div class="room-body">
                <div class="room-no">N° {{ r.number }} · PISO {{ r.floor || '-' }}</div>
                <h3>{{ r.typeName }}</h3>
                @if (r.description) { <p class="room-desc">{{ r.description }}</p> }
                @if (r.attributes.length) {
                  <div class="chip-attr"><i class="pi pi-check-circle"></i> {{ r.attributes[0].name }}</div>
                }
                <div class="cap"><i class="pi pi-users"></i> Capacidad: {{ r.capacity }} persona{{ r.capacity === 1 ? '' : 's' }}</div>

                @if (r.rates.length) {
                  <div class="tarifas">
                    <div class="t-head"><i class="pi pi-wallet"></i> TARIFAS</div>
                    @for (rate of r.rates.slice(0, 2); track rate.label) {
                      <div class="t-row"><span>{{ rate.label }}</span><strong>{{ cur(d) }} {{ rate.price | number: '1.2-2' }}</strong></div>
                    }
                    @if (r.rates.length > 2) {
                      <div class="t-more">+ {{ r.rates.length - 2 }} opciones más</div>
                    }
                  </div>
                }

                @if (r.available) {
                  <button class="btn-primary full" (click)="reserve(d, r)">Reservar</button>
                } @else {
                  <button class="btn-disabled full" disabled>No disponible</button>
                }
              </div>
            </article>
          } @empty {
            <p class="muted center" style="grid-column:1/-1">No hay habitaciones que coincidan con el filtro.</p>
          }
        </div>
      </section>

      <!-- TESTIMONIOS -->
      <section id="testimonios" class="section">
        <div class="wrap center">
          <div class="eyebrow">OPINIONES</div>
          <h2 class="serif">Lo que dicen nuestros huéspedes</h2>
          <div class="testimonials">
            @for (t of testimonials; track t.name) {
              <div class="testi">
                <div class="stars">★★★★★</div>
                <p>“{{ t.text }}”</p>
                <div class="who">{{ t.name }}</div>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- UBICACION -->
      <section id="ubicacion" class="section alt">
        <div class="wrap center">
          <div class="eyebrow">CÓMO LLEGAR</div>
          <h2 class="serif">Ubicación</h2>
          <p class="muted lead">{{ d.hotel.address || 'Consúltanos por nuestra dirección.' }}</p>
        </div>
        @if (mapUrl()) {
          <div class="wrap map"><iframe [src]="mapUrl()" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
        }
      </section>

      <!-- CONTACTO -->
      <section id="contacto" class="section">
        <div class="wrap center">
          <div class="eyebrow">ESTAMOS PARA AYUDARTE</div>
          <h2 class="serif">Contáctanos</h2>
          <div class="contact">
            @if (d.hotel.phone) { <div class="c-item"><i class="pi pi-phone"></i> {{ d.hotel.phone }}</div> }
            @if (d.hotel.email) { <div class="c-item"><i class="pi pi-envelope"></i> {{ d.hotel.email }}</div> }
            @if (d.hotel.address) { <div class="c-item"><i class="pi pi-map-marker"></i> {{ d.hotel.address }}</div> }
          </div>
          @if (waNumber()) {
            <button class="btn-primary" (click)="openWa(waMessage('Hola, quisiera más información sobre el hospedaje.'))">
              <i class="pi pi-whatsapp"></i> Escríbenos por WhatsApp
            </button>
          }
        </div>
      </section>

      <footer class="footer">
        <div class="wrap">© {{ year }} {{ d.hotel.legalName || d.hotel.name }}. Todos los derechos reservados.</div>
      </footer>

      <!-- WHATSAPP FLOTANTE -->
      @if (waNumber()) {
        <button class="wa-float" (click)="openWa(waMessage('Hola, quisiera información sobre disponibilidad.'))" aria-label="WhatsApp">
          <i class="pi pi-whatsapp"></i>
        </button>
      }
    } @else {
      <div class="loading">Cargando…</div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        background: #0b0b12;
        color: #e6e6ec;
        font-family: 'Inter', -apple-system, system-ui, sans-serif;
        min-height: 100vh;
      }
      .serif { font-family: 'Playfair Display', Georgia, serif; }
      .wrap { max-width: 1180px; margin: 0 auto; padding: 0 1.25rem; }
      .center { text-align: center; }
      .muted { color: #9aa0ad; }
      .eyebrow { color: #ec4899; letter-spacing: 0.28em; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.5rem; }
      h2.serif { font-size: 2.4rem; margin: 0 0 0.5rem; font-weight: 600; }
      .lead { max-width: 640px; margin: 0.5rem auto 0; }
      .btn-primary { background: #ec4899; color: #fff; border: 0; border-radius: 999px; padding: 0.8rem 1.8rem; font-weight: 600; cursor: pointer; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center; transition: background 0.15s; }
      .btn-primary:hover { background: #db2777; }
      .btn-primary.full { width: 100%; }
      .btn-disabled { width: 100%; background: transparent; color: #6b7280; border: 1px solid #2a2a36; border-radius: 999px; padding: 0.8rem; font-weight: 600; }

      /* NAVBAR */
      .nav { position: sticky; top: 0; z-index: 50; background: rgba(11, 11, 18, 0.85); backdrop-filter: blur(10px); border-bottom: 1px solid #1c1c26; }
      .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
      .logo { display: flex; align-items: center; gap: 0.6rem; font-weight: 800; font-size: 1.1rem; color: #fff; text-decoration: none; letter-spacing: 0.06em; }
      .logo img { height: 34px; }
      .links { display: flex; gap: 1.6rem; }
      .links a { color: #cfd2da; text-decoration: none; font-size: 0.95rem; }
      .links a:hover { color: #ec4899; }

      /* HERO */
      .hero { position: relative; min-height: 78vh; display: flex; align-items: center; background: linear-gradient(135deg, #1a1326 0%, #0b0b12 55%, #14101c 100%); overflow: hidden; }
      .hero-overlay { position: absolute; inset: 0; background: radial-gradient(circle at 70% 30%, rgba(236, 72, 153, 0.18), transparent 60%); }
      .hero-content { position: relative; z-index: 1; padding: 3rem 1.25rem; }
      .hero h1 { font-size: clamp(2.6rem, 6vw, 4.6rem); line-height: 1.05; margin: 0 0 1rem; color: #fbeff5; font-weight: 600; }
      .hero-sub { font-size: 1.25rem; color: #c8b6c5; margin: 0 0 2rem; }
      .search { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; background: rgba(20, 20, 30, 0.75); border: 1px solid #2a2a3a; border-radius: 16px; padding: 1rem; max-width: 860px; }
      .search .field { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; min-width: 150px; }
      .search label { font-size: 0.75rem; color: #9aa0ad; }
      .search input, .search select { background: #0e0e16; border: 1px solid #2a2a3a; color: #e6e6ec; border-radius: 8px; padding: 0.6rem 0.7rem; font-size: 0.95rem; }

      /* SECTIONS */
      .section { padding: 4.5rem 0; }
      .section.alt { background: #0e0e16; }

      /* SERVICIOS */
      .services { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-top: 2.5rem; }
      .service-card { background: #15151f; border: 1px solid #20202c; border-radius: 16px; padding: 2.2rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
      .service-card i { font-size: 1.8rem; color: #ec4899; }
      .service-card span { font-size: 1.05rem; }

      /* ROOMS */
      .rooms-head { display: flex; align-items: center; justify-content: space-between; margin: 2rem auto 1rem; flex-wrap: wrap; gap: 1rem; }
      .count { color: #cfd2da; } .count .ok { color: #34d399; }
      .only-avail { display: inline-flex; align-items: center; gap: 0.6rem; background: #15151f; border: 1px solid #20202c; border-radius: 999px; padding: 0.4rem 1rem; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.5rem; }
      .chip { background: transparent; border: 1px solid #2a2a3a; color: #cfd2da; border-radius: 999px; padding: 0.55rem 1.3rem; cursor: pointer; font-size: 0.9rem; }
      .chip:hover { border-color: #ec4899; }
      .chip.active { background: #ec4899; border-color: #ec4899; color: #fff; font-weight: 600; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; }
      .room { background: #13131c; border: 1px solid #20202c; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; }
      .room.unavailable { opacity: 0.72; }
      .room-photo { position: relative; height: 200px; background: linear-gradient(135deg, #241420, #14101a); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem; }
      .room-photo > .pi-image { font-size: 2.4rem; color: #46303f; }
      .photo-text { color: #c9b3c1; font-size: 1.2rem; }
      .photo-sub { color: #7a4a63; font-size: 0.65rem; letter-spacing: 0.2em; }
      .badge { position: absolute; top: 0.85rem; right: 0.85rem; background: rgba(0,0,0,0.55); color: #cfd2da; border: 1px solid #3a3a48; padding: 0.3rem 0.8rem; border-radius: 999px; font-size: 0.8rem; }
      .badge.up { color: #34d399; border-color: #14633f; }
      .room-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; flex: 1; }
      .room-no { color: #ec4899; font-size: 0.8rem; letter-spacing: 0.1em; }
      .room-body h3 { margin: 0; font-size: 1.35rem; }
      .room-desc { color: #9aa0ad; margin: 0; font-size: 0.92rem; }
      .chip-attr { display: inline-flex; align-items: center; gap: 0.4rem; background: #1b1b26; border: 1px solid #262633; border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.8rem; color: #cfd2da; width: fit-content; }
      .chip-attr i { color: #34d399; font-size: 0.8rem; }
      .cap { color: #ec4899; font-size: 0.9rem; display: flex; align-items: center; gap: 0.45rem; }
      .tarifas { background: #0e0e16; border: 1px solid #20202c; border-radius: 12px; padding: 0.85rem; margin-top: 0.4rem; }
      .t-head { color: #9aa0ad; font-size: 0.75rem; letter-spacing: 0.1em; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.5rem; }
      .t-row { display: flex; justify-content: space-between; padding: 0.2rem 0; font-size: 0.95rem; }
      .t-more { color: #ec4899; font-size: 0.82rem; text-align: right; margin-top: 0.3rem; }

      /* TESTIMONIOS */
      .testimonials { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; margin-top: 2.5rem; text-align: left; }
      .testi { background: #15151f; border: 1px solid #20202c; border-radius: 16px; padding: 1.5rem; }
      .stars { color: #f59e0b; margin-bottom: 0.5rem; letter-spacing: 2px; }
      .testi p { color: #cfd2da; font-style: italic; }
      .who { color: #ec4899; font-weight: 600; margin-top: 0.5rem; }

      /* UBICACION */
      .map { margin-top: 2rem; border-radius: 16px; overflow: hidden; border: 1px solid #20202c; }
      .map iframe { width: 100%; height: 380px; border: 0; display: block; filter: grayscale(0.2) contrast(1.05); }

      /* CONTACTO */
      .contact { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center; margin: 2rem 0; }
      .c-item { display: flex; align-items: center; gap: 0.5rem; color: #cfd2da; }
      .c-item i { color: #ec4899; }

      .footer { border-top: 1px solid #1c1c26; padding: 1.5rem 0; color: #6b7280; text-align: center; font-size: 0.85rem; }

      /* WHATSAPP FLOAT */
      .wa-float { position: fixed; bottom: 1.5rem; right: 1.5rem; width: 58px; height: 58px; border-radius: 50%; background: #25d366; color: #fff; border: 0; font-size: 1.7rem; cursor: pointer; box-shadow: 0 6px 20px rgba(37,211,102,0.45); z-index: 60; display: flex; align-items: center; justify-content: center; }
      .wa-float:hover { background: #1ebe5b; }

      .loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #9aa0ad; }

      @media (max-width: 760px) {
        .links { display: none; }
        h2.serif { font-size: 1.9rem; }
        .section { padding: 3rem 0; }
        .grid { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class LandingComponent implements OnInit {
  @Input() branchId = '';

  private readonly api = inject(PublicApiService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly data = signal<PublicLanding | null>(null);
  readonly typeFilter = signal<string | null>(null);
  onlyAvailable = false;
  readonly year = new Date().getFullYear();

  checkIn = '';
  checkOut = '';
  guests = 2;

  readonly testimonials = [
    { name: 'María G.', text: 'Excelente atención y habitaciones muy limpias. Volveré sin duda.' },
    { name: 'José R.', text: 'Ubicación perfecta y precios justos. El check-in fue rapidísimo.' },
    { name: 'Lucía T.', text: 'Muy cómodo y tranquilo. El personal siempre atento a todo.' },
  ];

  readonly filteredRooms = computed<PublicRoom[]>(() => {
    const d = this.data();
    if (!d) return [];
    let rooms = d.rooms;
    const t = this.typeFilter();
    if (t) rooms = rooms.filter((r) => r.typeId === t);
    if (this.onlyAvailable) rooms = rooms.filter((r) => r.available);
    return rooms;
  });

  readonly mapUrl = computed<SafeResourceUrl | null>(() => {
    const addr = this.data()?.hotel.address;
    if (!addr) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed`,
    );
  });

  readonly waNumber = computed<string | null>(() => {
    const phone = this.data()?.hotel.phone;
    if (!phone) return null;
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 9) digits = '51' + digits; // móvil Perú sin código de país
    return digits.length >= 9 ? digits : null;
  });

  ngOnInit(): void {
    if (!this.branchId) return;
    this.api.landing(this.branchId).subscribe((res) => this.data.set(res.data));
  }

  setType(id: string | null): void {
    this.typeFilter.set(id);
  }

  cur(d: PublicLanding): string {
    return d.hotel.currency === 'PEN' ? 'S/' : d.hotel.currency;
  }

  // ── WhatsApp ──
  waMessage(base: string): string {
    return base;
  }
  reserve(d: PublicLanding, r: PublicRoom): void {
    this.openWa(`Hola, quiero reservar la habitación N° ${r.number} (${r.typeName}) en ${d.hotel.name}.`);
  }
  consult(): void {
    const parts = ['Hola, quisiera consultar disponibilidad'];
    if (this.checkIn) parts.push(`del ${this.checkIn}`);
    if (this.checkOut) parts.push(`al ${this.checkOut}`);
    parts.push(`para ${this.guests} huésped(es).`);
    this.openWa(parts.join(' '));
  }
  openWa(text: string): void {
    const num = this.waNumber();
    const url = num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : '#';
    window.open(url, '_blank');
  }
}
