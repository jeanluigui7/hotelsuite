import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="shell">
      <app-sidebar></app-sidebar>
      @if (layout.sidebarOpen()) {
        <div class="backdrop" (click)="layout.closeSidebar()"></div>
      }
      <div class="main">
        <app-topbar></app-topbar>
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
