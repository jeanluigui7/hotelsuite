import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Mov {
  id: string; article: string; articleType: string; type: string; label: string; tone: string;
  quantity: number; room: string; floor?: string | null; areaFrom: string; areaTo: string;
  reference?: string | null; createdAt: string;
}

const TONE_CLASS: Record<string, string> = { in: 'in', out: 'out', repo: 'repo', req: 'req', adj: 'adj' };

@Component({
  selector: 'app-cleaning-movements',
  standalone: true,
  imports: [DatePipe, FormsModule, SelectModule, DialogModule, ButtonModule],
  template: `
    <section class="cm">
      <header class="hd">
        <h1>Movimientos de Inventario (Limpieza)</h1>
        <p class="muted">Gestiona los movimientos de entrada, salida y ajustes de inventario de ropa.</p>
      </header>

      <div class="filters">
        <div class="f"><label>Tipo</label>
          <p-select [options]="tipoOpts()" [(ngModel)]="tipoFilter" placeholder="Todos los Tipos" [showClear]="true" styleClass="dk" /></div>
        <div class="f"><label>Piso</label>
          <p-select [options]="pisoOpts()" [(ngModel)]="pisoFilter" placeholder="Todos los Pisos" [showClear]="true" styleClass="dk" /></div>
        <div class="f grow"><label>Buscar</label>
          <span class="search"><i class="pi pi-search"></i><input placeholder="Buscar por artículo..." [(ngModel)]="search" /></span></div>
      </div>

      <div class="tablewrap">
        <table class="tbl">
          <thead><tr><th>Artículo</th><th>Tipo</th><th>Cantidad</th><th>Habitación</th><th>Áreas (Origen → Destino)</th><th>Estado</th><th>Fecha</th><th class="ac">Acciones</th></tr></thead>
          <tbody>
            @for (m of filtered(); track m.id) {
              <tr>
                <td class="art">{{ m.article }}</td>
                <td><span class="badge" [class]="toneClass(m.tone)">{{ m.label }}</span></td>
                <td class="qty" [class.neg]="m.quantity < 0">{{ m.quantity > 0 ? '+' + m.quantity : m.quantity }}</td>
                <td>{{ m.room }}</td>
                <td class="areas">{{ m.areaFrom }} <i class="pi pi-arrow-right"></i> {{ m.areaTo }}</td>
                <td><span class="estado"><i class="pi pi-check-circle"></i> Completado</span></td>
                <td class="muted">{{ m.createdAt | date: 'dd MMM yyyy, HH:mm' }}</td>
                <td class="ac"><button class="ver" (click)="open(m)">Ver</button></td>
              </tr>
            } @empty { <tr><td colspan="8" class="muted center">Sin movimientos de ropa.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>

    <p-dialog [(visible)]="detVisible" [modal]="true" header="Detalle del movimiento" [style]="{ width: '26rem' }" styleClass="dk-dialog">
      @if (sel; as m) {
        <div class="kv"><span>Artículo</span><strong>{{ m.article }}</strong></div>
        <div class="kv"><span>Tipo</span><strong>{{ m.label }}</strong></div>
        <div class="kv"><span>Cantidad</span><strong>{{ m.quantity }}</strong></div>
        <div class="kv"><span>Habitación</span><strong>{{ m.room }}</strong></div>
        <div class="kv"><span>Origen</span><strong>{{ m.areaFrom }}</strong></div>
        <div class="kv"><span>Destino</span><strong>{{ m.areaTo }}</strong></div>
        <div class="kv"><span>Referencia</span><strong>{{ m.reference || '—' }}</strong></div>
        <div class="kv"><span>Fecha</span><strong>{{ m.createdAt | date: 'dd/MM/yy HH:mm' }}</strong></div>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="detVisible = false" /></ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .cm { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      .hd h1 { margin: 0; color: #fff; font-size: 1.5rem; } .hd .muted { margin: 0.2rem 0 1.1rem; }
      .muted { color: #8b97a8; } .center { text-align: center; }
      .filters { display: flex; gap: 1rem; flex-wrap: wrap; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; }
      .f { display: flex; flex-direction: column; gap: 0.3rem; min-width: 180px; } .f.grow { flex: 1; }
      label { font-size: 0.78rem; color: #9fb0c3; }
      :host ::ng-deep .dk .p-select { background: #131b27; border-color: #243245; min-width: 180px; }
      .search { position: relative; display: flex; align-items: center; }
      .search i { position: absolute; left: 0.7rem; color: #6b7a90; }
      .search input { width: 100%; background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.6rem 0.7rem 0.6rem 2rem; }
      .tablewrap { overflow-x: auto; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 14px; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.86rem; min-width: 880px; }
      .tbl th { text-align: left; padding: 0.85rem 1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; background: #101a28; }
      .tbl td { padding: 0.75rem 1rem; border-bottom: 1px solid #16202e; }
      .art { font-weight: 600; }
      .badge { font-size: 0.72rem; font-weight: 700; padding: 0.18rem 0.6rem; border-radius: 999px; display: inline-flex; align-items: center; gap: 0.25rem; }
      .badge.in { background: #064e3b; color: #6ee7b7; } .badge.out { background: #7f1d1d; color: #fca5a5; }
      .badge.repo { background: #1e3a8a; color: #93c5fd; } .badge.req { background: #78350f; color: #fcd34d; } .badge.adj { background: #334155; color: #cbd5e1; }
      .qty { font-weight: 700; color: #34d399; } .qty.neg { color: #f87171; }
      .areas { color: #cdd8e6; } .areas .pi { font-size: 0.7rem; color: #6b7a90; margin: 0 0.2rem; }
      .estado { color: #34d399; display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; }
      .ac { text-align: right; } .ver { background: transparent; border: 0; color: #60a5fa; cursor: pointer; font-weight: 600; }
      .ver:hover { text-decoration: underline; }
      .kv { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid #16202e; font-size: 0.9rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class CleaningMovementsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly moves = signal<Mov[]>([]);
  tipoFilter: string | null = null;
  pisoFilter: string | null = null;
  search = '';
  detVisible = false;
  sel: Mov | null = null;

  readonly tipoOpts = computed(() => [...new Set(this.moves().map((m) => m.label))].sort());
  readonly pisoOpts = computed(() => [...new Set(this.moves().map((m) => m.floor).filter((f): f is string => !!f))].sort());

  readonly filtered = computed<Mov[]>(() => {
    const q = this.search.toLowerCase();
    return this.moves().filter((m) => {
      if (this.tipoFilter && m.label !== this.tipoFilter) return false;
      if (this.pisoFilter && m.floor !== this.pisoFilter) return false;
      if (q && !m.article.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  ngOnInit(): void {
    this.http.get<ApiResponse<Mov[]>>(`${this.api}/cleaning/linen-movements`).subscribe((r) => this.moves.set(r.data ?? []));
  }

  toneClass(tone: string): string {
    return TONE_CLASS[tone] ?? 'adj';
  }

  open(m: Mov): void {
    this.sel = m;
    this.detVisible = true;
  }
}
