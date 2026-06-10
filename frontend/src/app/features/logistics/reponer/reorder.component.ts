import { Component, OnInit, inject, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LogisticsApiService } from '../services/logistics-api.service';
import type { ReorderReport } from '../services/logistics.models';

@Component({
  selector: 'app-reorder',
  standalone: true,
  imports: [TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <h1>Productos a Reponer</h1>
        <p class="muted">Productos cuyo stock está en o por debajo del punto de reposición.</p>
      </header>

      <p-table [value]="data()?.items ?? []" [loading]="loading()" [paginator]="true" [rows]="15" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Producto</th><th style="width:9rem">Stock</th><th style="width:11rem">Punto de reposición</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td>{{ r.name }}</td>
            <td><p-tag [value]="r.stock" [severity]="r.stock === 0 ? 'danger' : 'warn'" /></td>
            <td>{{ r.reorderPoint }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="3" class="muted center">Todo el stock está por encima del punto de reposición. 🎉</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); margin: 0.25rem 0 0; }
      .center { text-align: center; }
    `,
  ],
})
export class ReorderComponent implements OnInit {
  private readonly logistics = inject(LogisticsApiService);
  readonly data = signal<ReorderReport | null>(null);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.logistics.reorder().subscribe({
      next: (res) => { this.data.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
