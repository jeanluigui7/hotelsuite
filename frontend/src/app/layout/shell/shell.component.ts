import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="shell">
      <app-sidebar></app-sidebar>
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
      }
      .content {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
      }
    `,
  ],
})
export class ShellComponent {}
