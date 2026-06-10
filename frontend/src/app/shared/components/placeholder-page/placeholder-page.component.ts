import { Component, computed, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { APP_MENU, type MenuItem } from '../../../layout/menu';

/**
 * Página placeholder usada en FASE 0 para todos los módulos lazy.
 * Muestra el título del módulo y sus submódulos (del menú §1.1).
 * Cada feature se reemplazará por su pantalla real en su fase correspondiente.
 */
@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  imports: [RouterModule],
  template: `
    <section class="placeholder">
      <header>
        <i [class]="module()?.icon ?? 'pi pi-circle'"></i>
        <div>
          <h1>{{ module()?.label ?? 'Módulo' }}</h1>
          <p class="muted">Módulo en construcción — se implementará en su fase correspondiente.</p>
        </div>
      </header>

      @if (module()?.children?.length) {
        <div class="grid">
          @for (child of module()!.children; track child.route) {
            <a class="card" [routerLink]="child.route">
              <i class="pi pi-arrow-right"></i>
              <span>{{ child.label }}</span>
            </a>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .placeholder header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .placeholder header .pi {
        font-size: 1.75rem;
        color: var(--p-primary-color, #34d399);
      }
      h1 {
        margin: 0;
        font-size: 1.4rem;
      }
      .muted {
        margin: 0.25rem 0 0;
        color: var(--p-text-muted-color, #a1a1aa);
        font-size: 0.9rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 0.85rem;
      }
      .card {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 1rem;
        border-radius: 10px;
        background: var(--p-content-background, #1f1f23);
        border: 1px solid var(--p-content-border-color, #2b2b30);
        transition: border-color 0.15s;
      }
      .card:hover {
        border-color: var(--p-primary-color, #34d399);
      }
      .card .pi {
        color: var(--p-primary-color, #34d399);
        font-size: 0.8rem;
      }
    `,
  ],
})
export class PlaceholderPageComponent {
  private readonly router = inject(Router);

  readonly module = computed<MenuItem | undefined>(() => {
    const base = '/' + (this.router.url.split('/')[1] ?? '');
    return APP_MENU.find((m) => m.route === base);
  });
}
