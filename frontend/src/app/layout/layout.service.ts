import { Injectable, signal } from '@angular/core';

/** Estado del layout (menú lateral) para coordinar topbar ↔ sidebar. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** En móvil el sidebar es un drawer deslizable. */
  readonly sidebarOpen = signal(false);
  /** En escritorio el sidebar se puede colapsar (ocultar) con el botón "Menú". */
  readonly collapsed = signal(false);

  /** El botón "Menú": colapsa en escritorio y abre el drawer en móvil. */
  toggleMenu(): void {
    this.collapsed.update((v) => !v);
    this.sidebarOpen.update((v) => !v);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }
  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }
}
