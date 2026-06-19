import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface CleanRoom { id: string; number: string; floor?: string | null; status: string; typeName: string; repaso: boolean; enCurso: boolean; taskId: string | null; startedAt?: string | null; }
interface LinenItem { id: string; type: string; name: string; color?: string | null; reusable: boolean; }
interface InspRow { item: LinenItem; state: 'OK' | 'ROBADA' | 'DETERIORADA'; pickup: boolean; }

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sábana', EDREDON: 'Edredón', AMENITY: 'Amenity' };

@Component({
  selector: 'app-gestion-limpieza',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule],
  template: `
    <section class="gl">
      <header class="top"><h1>Gestión de Habitaciones</h1><button class="refresh" (click)="reload()"><i class="pi pi-refresh"></i> Actualizar</button></header>

      @if (repasoRooms().length) {
        <h3 class="rep"><i class="pi pi-replay"></i> Requieren Repaso <span class="count">{{ repasoRooms().length }}</span></h3>
        <div class="grid">
          @for (r of repasoRooms(); track r.id) {
            <article class="card repaso">
              <div class="num">Hab. {{ r.number }}</div><div class="ty">{{ r.typeName }}</div><div class="pi-flo">Piso {{ r.floor || '-' }}</div>
              <button class="cta" (click)="openIniciar(r)"><i class="pi pi-refresh"></i> Iniciar Repaso</button>
            </article>
          }
        </div>
      }

      <h3 class="ges"><i class="pi pi-th-large"></i> Gestionar Habitaciones</h3>
      <div class="grid">
        @for (r of normalRooms(); track r.id) {
          <article class="card" [class.curso]="r.enCurso">
            <div class="card-top">
              <div class="num">Hab. {{ r.number }}</div>
              @if (r.enCurso) { <span class="dot-amber"></span> }
            </div>
            <div class="ty">{{ r.typeName }}</div><div class="pi-flo">Piso {{ r.floor || '-' }}</div>
            @if (r.enCurso) {
              <div class="timer">
                <i class="pi pi-clock"></i>
                <div><span class="t">{{ elapsed(r.startedAt) }}</span><small>Límite: 12 min</small></div>
              </div>
              <button class="cta done" (click)="finish(r)"><i class="pi pi-check"></i> Finalizar Limpieza</button>
            } @else {
              <div class="st">Limpieza en espera</div>
              <button class="cta" (click)="openIniciar(r)"><i class="pi pi-play"></i> Iniciar Limpieza</button>
            }
          </article>
        } @empty { <p class="muted">No hay habitaciones pendientes de limpieza.</p> }
      </div>
    </section>

    <!-- Recoger Ropa y Amenities -->
    <p-dialog [(visible)]="iniciarVisible" [modal]="true" [header]="'Recoger Ropa y Amenities · Hab. ' + (selRoom?.number || '')" [style]="{ width: '46rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <p class="hint"><i class="pi pi-info-circle"></i> Marca el estado de cada ítem y si lo recoges. ROBADA deshabilita recoger; DETERIORADA fuerza recoger.</p>
      <table class="insp">
        <thead><tr><th>Ítem</th><th>Estado</th><th class="ck">Recoger</th></tr></thead>
        <tbody>
          @for (row of rows(); track row.item.id) {
            <tr>
              <td><span class="dot" [style.background]="row.item.color || '#888'"></span> {{ typeLabel(row.item.type) }} · {{ row.item.name }}</td>
              <td class="states">
                <button [class.on]="row.state === 'OK'" class="ok" (click)="setState(row, 'OK')">OK</button>
                <button [class.on]="row.state === 'ROBADA'" class="rob" (click)="setState(row, 'ROBADA')">ROBADA</button>
                <button [class.on]="row.state === 'DETERIORADA'" class="det" (click)="setState(row, 'DETERIORADA')">DETERIORADA</button>
              </td>
              <td class="ck"><input type="checkbox" [(ngModel)]="row.pickup" [disabled]="row.state === 'ROBADA' || row.state === 'DETERIORADA'" /></td>
            </tr>
          } @empty { <tr><td colspan="3" class="muted center">No hay ropa configurada para inspeccionar.</td></tr> }
        </tbody>
      </table>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="iniciarVisible = false" />
        <p-button label="Confirmar Recojo" icon="pi pi-check" [loading]="busy()" (onClick)="confirmRecojo()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .gl { background: #0b1410; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6efe9; }
      h1 { margin: 0; color: #fff; } h3 { margin: 1.4rem 0 0.7rem; color: #34d399; } h3.rep { color: #f87171; }
      .count { background: #7f1d1d; color: #fff; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.8rem; margin-left: 0.4rem; }
      .top { display: flex; align-items: center; justify-content: space-between; }
      .refresh { background: #12231b; border: 1px solid #1f3a2c; color: #b9f0d6; border-radius: 8px; padding: 0.5rem 0.8rem; cursor: pointer; }
      .muted { color: #8aa499; } .center { text-align: center; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 1rem; }
      .card { background: linear-gradient(160deg, #14352a, #0e241c); border: 1px solid #1f3a2c; border-radius: 14px; padding: 1.1rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .card.curso { background: linear-gradient(160deg, #6b5d12, #4a3f0c); border-color: #a3870b; }
      .card.repaso { background: linear-gradient(160deg, #5b1a1a, #3a0d0d); border-color: #b91c1c; }
      h3.ges { color: #fbbf24; }
      .card-top { display: flex; align-items: center; justify-content: space-between; }
      .dot-amber { width: 12px; height: 12px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 0 4px rgba(251,191,36,0.2); }
      .num { font-size: 1.3rem; font-weight: 800; color: #fff; } .ty { font-size: 0.78rem; text-transform: uppercase; opacity: 0.9; } .pi-flo { font-size: 0.78rem; opacity: 0.7; }
      .st { font-size: 0.85rem; opacity: 0.9; margin: 0.2rem 0; }
      .timer { display: flex; align-items: center; gap: 0.6rem; margin: 0.6rem 0; padding: 0.7rem 0.9rem; background: rgba(127,29,29,0.45); border: 1px solid #b91c1c; border-radius: 12px; color: #fecaca; }
      .timer .pi { font-size: 1.1rem; }
      .timer .t { display: block; font-size: 1.35rem; font-weight: 800; color: #fca5a5; letter-spacing: 0.04em; }
      .timer small { color: #f87171; font-size: 0.72rem; }
      .cta { margin-top: 0.6rem; width: 100%; background: #ec4899; color: #fff; border: 0; border-radius: 10px; padding: 0.6rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; justify-content: center; }
      .cta.done { background: #10b981; }
      .hint { background: #0e241c; border: 1px solid #1f3a2c; color: #9fe7c4; padding: 0.55rem 0.8rem; border-radius: 8px; font-size: 0.82rem; }
      .insp { width: 100%; border-collapse: collapse; margin-top: 0.6rem; }
      .insp th { text-align: left; padding: 0.5rem; color: #8aa499; font-size: 0.8rem; border-bottom: 1px solid #1f3a2c; } .insp th.ck, .insp td.ck { text-align: center; width: 5rem; }
      .insp td { padding: 0.55rem 0.5rem; border-bottom: 1px solid #14271f; }
      .dot { display: inline-block; width: 0.8rem; height: 0.8rem; border-radius: 50%; margin-right: 0.4rem; vertical-align: middle; border: 1px solid rgba(255,255,255,0.3); }
      .states button { background: transparent; border: 1px solid #2a3f33; color: #cde8db; border-radius: 7px; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.75rem; margin-right: 0.3rem; }
      .states .ok.on { background: #10b981; border-color: #10b981; color: #06281c; font-weight: 700; }
      .states .rob.on { background: #ef4444; border-color: #ef4444; color: #fff; }
      .states .det.on { background: #f59e0b; border-color: #f59e0b; color: #3a2606; font-weight: 700; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1a14; color: #e6efe9; }
    `,
  ],
})
export class GestionLimpiezaComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly rooms = signal<CleanRoom[]>([]);
  readonly linen = signal<LinenItem[]>([]);
  readonly rows = signal<InspRow[]>([]);
  readonly busy = signal(false);
  iniciarVisible = false;
  selRoom: CleanRoom | null = null;
  private readonly tick = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  readonly repasoRooms = computed(() => this.rooms().filter((r) => r.repaso));
  readonly normalRooms = computed(() => this.rooms().filter((r) => !r.repaso));

  ngOnInit(): void {
    this.reload();
    this.loadLinen();
    this.timer = setInterval(() => this.tick.update((v) => v + 1), 1000);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Tiempo transcurrido HH:MM:SS desde el inicio de la limpieza. */
  elapsed(startedAt?: string | null): string {
    void this.tick();
    if (!startedAt) return '00:00:00';
    const ms = Date.now() - new Date(startedAt).getTime();
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(sec)}`;
  }

  reload(): void { this.http.get<ApiResponse<CleanRoom[]>>(`${this.api}/cleaning/rooms`).subscribe((r) => this.rooms.set(r.data ?? [])); }
  loadLinen(): void { this.http.get<ApiResponse<LinenItem[]>>(`${this.api}/cleaning/linen-items`).subscribe((r) => this.linen.set(r.data ?? [])); }
  typeLabel(t: string): string { return TYPE_LABEL[t] ?? t; }

  openIniciar(r: CleanRoom): void {
    this.selRoom = r;
    this.rows.set(this.linen().map((item) => ({ item, state: 'OK', pickup: false })));
    this.iniciarVisible = true;
  }

  setState(row: InspRow, state: 'OK' | 'ROBADA' | 'DETERIORADA'): void {
    row.state = state;
    if (state === 'ROBADA') row.pickup = false;
    if (state === 'DETERIORADA') row.pickup = true;
    this.rows.set([...this.rows()]);
  }

  confirmRecojo(): void {
    if (!this.selRoom) return;
    this.busy.set(true);
    const inspections = this.rows().map((r) => ({ linenItemId: r.item.id, description: `${this.typeLabel(r.item.type)} ${r.item.name}`, state: r.state, pickup: r.pickup }));
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/${this.selRoom.id}/start`, { inspections }).subscribe({
      next: () => { this.busy.set(false); this.iniciarVisible = false; this.toast.add({ severity: 'success', summary: 'Limpieza iniciada', detail: `Hab. ${this.selRoom?.number} en curso` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo iniciar.' }); },
    });
  }

  finish(r: CleanRoom): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/${r.id}/finish`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Limpieza finalizada', detail: `Hab. ${r.number} disponible` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
