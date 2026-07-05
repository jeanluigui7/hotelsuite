import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { printPdf } from '../../../core/utils/export';

interface Row {
  linenItemId: string;
  code: string;
  name: string;
  type: string;
  color: string | null;
  base: number;
  disponible: number;
  transferido: number;
  enUso: number;
  lavanderia: number;
  enProceso: number;
  recibidas: number | null;
  perdidos: number;
  belowStock: boolean;
}

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toallas', SABANA: 'Sabanas', EDREDON: 'Edredones', AMENITY: 'Amenities' };

@Component({
  selector: 'app-almacen-ropa',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule],
  template: `
    <section class="ar">
      <header class="top"><div><h1>Almacén de Ropa</h1><p class="muted">Gestiona los artículos del almacén de ropa</p></div></header>

      <div class="bar">
        <div class="search"><i class="pi pi-search"></i><input [(ngModel)]="search" placeholder="Buscar artículos..." /></div>
        <button class="pill" [class.on]="sortBy === 'code'" (click)="sortBy = 'code'"><i class="pi pi-sort-numeric-down"></i> Código</button>
        <button class="pill" [class.on]="sortBy === 'name'" (click)="sortBy = 'name'"><i class="pi pi-sort-alpha-down"></i> Nombre</button>
        <button class="pill" [class.on]="typeFilter === 'TOALLA'" (click)="toggleType('TOALLA')"><i class="pi pi-inbox"></i> Toallas</button>
        <button class="pill" [class.on]="typeFilter === 'SABANA'" (click)="toggleType('SABANA')"><i class="pi pi-inbox"></i> Sábanas</button>
        <button class="pill" [class.on]="typeFilter === 'EDREDON'" (click)="toggleType('EDREDON')"><i class="pi pi-inbox"></i> Edredones</button>
        <span class="sp"></span>
        <button class="op reponer" (click)="goRecepcionar()"><i class="pi pi-arrow-right-arrow-left"></i> Recepcionar Ropa Limpia</button>
        <button class="op enviar" (click)="goEnviar()"><i class="pi pi-arrow-right-arrow-left"></i> Enviar Ropa Solicitada</button>
        <button class="op nuevo" (click)="openNew()"><i class="pi pi-plus"></i> Nuevo Artículo</button>
      </div>

      <div class="ops">
        <button class="op2 in" [disabled]="!selected()" (click)="openMov('IN')"><i class="pi pi-plus"></i> Ingresar</button>
        <button class="op2 tr" [disabled]="!selected()" (click)="openMov('TR')"><i class="pi pi-arrow-right-arrow-left"></i> Transferencia</button>
        <span class="sp"></span>
        <button class="op2 ghost" (click)="print()"><i class="pi pi-print"></i> Imprimir</button>
        <button class="op2 ghost" [class.on]="lowOnly" (click)="lowOnly = !lowOnly"><i class="pi pi-exclamation-triangle"></i> Bajo Stock</button>
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th class="ck"></th><th>CÓDIGO</th><th>ARTÍCULO</th><th>CATEGORÍA/TIPO</th>
              <th class="n">STOCK BASE</th><th class="n">STOCK DISP.</th><th class="n">TRANSF.</th><th class="n">EN USO</th><th class="n">LAVANDERÍA</th><th class="n">EN PROCESO</th><th class="n">RECIBIDAS</th><th class="n">PERDIDOS</th><th class="c">ACCIONES</th>
            </tr></thead>
            <tbody>
              @for (r of paged(); track r.linenItemId) {
                <tr [class.low]="r.belowStock">
                  <td class="ck"><input type="radio" name="sel" [checked]="sel() === r.linenItemId" (change)="sel.set(r.linenItemId)" /></td>
                  <td class="code">{{ r.code }}<br /><small class="muted">NIU</small></td>
                  <td class="art"><span class="ico"><i class="pi pi-inbox"></i></span> {{ r.name }}</td>
                  <td>{{ typeLabel(r.type) }}<br /><small class="muted">Producto</small></td>
                  <td class="n"><b>{{ r.base }}</b><br /><small class="muted">Base inventario</small></td>
                  <td class="n disp" [class.zero]="r.disponible === 0">{{ r.disponible }}</td>
                  <td class="n tf">{{ r.transferido }}</td>
                  <td class="n eu">{{ r.enUso }}</td>
                  <td class="n lav">{{ r.lavanderia }}</td>
                  <td class="n">{{ r.enProceso }}</td>
                  <td class="n muted">{{ r.recibidas ?? '—' }}</td>
                  <td class="n">{{ r.perdidos }}</td>
                  <td class="c acc">
                    <button class="ic" title="Ingresar" (click)="sel.set(r.linenItemId); openMov('IN')"><i class="pi pi-plus"></i></button>
                    <button class="ic" title="Transferir" (click)="sel.set(r.linenItemId); openMov('TR')"><i class="pi pi-arrow-right-arrow-left"></i></button>
                    <button class="ic" title="Editar" (click)="openEdit(r)"><i class="pi pi-pencil"></i></button>
                    <button class="ic del" title="Desactivar" (click)="remove(r)"><i class="pi pi-trash"></i></button>
                  </td>
                </tr>
              } @empty { <tr><td colspan="13" class="empty">Sin artículos de ropa.</td></tr> }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span class="pg-info">Mostrando {{ pageStart() }}–{{ pageEnd() }} de {{ filtered().length }}</span>
          <span class="sp"></span>
          <button class="pg" [disabled]="page() === 1" (click)="page.set(page() - 1)"><i class="pi pi-chevron-left"></i></button>
          <span class="pg-cur">{{ page() }} / {{ totalPages() }}</span>
          <button class="pg" [disabled]="page() >= totalPages()" (click)="page.set(page() + 1)"><i class="pi pi-chevron-right"></i></button>
          <select class="pg-size" [(ngModel)]="pageSize" (change)="page.set(1)"><option [ngValue]="10">10</option><option [ngValue]="25">25</option><option [ngValue]="50">50</option></select>
        </div>
      }
    </section>

    <p-dialog [(visible)]="movVisible" [modal]="true" [header]="movType === 'IN' ? 'Ingresar ropa al central' : 'Transferir ropa a un piso'" [style]="{ width: '26rem' }">
      <p class="muted">{{ selRow()?.name }} — disponible central: {{ selRow()?.disponible }}</p>
      @if (movType === 'TR') {
        <div class="fld"><label>Piso destino</label><input pInputText [(ngModel)]="toFloor" placeholder="Ej: 1, 2, 3" /></div>
      }
      <div class="fld"><label>Cantidad</label><p-inputNumber [(ngModel)]="qty" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="movVisible = false" />
        <p-button [label]="movType === 'IN' ? 'Ingresar' : 'Transferir'" icon="pi pi-check" [loading]="busy()" (onClick)="applyMov()" />
      </ng-template>
    </p-dialog>

    <p-dialog [(visible)]="formVisible" [modal]="true" [header]="form.id ? 'Editar Artículo de Ropa' : 'Nuevo Artículo de Ropa'" [style]="{ width: '28rem' }">
      <div class="fld"><label>Nombre *</label><input pInputText [(ngModel)]="form.name" placeholder="Ej: INCAICA AZUL" /></div>
      <div class="fld"><label>Tipo *</label><p-select [options]="typeOpts" optionLabel="label" optionValue="value" [(ngModel)]="form.type" styleClass="w" appendTo="body" /></div>
      <div class="fld"><label>Color</label><input pInputText [(ngModel)]="form.color" placeholder="Opcional" /></div>
      <label class="chk"><input type="checkbox" [(ngModel)]="form.reusable" /> <span>¿Es reutilizable? (va a lavandería)</span></label>
      @if (!form.id) { <div class="fld"><label>Stock inicial (central)</label><p-inputNumber [(ngModel)]="form.quantity" [min]="0" [showButtons]="true" buttonLayout="horizontal" /></div> }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="formVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="busy()" [disabled]="!form.name?.trim()" (onClick)="saveItem()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .ar { padding: 1.4rem; }
      h1 { margin: 0; font-size: 1.5rem; } .muted { color: #8aa0bd; } .empty { text-align: center; padding: 2rem; color: #8aa0bd; }
      .bar, .ops { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin: 0.9rem 0; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0e1626; border: 1px solid #26364f; border-radius: 10px; padding: 0.5rem 0.9rem; color: #8aa0bd; min-width: 220px; }
      .search input { background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .pill { display: inline-flex; align-items: center; gap: 0.4rem; background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.45rem 0.8rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
      .pill.on { background: #10b981; color: #04130d; border-color: #10b981; }
      .sp { flex: 1; }
      .op { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; color: #fff; }
      .op.reponer { background: #3b82f6; } .op.enviar { background: #22c55e; color: #04130d; } .op.nuevo { background: #10b981; color: #04130d; }
      .acc .ic.del:hover { color: #f87171; }
      .chk { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.7rem; cursor: pointer; font-size: 0.85rem; }
      :host ::ng-deep .w { width: 100%; }
      .pager { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.8rem; color: #8aa0bd; font-size: 0.82rem; }
      .pg { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.35rem 0.6rem; cursor: pointer; } .pg:disabled { opacity: 0.4; cursor: not-allowed; }
      .pg-cur { font-weight: 700; color: #e2e8f0; }
      .pg-size { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.3rem; }
      .op2 { display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid #274468; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; background: transparent; color: #cbd5e1; }
      .op2.in { background: #22c55e; color: #04130d; border: 0; } .op2.tr { background: #6366f1; color: #fff; border: 0; } .op2:disabled { opacity: 0.5; cursor: not-allowed; }
      .op2.ghost.on { background: #78350f; color: #fbbf24; }
      .tbl-wrap { overflow-x: auto; border: 1px solid #1c2c44; border-radius: 12px; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.6rem 0.7rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.82rem; white-space: nowrap; vertical-align: middle; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.7rem; background: #101a2c; }
      .tbl .n { text-align: right; } .tbl .c { text-align: center; }
      .tbl tr.low { background: rgba(248,113,113,0.06); }
      .code { font-weight: 700; color: #cbd5e1; } .code small, .art small, td small { font-weight: 400; }
      .art { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; } .art .ico { background: #16233a; padding: 0.3rem; border-radius: 6px; color: #8aa0bd; }
      .disp { color: #fbbf24; font-weight: 800; } .disp.zero { color: #f87171; }
      .tf { color: #93c5fd; font-weight: 700; } .eu { color: #a78bfa; font-weight: 700; } .lav { color: #c084fc; font-weight: 700; }
      .acc .ic { background: transparent; border: 0; color: #8aa0bd; cursor: pointer; padding: 0.2rem 0.35rem; } .acc .ic:hover { color: #34d399; }
      .fld { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.6rem; } .fld label { font-size: 0.8rem; color: #8aa0bd; }
      .fld input { width: 100%; }
    `,
  ],
})
export class AlmacenRopaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);
  private readonly api = environment.apiUrl;

  readonly rows = signal<Row[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly sel = signal<string | null>(null);

  search = '';
  sortBy: 'code' | 'name' = 'code';
  typeFilter: string | null = null;
  lowOnly = false;

  movVisible = false;
  movType: 'IN' | 'TR' = 'IN';
  qty: number | null = 1;
  toFloor = '';

  formVisible = false;
  form: { id?: string; name: string; type: string; color: string; reusable: boolean; quantity: number } = { name: '', type: 'SABANA', color: '', reusable: true, quantity: 0 };
  readonly typeOpts = [
    { label: 'Toallas', value: 'TOALLA' }, { label: 'Sábanas', value: 'SABANA' }, { label: 'Edredones', value: 'EDREDON' }, { label: 'Amenities', value: 'AMENITY' },
  ];

  ngOnInit(): void { this.reload(); }

  typeLabel(t: string): string { return TYPE_LABEL[t] ?? t; }
  selected(): boolean { return !!this.sel(); }
  selRow(): Row | undefined { return this.rows().find((r) => r.linenItemId === this.sel()); }

  toggleType(t: string): void { this.typeFilter = this.typeFilter === t ? null : t; }

  filtered(): Row[] {
    const q = this.search.trim().toLowerCase();
    return this.rows()
      .filter((r) => !this.typeFilter || r.type === this.typeFilter)
      .filter((r) => !this.lowOnly || r.belowStock)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
      .sort((a, b) => (this.sortBy === 'name' ? a.name.localeCompare(b.name) : a.code.localeCompare(b.code)));
  }

  // ── Paginación ──
  readonly page = signal(1);
  pageSize = 10;
  totalPages(): number { return Math.max(1, Math.ceil(this.filtered().length / this.pageSize)); }
  paged(): Row[] {
    const p = Math.min(this.page(), this.totalPages());
    if (p !== this.page()) queueMicrotask(() => this.page.set(p));
    const start = (p - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  }
  pageStart(): number { return this.filtered().length === 0 ? 0 : (Math.min(this.page(), this.totalPages()) - 1) * this.pageSize + 1; }
  pageEnd(): number { return Math.min(this.filtered().length, Math.min(this.page(), this.totalPages()) * this.pageSize); }

  reload(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<Row[]>>(`${this.api}/admin/linen/warehouse`).subscribe({
      next: (r) => { this.rows.set(r.data ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el almacén de ropa.' }); },
    });
  }

  openMov(type: 'IN' | 'TR'): void { if (!this.sel()) return; this.movType = type; this.qty = 1; this.toFloor = ''; this.movVisible = true; }

  applyMov(): void {
    const id = this.sel();
    if (!id || !this.qty || this.qty <= 0) return;
    if (this.movType === 'TR' && !this.toFloor.trim()) { this.toast.add({ severity: 'warn', summary: 'Falta piso', detail: 'Indica el piso destino.' }); return; }
    this.busy.set(true);
    const req$ = this.movType === 'IN'
      ? this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/replenish`, { linenItemId: id, quantity: this.qty })
      : this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/transfer`, { linenItemId: id, toFloor: this.toFloor.trim(), quantity: this.qty });
    req$.subscribe({
      next: () => { this.busy.set(false); this.movVisible = false; this.toast.add({ severity: 'success', summary: 'Listo', detail: this.movType === 'IN' ? 'Ropa ingresada.' : 'Ropa transferida.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo completar.' }); },
    });
  }

  openNew(): void { this.form = { name: '', type: 'SABANA', color: '', reusable: true, quantity: 0 }; this.formVisible = true; }
  openEdit(r: Row): void { this.form = { id: r.linenItemId, name: r.name, type: r.type, color: r.color ?? '', reusable: true, quantity: 0 }; this.formVisible = true; }
  saveItem(): void {
    if (!this.form.name.trim()) return;
    this.busy.set(true);
    const body = { type: this.form.type, name: this.form.name.trim(), color: this.form.color || undefined, reusable: this.form.reusable };
    const req$ = this.form.id
      ? this.http.put<ApiResponse<unknown>>(`${this.api}/admin/linen/items/${this.form.id}`, body)
      : this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/items`, { ...body, quantity: this.form.quantity || 0 });
    req$.subscribe({
      next: () => { this.busy.set(false); this.formVisible = false; this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Artículo guardado.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
  remove(r: Row): void {
    if (!confirm(`¿Desactivar "${r.name}"? Dejará de aparecer en el almacén.`)) return;
    this.http.delete<ApiResponse<unknown>>(`${this.api}/admin/linen/items/${r.linenItemId}`).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Desactivado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo desactivar.' }),
    });
  }

  goRecepcionar(): void { void this.router.navigateByUrl('/operations/lavanderia-ropa'); }
  goEnviar(): void { void this.router.navigateByUrl('/operations/transferencia-ropa'); }

  print(): void {
    const body = `<table><thead><tr><th>Código</th><th>Artículo</th><th>Tipo</th><th class="num">Base</th><th class="num">Disp</th><th class="num">Transf</th><th class="num">En uso</th><th class="num">Lavand.</th></tr></thead><tbody>${
      this.filtered().map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${this.typeLabel(r.type)}</td><td class="num">${r.base}</td><td class="num">${r.disponible}</td><td class="num">${r.transferido}</td><td class="num">${r.enUso}</td><td class="num">${r.lavanderia}</td></tr>`).join('')
    }</tbody></table>`;
    printPdf('Almacén de Ropa · RIZZOS', body);
  }
}
