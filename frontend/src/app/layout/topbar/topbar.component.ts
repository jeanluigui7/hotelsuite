import { Component } from '@angular/core';

@Component({
  selector: 'app-topbar',
  standalone: true,
  template: `
    <header class="topbar">
      <div class="left">
        <span class="badge">Sucursal: <strong>Demo</strong></span>
      </div>
      <div class="right">
        <i class="pi pi-bell"></i>
        <span class="user">
          <i class="pi pi-user"></i>
          Super Admin
        </span>
      </div>
    </header>
  `,
  styles: [
    `
      .topbar {
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 1.25rem;
        background: var(--p-content-background, #1f1f23);
        border-bottom: 1px solid var(--p-content-border-color, #2b2b30);
      }
      .badge {
        font-size: 0.85rem;
        color: var(--p-text-muted-color, #a1a1aa);
      }
      .right {
        display: flex;
        align-items: center;
        gap: 1.25rem;
      }
      .right .pi {
        cursor: pointer;
      }
      .user {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.88rem;
      }
    `,
  ],
})
export class TopbarComponent {}
