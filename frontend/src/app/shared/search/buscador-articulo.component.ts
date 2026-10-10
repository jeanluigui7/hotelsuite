import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { type BuscadorItem, searchItems } from './articulo-search';

/**
 * Buscador de artículos móvil-first, reutilizable en TODOS los almacenes y selectores.
 * - Sugerencias en vivo desde la primera letra (con debounce), tocables directamente.
 * - Búsqueda flexible y tolerante a errores (ver articulo-search.ts).
 * - Fuente 16px (evita el zoom de iOS), ancho completo, botón "X" para limpiar.
 * - Dropdown desplazable (no lo tapa el teclado) con nombre · código · categoría (· stock).
 * - Elegir una sugerencia NO ejecuta ningún movimiento: emite (select); el padre decide.
 *   `(queryChange)` permite además filtrar la tabla del listado con el mismo criterio.
 */
@Component({
  selector: 'app-buscador-articulo',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="ba" [class.open]="open()">
      <div class="ba-field">
        <i class="pi pi-search ba-ico"></i>
        <input
          #inp
          type="search"
          inputmode="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          [placeholder]="placeholder"
          [value]="text"
          (input)="onInput($any($event.target).value)"
          (focus)="onFocus()"
          (keydown)="onKey($event)" />
        @if (text) { <button type="button" class="ba-x" (click)="clear()" aria-label="Limpiar"><i class="pi pi-times"></i></button> }
      </div>

      @if (open() && suggestions().length) {
        <div class="ba-drop" role="listbox">
          @for (s of suggestions(); track s.id; let i = $index) {
            <button type="button" class="ba-opt" [class.hl]="i === hi()" role="option"
                    (mousedown)="pick(s, $event)" (mouseenter)="hi.set(i)">
              <span class="ba-main">
                <span class="ba-name">{{ s.name }}</span>
                <span class="ba-meta">
                  @if (s.code) { <span class="ba-code">{{ s.code }}</span> }
                  @if (s.category) { <span class="ba-cat">{{ s.category }}</span> }
                </span>
              </span>
              @if (showStock && s.stock != null) {
                <span class="ba-stock" [class.zero]="(s.stock || 0) <= 0">{{ s.stock | number: '1.0-0' }}</span>
              }
            </button>
          }
        </div>
      }
      @if (open() && !suggestions().length && text.trim().length >= minChars) {
        <div class="ba-drop ba-empty">Sin coincidencias para "{{ text }}"</div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .ba { position: relative; width: 100%; }
    .ba-field { position: relative; display: flex; align-items: center; }
    .ba-ico { position: absolute; left: .7rem; color: #8aa0bd; font-size: .95rem; pointer-events: none; }
    .ba-field input {
      width: 100%; font-size: 16px; /* evita el zoom de iOS */
      padding: .62rem 2.2rem .62rem 2.1rem; border-radius: 10px;
      border: 1px solid var(--p-content-border-color, #cbd5e1);
      background: var(--p-content-background, #fff); color: var(--p-text-color, #0f172a);
      -webkit-appearance: none; appearance: none; outline: none;
    }
    .ba-field input:focus { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,.2); }
    .ba-field input::-webkit-search-cancel-button { display: none; }
    .ba-x { position: absolute; right: .35rem; width: 1.9rem; height: 1.9rem; border: 0; background: transparent; color: #8aa0bd; cursor: pointer; border-radius: 50%; display: grid; place-items: center; }
    .ba-x:active { background: rgba(148,163,184,.2); }
    .ba-drop {
      position: absolute; z-index: 60; top: calc(100% + 4px); left: 0; right: 0;
      max-height: 42vh; overflow-y: auto; -webkit-overflow-scrolling: touch;
      background: var(--p-content-background, #fff);
      border: 1px solid var(--p-content-border-color, #cbd5e1); border-radius: 12px;
      box-shadow: 0 12px 30px -10px rgba(2,6,23,.45);
    }
    .ba-opt {
      display: flex; align-items: center; gap: .6rem; width: 100%; text-align: left;
      padding: .62rem .8rem; border: 0; border-bottom: 1px solid var(--p-content-border-color, #e5e7eb);
      background: transparent; color: var(--p-text-color, #0f172a); cursor: pointer; min-height: 48px;
    }
    .ba-opt:last-child { border-bottom: 0; }
    .ba-opt.hl, .ba-opt:active { background: var(--p-content-hover-background, #eef2ff); }
    .ba-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .12rem; }
    .ba-name { font-weight: 600; font-size: .95rem; line-height: 1.25; }
    .ba-meta { display: flex; gap: .5rem; flex-wrap: wrap; font-size: .76rem; color: #8aa0bd; }
    .ba-code { font-variant-numeric: tabular-nums; }
    .ba-cat { color: #94a3b8; }
    .ba-stock { flex: 0 0 auto; font-weight: 700; font-variant-numeric: tabular-nums; font-size: .9rem; color: #10b981; background: rgba(16,185,129,.12); border-radius: 8px; padding: .2rem .5rem; }
    .ba-stock.zero { color: #ef4444; background: rgba(239,68,68,.12); }
    .ba-empty { padding: .7rem .8rem; color: #8aa0bd; font-size: .85rem; }
  `],
})
export class BuscadorArticuloComponent {
  /** Universo de artículos a buscar (el padre lo normaliza a BuscadorItem). */
  @Input() items: BuscadorItem[] = [];
  @Input() placeholder = 'Buscar por nombre o código…';
  @Input() showStock = false;
  @Input() minChars = 1;
  /** Texto inicial del campo (p. ej. para precargar en un filtro). */
  @Input() set value(v: string | null | undefined) { this.text = v ?? ''; }

  /** Emite el texto crudo mientras se escribe (para filtrar la tabla del listado). */
  @Output() queryChange = new EventEmitter<string>();
  /** Emite el artículo elegido (el objeto original en `.data` si existe). Nunca mueve inventario. */
  @Output() select = new EventEmitter<BuscadorItem>();

  @ViewChild('inp') inp?: ElementRef<HTMLInputElement>;

  text = '';
  readonly open = signal(false);
  readonly suggestions = signal<BuscadorItem[]>([]);
  readonly hi = signal(-1);
  private timer: ReturnType<typeof setTimeout> | null = null;

  onInput(v: string): void {
    this.text = v;
    this.queryChange.emit(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.recompute(), 120);
  }
  onFocus(): void {
    if (this.text.trim().length >= this.minChars) { this.recompute(); }
    // En móvil, asegura que el campo quede visible sobre el teclado.
    setTimeout(() => this.inp?.nativeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 180);
  }
  private recompute(): void {
    const q = this.text.trim();
    this.suggestions.set(q.length >= this.minChars ? searchItems(this.items, q) : []);
    this.hi.set(this.suggestions().length ? 0 : -1);
    this.open.set(q.length >= this.minChars);
  }
  pick(s: BuscadorItem, ev?: Event): void {
    ev?.preventDefault(); // evita el blur antes del click en móvil
    this.text = s.name;
    this.open.set(false);
    this.suggestions.set([]);
    this.queryChange.emit(this.text);
    this.select.emit(s);
  }
  clear(): void {
    this.text = '';
    this.suggestions.set([]);
    this.open.set(false);
    this.queryChange.emit('');
    this.select.emit({ id: '', name: '' }); // señal de "limpiado" (id vacío)
    setTimeout(() => this.inp?.nativeElement.focus(), 0);
  }
  onKey(e: KeyboardEvent): void {
    if (!this.open() || !this.suggestions().length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.hi.set(Math.min(this.hi() + 1, this.suggestions().length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.hi.set(Math.max(this.hi() - 1, 0)); }
    else if (e.key === 'Enter') { const s = this.suggestions()[this.hi()]; if (s) { e.preventDefault(); this.pick(s); } }
    else if (e.key === 'Escape') { this.open.set(false); }
  }
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.inp && !(e.target instanceof Node && this.inp.nativeElement.closest('.ba')?.contains(e.target))) {
      this.open.set(false);
    }
  }
}
