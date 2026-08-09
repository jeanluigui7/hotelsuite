import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { QuickPillsComponent } from '../quick-pills/quick-pills.component';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, QuickPillsComponent],
  template: `
    <div class="shell">
      <app-sidebar></app-sidebar>
      <!-- Zona sensible en el borde izquierdo: al acercar el mouse, el sidebar reaparece (escritorio). -->
      @if (layout.collapsed()) {
        <div class="edge-trigger" (mouseenter)="layout.showSidebar()" aria-hidden="true"></div>
      }
      @if (layout.sidebarOpen()) {
        <div class="backdrop" (click)="layout.closeSidebar()"></div>
      }
      <div class="main">
        <app-topbar></app-topbar>
        <app-quick-pills></app-quick-pills>
        <main class="content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        height: 100vh;
        overflow: hidden;
      }
      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-width: 0;
      }
      .content {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
      }
      /* Zona sensible del borde izquierdo (escritorio): reaparece el sidebar al acercar el mouse. */
      .edge-trigger {
        position: fixed;
        top: 0;
        left: 0;
        width: 12px;
        height: 100vh;
        z-index: 800;
      }
      @media (max-width: 880px) {
        .edge-trigger { display: none; }
      }
      /* Backdrop del drawer (solo visible en móvil cuando el menú está abierto) */
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 900;
      }
      @media (min-width: 881px) {
        .backdrop {
          display: none;
        }
      }
      @media (max-width: 880px) {
        .content {
          padding: 1rem;
        }
      }
    `,
  ],
})
export class ShellComponent {
  readonly layout = inject(LayoutService);
}
