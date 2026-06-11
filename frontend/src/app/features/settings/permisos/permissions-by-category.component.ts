import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { RolesApiService, type Permission } from '../services/roles-api.service';

const MODULE_LABEL: Record<string, string> = {
  dashboard: 'Tablero',
  operations: 'Operaciones',
  finance: 'Finanzas',
  inventory: 'Inventario',
  logistics: 'Logística',
  hr: 'Recursos Humanos',
  reports: 'Reportes',
  whatsapp: 'WhatsApp',
  settings: 'Configuraciones',
};
const ACTION_LABEL: Record<string, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
  approve: 'Aprobar',
};

interface Category {
  module: string;
  label: string;
  actions: string[];
}

@Component({
  selector: 'app-permissions-by-category',
  standalone: true,
  imports: [TagModule],
  template: `
    <section>
      <header class="head">
        <h1>Permisos por Categoría</h1>
        <p class="muted">Catálogo de permisos del sistema (módulo × acción). La asignación a roles se hace en Autenticación por Roles.</p>
      </header>

      @if (categories().length) {
        <div class="grid">
          @for (c of categories(); track c.module) {
            <div class="card">
              <h3>{{ c.label }}</h3>
              <div class="actions">
                @for (a of c.actions; track a) {
                  <p-tag [value]="actionLabel(a)" [severity]="severity(a)" />
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="muted">Cargando…</p>
      }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 0 0 0.75rem; font-size: 1.05rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
      .card { background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    `,
  ],
})
export class PermissionsByCategoryComponent implements OnInit {
  private readonly roles = inject(RolesApiService);
  private readonly permissions = signal<Permission[]>([]);

  readonly categories = computed<Category[]>(() => {
    const byModule = new Map<string, string[]>();
    for (const p of this.permissions()) {
      const arr = byModule.get(p.module) ?? [];
      arr.push(p.action);
      byModule.set(p.module, arr);
    }
    const order = ['view', 'create', 'edit', 'delete', 'approve'];
    return [...byModule.entries()].map(([module, actions]) => ({
      module,
      label: MODULE_LABEL[module] ?? module,
      actions: actions.sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    }));
  });

  ngOnInit(): void {
    this.roles.permissions().subscribe((res) => this.permissions.set(res.data ?? []));
  }

  actionLabel(a: string): string {
    return ACTION_LABEL[a] ?? a;
  }

  severity(a: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (a) {
      case 'view':
        return 'info';
      case 'create':
        return 'success';
      case 'edit':
        return 'warn';
      case 'delete':
        return 'danger';
      default:
        return 'secondary';
    }
  }
}
