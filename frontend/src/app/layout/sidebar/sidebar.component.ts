import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ADMIN_MENU, menuForProfile, profileForRole, type MenuItem } from '../menu';
import { AuthService } from '../../core/auth/auth.service';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [FormsModule, RouterModule],
  template: `
    <nav class="sidebar" [class.open]="layout.sidebarOpen()" [class.collapsed]="layout.collapsed()">
      <!-- Marca -->
      <div class="brand">
        <div class="logo">
          <i class="pi pi-building"></i>
          <span>Rizzos</span>
        </div>
        <button type="button" class="bell">
          <i class="pi pi-bell"></i>
          <span class="badge">99+</span>
        </button>
      </div>

      <!-- Sucursal -->
      @if (auth.activeBranch(); as b) {
        <div class="branch-chip" [class.clickable]="auth.branches().length > 1" (click)="cycleBranch()">
          <i class="pi pi-map-marker"></i>
          <span>{{ b.name }}</span>
          @if (auth.branches().length > 1) { <i class="pi pi-sync"></i> }
        </div>
      }

      <!-- Buscador de menú -->
      <div class="search">
        <i class="pi pi-search"></i>
        <input type="text" placeholder="Buscar menú..." [(ngModel)]="query" />
      </div>

      <!-- Menú -->
      <ul class="menu">
        @for (item of filteredMenu(); track item.route) {
          <li class="menu-group">
            <button type="button" class="menu-header" [class.active]="isOpen(item.route)" (click)="toggle(item.route)">
              <i [class]="item.icon"></i>
              <span class="label">{{ item.label }}</span>
              @if (item.children?.length) {
                <i class="chevron pi" [class.pi-chevron-down]="isOpen(item.route)" [class.pi-chevron-right]="!isOpen(item.route)"></i>
              }
            </button>
            @if (item.children?.length && isOpen(item.route)) {
              <ul class="submenu">
                @for (child of item.children; track child.route) {
                  <li><a [routerLink]="child.route" routerLinkActive="active" (click)="layout.closeSidebar()">{{ child.label }}</a></li>
                }
              </ul>
            }
          </li>
        }
      </ul>

      <!-- Pie: usuario -->
      <div class="user-foot">
        <span class="avatar">{{ initials() }}</span>
        <span class="meta">
          <strong>{{ displayName() }}</strong>
          <small>{{ auth.user()?.roleName }}</small>
        </span>
        <i class="pi pi-angle-up"></i>
      </div>
    </nav>
  `,
  styles: [
    `
      .sidebar {
        width: 264px; min-width: 264px; height: 100vh; overflow: hidden;
        background: var(--p-content-background, #0b1220);
        border-right: 1px solid var(--p-content-border-color, #1c2c44);
        display: flex; flex-direction: column;
        transition: margin-left 0.22s ease;
      }
      @media (min-width: 881px) {
        .sidebar.collapsed { margin-left: -264px; }
      }
      @media (max-width: 880px) {
        .sidebar {
          position: fixed; top: 0; left: 0; z-index: 1000;
          transform: translateX(-100%); transition: transform 0.22s ease;
          box-shadow: 2px 0 16px rgba(0, 0, 0, 0.35);
        }
        .sidebar.open { transform: translateX(0); }
      }

      .brand {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem 1rem 0.75rem;
      }
      .logo { display: flex; align-items: center; gap: 0.55rem; font-size: 1.25rem; font-weight: 800; color: var(--rz-accent, #10b981); }
      .logo .pi { font-size: 1.3rem; background: rgba(16,185,129,0.15); padding: 0.45rem; border-radius: 10px; }
      .bell { position: relative; background: #e5484d; border: 0; color: #fff; width: 38px; height: 38px; border-radius: 10px; cursor: pointer; }
      .badge { position: absolute; top: -6px; right: -6px; background: #b4232a; font-size: 0.6rem; font-weight: 700; padding: 1px 4px; border-radius: 999px; }

      .branch-chip {
        margin: 0 1rem 0.75rem; padding: 0.55rem 0.8rem; display: flex; align-items: center; gap: 0.5rem;
        background: var(--p-content-hover-background, #142339); border: 1px solid var(--p-content-border-color, #1c2c44);
        border-radius: 10px; color: var(--rz-accent, #10b981); font-weight: 700; font-size: 0.8rem;
      }
      .branch-chip .pi-sync { margin-left: auto; color: var(--p-text-muted-color, #8aa0bd); }
      .branch-chip.clickable { cursor: pointer; }
      .branch-chip.clickable:hover { border-color: var(--rz-accent, #10b981); }

      .search {
        margin: 0 1rem 0.75rem; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
        background: var(--p-content-hover-background, #142339); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 10px;
      }
      .search .pi { color: var(--p-text-muted-color, #8aa0bd); }
      .search input { flex: 1; background: transparent; border: 0; outline: none; color: var(--p-text-color, #e6edf5); font-size: 0.85rem; }

      .menu { list-style: none; margin: 0; padding: 0.25rem 0.6rem; flex: 1; overflow-y: auto; }
      .menu-header {
        width: 100%; display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem 0.8rem; margin-bottom: 2px;
        background: transparent; border: 0; color: var(--p-text-color, #e6edf5); cursor: pointer; font-size: 0.9rem;
        text-align: left; border-radius: 10px;
      }
      .menu-header:hover { background: var(--p-content-hover-background, #142339); }
      .menu-header.active { background: var(--p-content-hover-background, #142339); }
      .menu-header .label { flex: 1; }
      .chevron { font-size: 0.7rem; opacity: 0.7; }
      .submenu { list-style: none; margin: 0 0 0.3rem; padding: 0; }
      .submenu a { display: block; padding: 0.5rem 0.8rem 0.5rem 2.6rem; font-size: 0.84rem; color: var(--p-text-muted-color, #8aa0bd); border-radius: 8px; }
      .submenu a:hover { background: var(--p-content-hover-background, #142339); color: var(--p-text-color, #e6edf5); }
      .submenu a.active {
        color: #04130d; font-weight: 600;
        background: linear-gradient(90deg, var(--rz-accent, #10b981), color-mix(in srgb, var(--rz-accent, #10b981) 60%, #ffffff));
      }

      .user-foot {
        display: flex; align-items: center; gap: 0.55rem; padding: 0.85rem 1rem;
        border-top: 1px solid var(--p-content-border-color, #1c2c44);
      }
      .user-foot .avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--rz-accent, #10b981); color: #04130d; font-weight: 700; font-size: 0.78rem; display: inline-flex; align-items: center; justify-content: center; }
      .user-foot .meta { display: flex; flex-direction: column; line-height: 1.15; flex: 1; min-width: 0; }
      .user-foot .meta strong { font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .user-foot .meta small { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.72rem; }
    `,
  ],
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly openGroups = signal<Set<string>>(new Set(['/dashboard', '/operations']));

  query = '';

  /**
   * Menú según el perfil del usuario. Los perfiles curados (Limpieza/Recepción)
   * se muestran completos; el menú de administrador se filtra por permisos.
   */
  readonly visibleMenu = computed<MenuItem[]>(() => {
    const user = this.auth.user();
    const profile = profileForRole(user?.roleName, user?.isSuperAdmin ?? false);
    const menu = menuForProfile(profile);
    if (profile !== 'admin') return menu;
    // Administrador / fallback: oculta los módulos sin permiso de vista.
    return ADMIN_MENU.filter((item) => {
      const module = item.route.replace('/', '');
      return module === 'dashboard' || this.auth.can(module, 'view');
    });
  });

  /** Filtra por el buscador de menú. */
  readonly filteredMenu = computed<MenuItem[]>(() => {
    const q = this.query.trim().toLowerCase();
    const menu = this.visibleMenu();
    if (!q) return menu;
    return menu
      .map((item) => {
        const children = (item.children ?? []).filter((c) => c.label.toLowerCase().includes(q));
        if (item.label.toLowerCase().includes(q)) return item;
        if (children.length) return { ...item, children };
        return null;
      })
      .filter((x): x is MenuItem => x !== null);
  });

  isOpen(route: string): boolean {
    return this.openGroups().has(route) || this.query.trim().length > 0;
  }

  toggle(route: string): void {
    const next = new Set(this.openGroups());
    if (next.has(route)) next.delete(route);
    else next.add(route);
    this.openGroups.set(next);
  }

  displayName(): string {
    return this.auth.user()?.email?.split('@')[0] ?? 'Usuario';
  }

  initials(): string {
    const name = this.displayName();
    const parts = name.replace(/[._-]/g, ' ').split(' ').filter(Boolean);
    return ((parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  /** Cambia a la siguiente sucursal accesible (recarga la vista actual). */
  cycleBranch(): void {
    const branches = this.auth.branches();
    if (branches.length < 2) return;
    const idx = branches.findIndex((b) => b.id === this.auth.activeBranchId());
    const next = branches[(idx + 1) % branches.length];
    this.auth.setActiveBranch(next.id);
    const url = this.router.url;
    this.router.navigateByUrl('/_reload', { skipLocationChange: true }).then(() => {
      void this.router.navigateByUrl(url);
    });
  }
}
