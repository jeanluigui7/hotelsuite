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
  reference?: string | null; createdAt: string; user?: string | null;
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
          <p-select [options]="tipoOpts()" [(ngModel)]="tipoFilter" (onChange)="page.set(0)" placeholder="Todos los Tipos" [showClear]="true" styleClass="dk" /></div>
        <div class="f"><label>Piso</label>
          <p-select [options]="pisoOpts()" [(ngModel)]="pisoFilter" (onChange)="page.set(0)" placeholder="Todos los Pisos" [showClear]="true" styleClass="dk" /></div>
        <div class="f grow"><label>Buscar</label>
          <span class="search"><i class="pi pi-search"></i><input placeholder="Buscar por artículo..." [(ngModel)]="search" (input)="page.set(0)" /></span></div>
      </div>

      <div class="tablewrap">
        <table class="tbl">
          <thead><tr><th>Artículo</th><th>Tipo</th><th>Cantidad</th><th>Habitación</th><th>Áreas (Origen → Destino)</th><th>Estado</th><th>Fecha</th><th class="ac">Acciones</th></tr></thead>
          <tbody>
            @for (m of paged(); track m.id) {
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

      @if (filtered().length > pageSize) {
        <div class="pager">
          <span class="info">{{ rangeFrom() }}–{{ rangeTo() }} de {{ filtered().length }}</span>
          <div class="pbtns">
            <button [disabled]="page() === 0" (click)="page.set(page() - 1)"><i class="pi pi-chevron-left"></i></button>
            <span>{{ page() + 1 }} / {{ totalPages() }}</span>
            <button [disabled]="page() + 1 >= totalPages()" (click)="page.set(page() + 1)"><i class="pi pi-chevron-right"></i></button>
          </div>
        </div>
      }
    </section>

    <p-dialog [(visible)]="detVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '95vw' }" styleClass="dk-dialog mov-dlg">
      <ng-template pTemplate="header">
        <div class="dh"><h2>Detalles del Movimiento</h2><p>Información completa del movimiento de inventario</p></div>
      </ng-template>
      @if (sel; as m) {
        <div class="mv-grid">
          <div class="mv-f"><span class="lbl">Artículo</span><strong class="big">{{ m.article }}</strong></div>
          <div class="mv-f"><span class="lbl">Tipo</span><span class="badge2" [class]="toneClass(m.tone)"><i [class]="toneIcon(m.tone)"></i> {{ m.label }}</span></div>
          <div class="mv-f"><span class="lbl">Cantidad</span><strong class="big" [class.pos]="m.quantity >= 0" [class.neg]="m.quantity < 0">{{ m.quantity > 0 ? '+' + m.quantity : m.quantity }}</strong></div>
          <div class="mv-f"><span class="lbl">Estado</span><span class="estado2"><i class="pi pi-check-circle"></i> Completado</span></div>
          <div class="mv-f wide"><span class="lbl">Fecha</span><strong>{{ m.createdAt | date: 'dd MMM yyyy, HH:mm' }}</strong></div>
          <div class="mv-f wide"><span class="lbl">Notas</span><div class="notes">{{ m.reference || 'Sin notas' }}</div></div>
          <div class="mv-f"><span class="lbl">Solicitado por</span><strong>{{ m.user || '—' }}</strong></div>
          <div class="mv-f"><span class="lbl">Aprobado por</span><strong>{{ m.user || '—' }}</strong></div>
        </div>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" severity="success" (onClick)="detVisible = false" /></ng-template>
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
      .pager { display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 0.2rem; }
      .pager .info { color: #8b97a8; font-size: 0.82rem; }
      .pbtns { display: flex; align-items: center; gap: 0.6rem; color: #cdd8e6; font-size: 0.85rem; }
      .pbtns button { width: 2rem; height: 2rem; border-radius: 8px; border: 1px solid #243245; background: #131b27; color: #e6e9ef; cursor: pointer; }
      .pbtns button:disabled { opacity: 0.4; cursor: not-allowed; }
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
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      .dh h2 { margin: 0; font-size: 1.35rem; color: #fff; } .dh p { margin: 0.2rem 0 0; color: #8b97a8; font-size: 0.85rem; }
      .mv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem 1.5rem; }
      .mv-f { display: flex; flex-direction: column; gap: 0.35rem; } .mv-f.wide { grid-column: 1 / -1; }
      .mv-f .lbl { color: #8b97a8; font-size: 0.82rem; } .mv-f strong { font-size: 1rem; } .mv-f .big { font-size: 1.2rem; }
      .mv-f .big.pos { color: #34d399; } .mv-f .big.neg { color: #f87171; }
      .badge2 { width: fit-content; font-size: 0.82rem; font-weight: 700; padding: 0.3rem 0.8rem; border-radius: 999px; display: inline-flex; align-items: center; gap: 0.4rem; }
      .badge2.in { background: #064e3b; color: #6ee7b7; } .badge2.out { background: #7f1d1d; color: #fca5a5; }
      .badge2.repo { background: #1e3a8a; color: #93c5fd; } .badge2.req { background: #78350f; color: #fcd34d; } .badge2.adj { background: #334155; color: #cbd5e1; }
      .estado2 { color: #34d399; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 1rem; font-weight: 600; }
      .notes { background: #131b27; border: 1px solid #243245; border-radius: 10px; padding: 0.8rem 1rem; color: #e6e9ef; font-size: 0.95rem; }
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

  // Métodos (no computed) para reaccionar a filtros con props no-signal.
  filtered(): Mov[] {
    const q = this.search.toLowerCase();
    return this.moves().filter((m) => {
      if (this.tipoFilter && m.label !== this.tipoFilter) return false;
      if (this.pisoFilter && m.floor !== this.pisoFilter) return false;
      if (q && !m.article.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  readonly pageSize = 10;
  readonly page = signal(0);
  totalPages(): number {
    return Math.max(1, Math.ceil(this.filtered().length / this.pageSize));
  }
  paged(): Mov[] {
    const p = Math.min(this.page(), this.totalPages() - 1);
    return this.filtered().slice(p * this.pageSize, p * this.pageSize + this.pageSize);
  }
  rangeFrom = (): number => (this.filtered().length === 0 ? 0 : this.page() * this.pageSize + 1);
  rangeTo = (): number => Math.min(this.filtered().length, (this.page() + 1) * this.pageSize);

  ngOnInit(): void {
    this.http.get<ApiResponse<Mov[]>>(`${this.api}/cleaning/linen-movements`).subscribe((r) => this.moves.set(r.data ?? []));
  }

  toneClass(tone: string): string {
    return TONE_CLASS[tone] ?? 'adj';
  }

  toneIcon(tone: string): string {
    const icons: Record<string, string> = { in: 'pi pi-plus-circle', out: 'pi pi-minus-circle', repo: 'pi pi-replay', req: 'pi pi-inbox', adj: 'pi pi-sliders-h' };
    return icons[tone] ?? 'pi pi-circle';
  }

  open(m: Mov): void {
    this.sel = m;
    this.detVisible = true;
  }
}
