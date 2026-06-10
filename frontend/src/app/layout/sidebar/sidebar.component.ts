import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { APP_MENU, type MenuItem } from '../menu';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterModule],
  template: `
    <nav class="sidebar">
      <div class="brand">
        <i class="pi pi-bookmark-fill"></i>
        <span>HotelSuite</span>
      </div>

      <ul class="menu">
        @for (item of menu; track item.route) {
          <li class="menu-group">
            <button
              type="button"
              class="menu-header"
              [class.active]="isOpen(item.route)"
              (click)="toggle(item.route)"
            >
              <i [class]="item.icon"></i>
              <span class="label">{{ item.label }}</span>
              @if (item.children?.length) {
                <i class="chevron pi" [class.pi-chevron-down]="isOpen(item.route)"
                   [class.pi-chevron-right]="!isOpen(item.route)"></i>
              }
            </button>

            @if (item.children?.length && isOpen(item.route)) {
              <ul class="submenu">
                @for (child of item.children; track child.route) {
                  <li>
                    <a [routerLink]="child.route" routerLinkActive="active">{{ child.label }}</a>
                  </li>
                }
              </ul>
            }
          </li>
        }
      </ul>
    </nav>
  `,
  styles: [
    `
      .sidebar {
        width: 260px;
        min-width: 260px;
        height: 100vh;
        overflow-y: auto;
        background: var(--p-content-background, #1f1f23);
        border-right: 1px solid var(--p-content-border-color, #2b2b30);
        display: flex;
        flex-direction: column;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 1rem 1.25rem;
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--p-primary-color, #34d399);
        border-bottom: 1px solid var(--p-content-border-color, #2b2b30);
      }
      .menu {
        list-style: none;
        margin: 0;
        padding: 0.5rem 0;
      }
      .menu-header {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.65rem 1.25rem;
        background: transparent;
        border: 0;
        color: var(--p-text-color, #e4e4e7);
        cursor: pointer;
        font-size: 0.92rem;
        text-align: left;
      }
      .menu-header:hover,
      .menu-header.active {
        background: var(--p-content-hover-background, #2b2b30);
      }
      .menu-header .label {
        flex: 1;
      }
      .chevron {
        font-size: 0.7rem;
        opacity: 0.7;
      }
      .submenu {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .submenu a {
        display: block;
        padding: 0.5rem 1.25rem 0.5rem 2.85rem;
        font-size: 0.85rem;
        color: var(--p-text-muted-color, #a1a1aa);
      }
      .submenu a:hover {
        background: var(--p-content-hover-background, #2b2b30);
        color: var(--p-text-color, #e4e4e7);
      }
      .submenu a.active {
        color: var(--p-primary-color, #34d399);
        border-left: 3px solid var(--p-primary-color, #34d399);
        background: var(--p-content-hover-background, #2b2b30);
      }
    `,
  ],
})
export class SidebarComponent {
  readonly menu: MenuItem[] = APP_MENU;
  private readonly openGroups = signal<Set<string>>(new Set(['/dashboard']));

  isOpen(route: string): boolean {
    return this.openGroups().has(route);
  }

  toggle(route: string): void {
    const next = new Set(this.openGroups());
    if (next.has(route)) {
      next.delete(route);
    } else {
      next.add(route);
    }
    this.openGroups.set(next);
  }
}
