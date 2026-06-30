import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { Area } from '../../settings/catalogs/catalog.models';

interface SubW { id: string; name: string; coverageType: string; status: string; roomIds: string[]; roomCount: number; }
interface CovRoom { id: string; number: string; floor?: string | null; tower?: string | null; roomType?: string | null; subWarehouseId: string | null; }
interface Group { key: string; rooms: CovRoom[]; }

@Component({
  selector: 'app-cobertura',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule],
  template: `
    <section class="cv">
      <header class="hd">
        <div class="hd-l">
          <span class="hd-i"><i class="pi pi-sitemap"></i></span>
          <div><h1>Asignar habitaciones al subalmacén</h1>
            <p class="muted">Área padre: <strong>{{ area()?.name || '—' }}</strong> · Tipo: <strong>{{ area()?.type || '—' }}</strong></p>
          </div>
        </div>
        <span class="step">Cobertura</span>
      </header>

      <div class="subbar">
        <div class="fld"><label>Subalmacén</label>
          <p-select [options]="subs()" optionLabel="name" optionValue="id" [(ngModel)]="currentSubId" (onChange)="onSubChange()" placeholder="Selecciona" styleClass="dk" />
        </div>
        <button class="btn ghost" (click)="addSub()"><i class="pi pi-plus"></i> Nuevo subalmacén</button>
        <span class="spacer"></span>
        <div class="counter"><i class="pi pi-clipboard"></i> Seleccionadas: <b>{{ selected().size }}</b></div>
        <button class="btn green" [disabled]="!currentSubId || saving()" (click)="save()"><i class="pi pi-save"></i> Guardar asignación</button>
      </div>

      <div class="filters">
        <p-select [options]="towerOpts()" [(ngModel)]="fTower" (onChange)="noop()" placeholder="Torre" [showClear]="true" styleClass="dk sm" />
        <p-select [options]="floorOpts()" [(ngModel)]="fFloor" (onChange)="noop()" placeholder="Piso" [showClear]="true" styleClass="dk sm" />
        <p-select [options]="typeOpts()" [(ngModel)]="fType" (onChange)="noop()" placeholder="Tipo de habitación" [showClear]="true" styleClass="dk sm" />
        <span class="search"><input pInputText placeholder="Buscar habitación..." [(ngModel)]="search" /><i class="pi pi-search"></i></span>
        <span class="spacer"></span>
        <span class="range">Rango: <input pInputText [(ngModel)]="rFrom" placeholder="201" class="r" /> – <input pInputText [(ngModel)]="rTo" placeholder="216" class="r" /> <button class="btn ghost sm" (click)="selectRange()">Seleccionar</button></span>
      </div>

      @if (!currentSubId) {
        <p class="muted empty">Crea o selecciona un subalmacén para asignar habitaciones.</p>
      } @else {
        @for (g of groups(); track g.key) {
          <div class="grp">
            <div class="grp-h"><i class="pi pi-building"></i> {{ g.key }}</div>
            <div class="rooms">
              @for (r of g.rooms; track r.id) {
                <button class="rm" [class.on]="selected().has(r.id)" [class.other]="r.subWarehouseId && r.subWarehouseId !== currentSubId && !selected().has(r.id)" (click)="toggle(r)">
                  <span class="rn">{{ r.number }}</span>
                  @if (selected().has(r.id)) { <i class="pi pi-check-circle ck"></i> }
                  @else if (r.subWarehouseId && r.subWarehouseId !== currentSubId) { <small class="ot">{{ subName(r.subWarehouseId) }}</small> }
                  <small class="rt">{{ r.roomType || '' }}</small>
                </button>
              } @empty { <span class="muted">Sin habitaciones.</span> }
            </div>
          </div>
        } @empty { <p class="muted empty">No hay habitaciones que coincidan con el filtro.</p> }
      }
    </section>
  `,
  styles: [
    `
      .cv { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      .muted { color: #8b97a8; } .empty { padding: 2rem 0; text-align: center; }
      .hd { display: flex; justify-content: space-between; align-items: center; gap: 1rem; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 0.9rem 1.1rem; margin-bottom: 1rem; }
      .hd-l { display: flex; gap: 0.8rem; align-items: center; } h1 { margin: 0; font-size: 1.3rem; color: #fff; }
      .hd-i { background: rgba(16,185,129,0.18); color: #34d399; width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; font-size: 1.2rem; }
      .step { background: #1e3a8a; color: #93c5fd; border-radius: 999px; padding: 0.25rem 0.8rem; font-size: 0.78rem; font-weight: 700; }
      .subbar, .filters { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
      .subbar .fld { display: flex; flex-direction: column; gap: 0.25rem; } .subbar label { font-size: 0.75rem; color: #9fb0c3; }
      .spacer { flex: 1; }
      :host ::ng-deep .dk { min-width: 200px; } :host ::ng-deep .dk.sm { min-width: 150px; }
      .counter { color: #cdd8e6; font-size: 0.9rem; } .counter b { color: #34d399; }
      .btn { border: 0; border-radius: 8px; padding: 0.55rem 0.9rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
      .btn.green { background: #10b981; color: #04130d; } .btn.green:disabled { opacity: 0.5; } .btn.ghost { background: #131b27; border: 1px solid #243245; color: #cdd8e6; } .btn.ghost.sm { padding: 0.4rem 0.7rem; }
      .search { position: relative; } .search input { background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.5rem 2rem 0.5rem 0.7rem; width: 200px; } .search i { position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .range { color: #9fb0c3; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.4rem; } .range .r { width: 4.5rem; background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 6px; padding: 0.35rem 0.5rem; }
      .grp { margin-bottom: 1rem; } .grp-h { color: #9fb0c3; font-weight: 700; font-size: 0.82rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
      .rooms { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.6rem; }
      .rm { position: relative; background: #131b27; border: 1.5px solid #243245; border-radius: 10px; padding: 0.7rem 0.5rem; cursor: pointer; color: #e6e9ef; display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
      .rm:hover { border-color: #2c3a4f; } .rm.on { border-color: #10b981; background: rgba(16,185,129,0.1); }
      .rm.other { opacity: 0.7; border-style: dashed; }
      .rn { font-weight: 800; font-size: 1.05rem; } .rt { color: #8b97a8; font-size: 0.66rem; } .ck { position: absolute; top: 0.3rem; right: 0.3rem; color: #34d399; }
      .ot { color: #fbbf24; font-size: 0.62rem; }
    `,
  ],
})
export class CoberturaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(CatalogApiService);
  private readonly messages = inject(MessageService);

  readonly area = signal<Area | null>(null);
  readonly subs = signal<SubW[]>([]);
  readonly rooms = signal<CovRoom[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly saving = signal(false);
  areaId: string | null = null;
  currentSubId: string | null = null;
  fTower: string | null = null; fFloor: string | null = null; fType: string | null = null; search = '';
  rFrom = ''; rTo = '';

  ngOnInit(): void {
    this.areaId = this.route.snapshot.queryParamMap.get('area');
    if (!this.areaId) return;
    this.catalog.areas.list({ pageSize: 200 }).subscribe((r) => this.area.set((r.data ?? []).find((a) => a.id === this.areaId) ?? null));
    this.loadSubs();
    this.loadRooms();
  }

  noop(): void { /* dispara CD para refrescar el filtro */ }
  subName(id: string): string { return this.subs().find((s) => s.id === id)?.name ?? 'otro'; }

  loadSubs(): void {
    this.http.get<ApiResponse<SubW[]>>(`${this.api}/subwarehouses`, { params: { areaId: this.areaId! } }).subscribe((r) => {
      this.subs.set(r.data ?? []);
      if (!this.currentSubId && r.data?.length) { this.currentSubId = r.data[0].id; this.recompute(); }
    });
  }
  loadRooms(): void {
    this.http.get<ApiResponse<CovRoom[]>>(`${this.api}/subwarehouses/coverage-rooms`, { params: { areaId: this.areaId! } }).subscribe((r) => { this.rooms.set(r.data ?? []); this.recompute(); });
  }

  onSubChange(): void { this.recompute(); }
  /** Inicializa la selección con las habitaciones ya asignadas al subalmacén actual. */
  recompute(): void {
    const set = new Set<string>();
    for (const r of this.rooms()) if (r.subWarehouseId && r.subWarehouseId === this.currentSubId) set.add(r.id);
    this.selected.set(set);
  }

  readonly towerOpts = computed(() => [...new Set(this.rooms().map((r) => r.tower).filter((t): t is string => !!t))].sort());
  readonly floorOpts = computed(() => [...new Set(this.rooms().map((r) => r.floor).filter((f): f is string => !!f))].sort());
  readonly typeOpts = computed(() => [...new Set(this.rooms().map((r) => r.roomType).filter((t): t is string => !!t))].sort());

  private visible(): CovRoom[] {
    const q = this.search.toLowerCase();
    return this.rooms().filter((r) => {
      if (this.fTower && (r.tower ?? '') !== this.fTower) return false;
      if (this.fFloor && (r.floor ?? '') !== this.fFloor) return false;
      if (this.fType && (r.roomType ?? '') !== this.fType) return false;
      if (q && !r.number.toLowerCase().includes(q)) return false;
      return true;
    });
  }
  groups(): Group[] {
    const map = new Map<string, CovRoom[]>();
    for (const r of this.visible()) {
      const key = `${r.tower ? r.tower : 'Sin torre'} · Piso ${r.floor || '-'}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, rooms]) => ({ key, rooms }));
  }

  toggle(r: CovRoom): void {
    const set = new Set(this.selected());
    if (set.has(r.id)) set.delete(r.id); else set.add(r.id);
    this.selected.set(set);
  }
  selectRange(): void {
    const from = parseInt(this.rFrom, 10); const to = parseInt(this.rTo, 10);
    if (isNaN(from) || isNaN(to)) { this.messages.add({ severity: 'warn', summary: 'Rango inválido', detail: 'Indica números válidos.' }); return; }
    const set = new Set(this.selected());
    for (const r of this.visible()) { const n = parseInt(r.number, 10); if (!isNaN(n) && n >= from && n <= to) set.add(r.id); }
    this.selected.set(set);
  }

  addSub(): void {
    const name = prompt('Nombre del nuevo subalmacén:');
    if (!name?.trim()) return;
    this.http.post<ApiResponse<SubW>>(`${this.api}/subwarehouses`, { areaId: this.areaId, name: name.trim() }).subscribe({
      next: (r) => { this.messages.add({ severity: 'success', summary: 'Subalmacén creado', detail: name }); const id = r.data?.id; this.loadSubs(); if (id) { this.currentSubId = id; setTimeout(() => this.recompute(), 300); } },
      error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }),
    });
  }

  save(): void {
    if (!this.currentSubId) return;
    this.saving.set(true);
    this.http.put<ApiResponse<unknown>>(`${this.api}/subwarehouses/${this.currentSubId}/rooms`, { roomIds: [...this.selected()] }).subscribe({
      next: () => { this.saving.set(false); this.messages.add({ severity: 'success', summary: 'Cobertura guardada', detail: `${this.selected().size} habitación(es).` }); this.loadSubs(); this.loadRooms(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
