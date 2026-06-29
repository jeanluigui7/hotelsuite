import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Mov {
  id: string; createdAt: string; type: string; articleKind: string; name: string; quantity: number;
  room: string | null; fromLocation: string | null; toLocation: string | null; reference: string | null; note: string | null;
}
const TYPE_LABEL: Record<string, string> = {
  INITIAL: 'Inventario inicial', ROOM_LOAD: 'Carga inicial', LIMPIEZA_RETIRO: 'Retiro por limpieza',
  LIMPIEZA_REPO: 'Reposición por limpieza', LAUNDRY_OUT: 'Envío a lavandería', LAUNDRY_IN: 'Recepción de lavandería',
  DAMAGED: 'Prenda dañada', LOST: 'Prenda perdida', AMENITY_CONSUMO: 'Consumo de amenity',
  ADJUST_POS: 'Ajuste +', ADJUST_NEG: 'Ajuste −', EXCEPTION: 'Excepción', TRANSFER: 'Transferencia', RETURN: 'Devolución',
};
const TYPE_OPTS = [{ label: 'Todos los tipos', value: '' }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ label, value }))];

@Component({
  selector: 'app-kardex-inventario',
  standalone: true,
  imports: [DatePipe, FormsModule, InputTextModule, SelectModule],
  template: `
    <section class="kx">
      <header class="top"><div><h1>Kardex de Inventario (Ropa / Limpieza)</h1><p class="muted">Movimientos por artículo, habitación y ubicación.</p></div>
        <button class="btn" (click)="exportCsv()"><i class="pi pi-download"></i> CSV</button>
      </header>

      <div class="filters">
        <input pInputText placeholder="Artículo..." [(ngModel)]="fName" (keyup.enter)="reload()" />
        <p-select [options]="typeOpts" optionLabel="label" optionValue="value" [(ngModel)]="fType" (onChange)="reload()" styleClass="dk" />
        <label>Desde <input type="date" [(ngModel)]="fFrom" (change)="reload()" /></label>
        <label>Hasta <input type="date" [(ngModel)]="fTo" (change)="reload()" /></label>
        <button class="btn ghost" (click)="reload()"><i class="pi pi-search"></i> Buscar</button>
      </div>

      <div class="tablewrap">
        <table class="tbl">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Artículo</th><th class="cn">Cant.</th><th>Habitación</th><th>Origen → Destino</th><th>Obs.</th></tr></thead>
          <tbody>
            @for (m of rows(); track m.id) {
              <tr>
                <td class="muted">{{ m.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
                <td><span class="tag">{{ typeLabel(m.type) }}</span></td>
                <td class="nm">{{ m.name }}</td>
                <td class="cn" [class.neg]="m.quantity < 0" [class.pos]="m.quantity > 0">{{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}</td>
                <td>{{ m.room ? 'Hab. ' + m.room : '—' }}</td>
                <td class="muted">{{ m.fromLocation || '—' }} → {{ m.toLocation || '—' }}</td>
                <td class="muted">{{ m.note || m.reference || '' }}</td>
              </tr>
            } @empty { <tr><td colspan="7" class="muted center">Sin movimientos para el filtro.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [
    `
      .kx { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
      h1 { margin: 0; color: #fff; font-size: 1.6rem; } .muted { color: #8b97a8; } .center { text-align: center; }
      .filters { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin: 1rem 0; }
      .filters input[pInputText], .filters input[type=date] { background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.5rem 0.7rem; }
      .filters label { color: #9fb0c3; font-size: 0.8rem; display: inline-flex; gap: 0.35rem; align-items: center; }
      :host ::ng-deep .dk { min-width: 200px; }
      .btn { border: 0; border-radius: 8px; padding: 0.55rem 0.9rem; font-weight: 700; cursor: pointer; background: #10b981; color: #04130d; display: inline-flex; align-items: center; gap: 0.4rem; }
      .btn.ghost { background: #131b27; border: 1px solid #243245; color: #cdd8e6; }
      .tablewrap { background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.86rem; min-width: 880px; }
      .tbl th { text-align: left; padding: 0.7rem 1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; font-size: 0.76rem; }
      .tbl td { padding: 0.55rem 1rem; border-bottom: 1px solid #16202e; } .tbl tr:last-child td { border-bottom: 0; }
      th.cn, td.cn { text-align: center; } .nm { font-weight: 600; color: #fff; }
      .pos { color: #34d399; font-weight: 700; } .neg { color: #f87171; font-weight: 700; }
      .tag { font-size: 0.72rem; font-weight: 700; padding: 0.14rem 0.55rem; border-radius: 999px; background: #1a2333; color: #9fb0c3; }
    `,
  ],
})
export class KardexInventarioComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly rows = signal<Mov[]>([]);
  readonly typeOpts = TYPE_OPTS;
  fName = ''; fType = ''; fFrom = ''; fTo = '';

  ngOnInit(): void { this.reload(); }
  typeLabel(t: string): string { return TYPE_LABEL[t] ?? t; }

  reload(): void {
    const params: Record<string, string> = {};
    if (this.fName) params['name'] = this.fName;
    if (this.fType) params['type'] = this.fType;
    if (this.fFrom) params['from'] = this.fFrom;
    if (this.fTo) params['to'] = this.fTo;
    this.http.get<ApiResponse<Mov[]>>(`${this.api}/room-inventory/kardex`, { params }).subscribe((r) => this.rows.set(r.data ?? []));
  }

  exportCsv(): void {
    const head = ['Fecha', 'Tipo', 'Artículo', 'Cantidad', 'Habitación', 'Origen', 'Destino', 'Observación'];
    const lines = this.rows().map((m) => [
      new Date(m.createdAt).toLocaleString('es-PE'), this.typeLabel(m.type), m.name, String(m.quantity),
      m.room ?? '', m.fromLocation ?? '', m.toLocation ?? '', (m.note ?? m.reference ?? '').replace(/"/g, "'"),
    ].map((c) => `"${c}"`).join(','));
    const csv = [head.join(','), ...lines].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'kardex-inventario.csv'; a.click();
    URL.revokeObjectURL(a.href);
  }
}
