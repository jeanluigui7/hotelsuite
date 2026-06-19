import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { LayoutService } from '../layout.service';
import { ThemeService } from '../../core/theme/theme.service';

/** Etiquetas legibles para construir el breadcrumb a partir de la URL. */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  operations: 'Operaciones',
  finance: 'Finanzas',
  inventory: 'Inventario',
  logistics: 'Logística',
  hr: 'RRHH',
  reports: 'Reportes',
  whatsapp: 'WhatsApp',
  settings: 'Configuraciones',
  recepcion: 'Recepción',
  limpieza: 'Limpieza',
  caja: 'Caja',
  turno: 'Turno',
  habitaciones: 'Habitaciones',
};

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [FormsModule, ButtonModule, TooltipModule],
  template: `
    <header class="topbar">
      <div class="left">
        <button type="button" class="menu-btn" (click)="layout.toggleMenu()">
          <i class="pi pi-bars"></i><span>Menú</span>
        </button>
        <nav class="crumbs">
          @for (c of crumbs(); track c; let last = $last) {
            <span class="crumb" [class.last]="last">{{ c }}</span>
            @if (!last) { <i class="pi pi-angle-right sep"></i> }
          }
        </nav>
      </div>

      <div class="right">
        <!-- Selector de tema/color -->
        <div class="theme-wrap">
          <button type="button" class="icon-btn" (click)="themeOpen.set(!themeOpen())" pTooltip="Tema y color" tooltipPosition="bottom">
            <i class="pi pi-palette"></i>
          </button>
          @if (themeOpen()) {
            <div class="theme-panel" (click)="$event.stopPropagation()">
              <p class="tp-title">Apariencia</p>
              <div class="mode-toggle">
                <button type="button" [class.on]="!theme.dark()" (click)="theme.setDark(false)"><i class="pi pi-sun"></i> Claro</button>
                <button type="button" [class.on]="theme.dark()" (click)="theme.setDark(true)"><i class="pi pi-moon"></i> Oscuro</button>
              </div>
              <p class="tp-title">Color de acento</p>
              <div class="swatches">
                @for (a of theme.accents; track a.key) {
                  <button type="button" class="swatch" [class.on]="theme.accent() === a.key"
                          [style.background]="a.color" [title]="a.label" (click)="theme.setAccent(a.key)">
                    @if (theme.accent() === a.key) { <i class="pi pi-check"></i> }
                  </button>
                }
              </div>
            </div>
          }
        </div>

        <button type="button" class="icon-btn bell" pTooltip="Notificaciones" tooltipPosition="bottom">
          <i class="pi pi-bell"></i>
        </button>

        <span class="user">
          <span class="avatar">{{ initials() }}</span>
          <span class="meta">
            <strong>{{ displayName() }}</strong>
            <small>{{ auth.user()?.roleName }}</small>
          </span>
        </span>

        <button type="button" class="icon-btn" (click)="logout()" pTooltip="Cerrar sesión" tooltipPosition="bottom">
          <i class="pi pi-sign-out"></i>
        </button>
      </div>

      @if (themeOpen()) { <div class="theme-backdrop" (click)="themeOpen.set(false)"></div> }
    </header>
  `,
  styles: [
    `
      .topbar {
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 1.25rem;
        background: var(--p-content-background, #0b1220);
        border-bottom: 1px solid var(--p-content-border-color, #1c2c44);
        position: relative;
      }
      .left { display: flex; align-items: center; gap: 1rem; min-width: 0; }
      .menu-btn {
        display: inline-flex; align-items: center; gap: 0.5rem;
        background: var(--rz-accent, #10b981); color: #04130d;
        border: 0; border-radius: 10px; padding: 0.5rem 0.9rem;
        font-weight: 700; font-size: 0.85rem; cursor: pointer;
      }
      .menu-btn:hover { filter: brightness(1.08); }
      .crumbs { display: flex; align-items: center; gap: 0.4rem; min-width: 0; overflow: hidden; }
      .crumb { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.9rem; white-space: nowrap; }
      .crumb.last { color: var(--p-text-color, #e6edf5); font-weight: 600; }
      .sep { font-size: 0.7rem; color: var(--p-text-muted-color, #8aa0bd); }

      .right { display: flex; align-items: center; gap: 0.6rem; }
      .icon-btn {
        width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center;
        background: var(--p-content-hover-background, #142339); color: var(--p-text-color, #e6edf5);
        border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 10px; cursor: pointer;
      }
      .icon-btn:hover { border-color: var(--rz-accent, #10b981); color: var(--rz-accent, #10b981); }

      .theme-wrap { position: relative; }
      .theme-panel {
        position: absolute; right: 0; top: 46px; z-index: 1200;
        width: 240px; padding: 1rem;
        background: var(--p-content-background, #0f1a2b);
        border: 1px solid var(--p-content-border-color, #1c2c44);
        border-radius: 14px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
      }
      .theme-backdrop { position: fixed; inset: 0; z-index: 1100; }
      .tp-title { margin: 0 0 0.5rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color, #8aa0bd); }
      .mode-toggle { display: flex; gap: 0.4rem; margin-bottom: 1rem; }
      .mode-toggle button {
        flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
        padding: 0.5rem; border-radius: 9px; cursor: pointer; font-size: 0.82rem;
        background: var(--p-content-hover-background, #142339); color: var(--p-text-color, #e6edf5);
        border: 1px solid var(--p-content-border-color, #1c2c44);
      }
      .mode-toggle button.on { border-color: var(--rz-accent, #10b981); color: var(--rz-accent, #10b981); }
      .swatches { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
      .swatch {
        height: 34px; border-radius: 9px; border: 2px solid transparent; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; color: #fff;
      }
      .swatch.on { border-color: #fff; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2); }
      .swatch .pi { font-size: 0.8rem; }

      .user { display: flex; align-items: center; gap: 0.55rem; font-size: 0.85rem; padding-left: 0.3rem; }
      .avatar {
        width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
        background: var(--rz-accent, #10b981); color: #04130d; font-weight: 700; font-size: 0.8rem;
      }
      .user .meta { display: flex; flex-direction: column; line-height: 1.15; }
      .user .meta small { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.72rem; }

      @media (max-width: 880px) {
        .crumbs { display: none; }
        .user .meta { display: none; }
        .menu-btn span { display: none; }
      }
    `,
  ],
})
export class TopbarComponent {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  readonly themeOpen = signal(false);

  private readonly navUrl = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    { initialValue: null },
  );

  readonly crumbs = computed<string[]>(() => {
    void this.navUrl();
    const path = this.router.url.split('?')[0].split('/').filter(Boolean);
    if (!path.length) return ['Dashboard'];
    return path.map((seg) => SEGMENT_LABELS[seg] ?? this.prettify(seg));
  });

  displayName(): string {
    const u = this.auth.user();
    return u?.email?.split('@')[0] ?? 'Usuario';
  }

  initials(): string {
    const name = this.displayName();
    const parts = name.replace(/[._-]/g, ' ').split(' ').filter(Boolean);
    return ((parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  private prettify(seg: string): string {
    return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
