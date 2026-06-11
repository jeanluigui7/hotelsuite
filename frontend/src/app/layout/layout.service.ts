import { Injectable, signal } from '@angular/core';

/** Estado del layout (menú lateral) para coordinar topbar ↔ sidebar en móvil. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** En móvil el sidebar es un drawer; en escritorio siempre visible. */
  readonly sidebarOpen = signal(false);

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }
  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }
}
