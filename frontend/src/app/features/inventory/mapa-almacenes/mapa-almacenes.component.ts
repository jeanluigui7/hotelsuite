import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Item { name: string; qty: number; }
interface Floor { floor: string; items: Item[]; }
interface RoomBox { number: string; floor?: string | null; items: Item[]; }
interface MapData {
  general: { products: Item[]; clothingCentral: Item[]; amenities: Item[] };
  cleaning: { floors: Floor[]; products: Item[] };
  laundry: { dirty: Item[]; inLaundry: Item[]; cleanCentral: Item[] };
  reception: Item[];
  rooms: RoomBox[];
}

@Component({
  selector: 'app-mapa-almacenes',
  standalone: true,
  imports: [],
  template: `
    <section class="map">
      <header class="top">
        <div><h1>Mapa de Almacenes</h1><p class="muted">Vista consolidada de todos los almacenes y áreas, con su stock en vivo.</p></div>
        <button class="refresh" (click)="reload()"><i class="pi pi-refresh"></i> Actualizar</button>
      </header>

      @if (data(); as d) {
        <div class="grid">
          <!-- ALMACÉN GENERAL -->
          <div class="zone general">
            <div class="zone-h">ALMACÉN GENERAL</div>
            <div class="boxes">
              <div class="box"><div class="box-h">Almacén Productos</div>
                @for (i of d.general.products; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
              </div>
              <div class="box clothing"><div class="box-h">Almacén Ropa (Central)</div>
                @for (i of d.general.clothingCentral; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
              </div>
              <div class="box amen"><div class="box-h">Almacén Amenities</div>
                @for (i of d.general.amenities; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
              </div>
            </div>
          </div>

          <!-- ÁREA LIMPIEZA -->
          <div class="zone cleaning">
            <div class="zone-h">ÁREA LIMPIEZA</div>
            <div class="boxes">
              <div class="box"><div class="box-h">Productos de Limpieza</div>
                @for (i of d.cleaning.products; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
              </div>
              @for (f of d.cleaning.floors; track f.floor) {
                <div class="box floor"><div class="box-h">Inventario Limpieza · Piso {{ f.floor }}</div>
                  @for (i of f.items; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
                </div>
              } @empty { <div class="box floor"><div class="box-h">Pisos</div><div class="empty">Sin stock por piso</div></div> }
            </div>
          </div>

          <!-- LAVANDERÍA -->
          <div class="zone laundry">
            <div class="zone-h">LAVANDERÍA</div>
            <div class="boxes">
              <div class="box dirty"><div class="box-h">Ropa Sucia Pendiente</div>
                @for (i of d.laundry.dirty; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
              </div>
              <div class="box wash"><div class="box-h">En Lavandería</div>
                @for (i of d.laundry.inLaundry; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
              </div>
              <div class="box clean"><div class="box-h">Ropa Limpia Central</div>
                @for (i of d.laundry.cleanCentral; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
              </div>
            </div>
          </div>

          <!-- RECEPCIÓN -->
          <div class="zone reception">
            <div class="zone-h">ÁREA RECEPCIÓN</div>
            <div class="boxes">
              <div class="box"><div class="box-h">Almacén Recepción</div>
                @for (i of d.reception; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">—</div> }
              </div>
            </div>
          </div>

          <!-- HABITACIONES -->
          <div class="zone rooms">
            <div class="zone-h">ÁREA HABITACIÓN · {{ d.rooms.length }} habitaciones</div>
            <div class="boxes">
              @for (r of d.rooms; track r.number) {
                <div class="box room" [class.zero]="!r.items.length"><div class="box-h">Hab. {{ r.number }} <small>P{{ r.floor || '-' }}</small></div>
                  @for (i of r.items; track i.name) { <div class="li"><span>{{ i.name }}</span><b>{{ i.qty }}</b></div> } @empty { <div class="empty">Sin stock</div> }
                </div>
              } @empty { <div class="empty">Sin habitaciones</div> }
            </div>
          </div>
        </div>
      } @else { <p class="muted">Cargando…</p> }
    </section>
  `,
  styles: [
    `
      .map { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
      h1 { margin: 0; color: #fff; font-size: 1.6rem; } .muted { color: #8b97a8; }
      .refresh { background: #131b27; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.9rem; cursor: pointer; }
      .grid { display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem; }
      .zone { border: 1px solid #24324a; border-radius: 14px; padding: 1rem; background: #0e1622; }
      .zone-h { font-weight: 800; letter-spacing: 0.04em; color: #cdd8e6; margin-bottom: 0.8rem; text-transform: uppercase; font-size: 0.85rem; }
      .zone.general { background: linear-gradient(160deg, #14233b, #0e1828); }
      .zone.cleaning { background: linear-gradient(160deg, #1a2b1f, #0e1a14); }
      .zone.laundry { background: linear-gradient(160deg, #25203b, #14112a); }
      .zone.reception { background: linear-gradient(160deg, #2a2233, #1a1422); }
      .zone.rooms { background: linear-gradient(160deg, #12233b, #0d1726); }
      .boxes { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0.7rem; }
      .box { background: rgba(255,255,255,0.04); border: 1px solid #2b3a52; border-radius: 10px; padding: 0.6rem 0.7rem; }
      .box-h { font-weight: 700; font-size: 0.82rem; color: #fff; margin-bottom: 0.4rem; border-bottom: 1px solid #2b3a52; padding-bottom: 0.3rem; }
      .box-h small { color: #8b97a8; font-weight: 600; }
      .box.clothing .box-h { color: #93c5fd; } .box.amen .box-h { color: #6ee7b7; }
      .box.floor .box-h { color: #fbbf24; } .box.dirty .box-h { color: #fbbf24; } .box.wash .box-h { color: #93c5fd; } .box.clean .box-h { color: #34d399; }
      .box.room.zero { opacity: 0.55; } .box.room.zero .box-h { color: #fca5a5; }
      .li { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.8rem; padding: 0.12rem 0; }
      .li span { color: #cdd8e6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .li b { color: #fff; }
      .empty { color: #6b7a90; font-size: 0.78rem; font-style: italic; }
    `,
  ],
})
export class MapaAlmacenesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  readonly data = signal<MapData | null>(null);

  ngOnInit(): void { this.reload(); }
  reload(): void {
    this.http.get<ApiResponse<MapData>>(`${this.api}/inventory/map`).subscribe((r) => this.data.set(r.data ?? null));
  }
}
