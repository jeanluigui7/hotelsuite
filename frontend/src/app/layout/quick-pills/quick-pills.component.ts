import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { profileForRole } from '../menu';

interface Pill { label: string; icon: string; route: string; color: string; queryParams?: Record<string, string>; }

/**
 * Atajos globales a los almacenes/inventarios. Visibles en todas las pantallas (shell).
 */
@Component({
  selector: 'app-quick-pills',
  standalone: true,
  imports: [RouterModule],
  template: `
    @if (!isRecepcion()) {
      <div class="pills">
        @for (p of pills; track p.route) {
          <a class="pill" [routerLink]="p.route" [queryParams]="p.queryParams ?? {}" routerLinkActive="active" [style.--c]="p.color">
            <i [class]="p.icon"></i> {{ p.label }}
          </a>
        }
      </div>
    }
  `,
  styles: [
    `
      .pills { display: flex; gap: 0.6rem; flex-wrap: wrap; padding: 0.6rem 1.5rem; border-bottom: 1px solid var(--p-content-border-color, #1c2c44); background: var(--p-content-background, #0b1220); }
      .pill {
        display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none;
        background: var(--c); color: #fff; font-weight: 700; font-size: 0.88rem;
        padding: 0.5rem 1.1rem; border-radius: 999px; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25); transition: transform 0.12s ease, filter 0.12s ease;
      }
      .pill:hover { transform: translateY(-1px); filter: brightness(1.08); }
      .pill.active { outline: 2px solid #fff; outline-offset: 1px; }
      .pill i { font-size: 0.95rem; }
      @media (max-width: 880px) { .pills { padding: 0.5rem 1rem; gap: 0.45rem; } .pill { font-size: 0.8rem; padding: 0.45rem 0.85rem; } }
    `,
  ],
})
export class QuickPillsComponent {
  private readonly auth = inject(AuthService);
  /** Los pills (atajos a almacenes) se ocultan para el perfil de recepción. */
  isRecepcion(): boolean {
    const u = this.auth.user();
    return profileForRole(u?.roleName, u?.isSuperAdmin ?? false) === 'recepcion';
  }
  readonly pills: Pill[] = [
    { label: 'Productos', icon: 'pi pi-box', route: '/operations/almacen-productos', color: '#8b5cf6' },
    { label: 'Recepción', icon: 'pi pi-building', route: '/operations/inventario-recepcion', color: '#f97316' },
    { label: 'Ropa', icon: 'pi pi-stop', route: '/operations/almacen-ropa', color: '#ec4899' },
    { label: 'Amenities', icon: 'pi pi-sparkles', route: '/inventory/almacen', queryParams: { type: 'AMENITIES' }, color: '#10b981' },
    { label: 'Limpieza', icon: 'pi pi-trash', route: '/inventory/cobertura', color: '#3b82f6' },
  ];
}
