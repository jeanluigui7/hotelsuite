import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { OperationsApiService } from '../../services/operations-api.service';
import { ReservasStore } from '../reservas-store.service';
import type { Proforma } from '../reservas.model';

@Component({
  selector: 'app-reservas-proformas',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ButtonModule, DialogModule, TableModule, TagModule],
  templateUrl: './reservas-proformas.component.html',
  styleUrls: ['../reservas.styles.scss', '../reservas-detalle.component.scss'],
})
export class ReservasProformasComponent implements OnInit {
  readonly store = inject(ReservasStore);
  private readonly ops = inject(OperationsApiService);
  private readonly router = inject(Router);

  private readonly realProformas = signal<Proforma[]>([]);
  readonly rows = computed<Proforma[]>(() => (this.store.isDemo() ? this.store.proformas() : this.realProformas()));

  verDialog = false;
  sel: Proforma | null = null;

  constructor() {
    effect(() => {
      if (this.store.source() === 'REAL') this.reload();
    });
  }
  ngOnInit(): void {
    if (!this.store.isDemo()) this.reload();
  }
  reload(): void {
    this.ops.proformaList().subscribe({ next: (res) => this.realProformas.set(res.data ?? []), error: () => this.realProformas.set([]) });
  }

  estadoSeverity(e: Proforma['estado']): 'success' | 'danger' | 'secondary' {
    return e === 'VIGENTE' ? 'success' : e === 'CONVERTIDA' ? 'secondary' : 'danger';
  }
  estadoLabel(e: Proforma['estado']): string {
    return e === 'VIGENTE' ? 'Vigente' : e === 'CONVERTIDA' ? 'Convertida' : 'Vencida';
  }

  nueva(): void {
    this.router.navigate(['/operations/reservas/nueva'], { queryParams: { modo: 'proforma' } });
  }
  ver(p: Proforma): void {
    this.sel = p;
    this.verDialog = true;
  }
  crearReserva(p: Proforma): void {
    this.router.navigate(['/operations/reservas/nueva'], { queryParams: { desdeProforma: p.id, cliente: p.cliente, rooms: p.habitaciones } });
  }
}
