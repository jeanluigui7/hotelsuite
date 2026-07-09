import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { OperationsApiService } from '../../operations/services/operations-api.service';
import type { Room } from '../../operations/services/operations.models';

interface RoomItem { linenItemId: string; name: string; type: string; color?: string | null; quantity: number; }
interface FloorItem { linenItemId: string; name: string; type: string; color?: string | null; available: number; enviar?: number | null; }
interface RoomLinen {
  room: { id: string; number: string; floor?: string | null; tower?: string | null; roomType: { id: string; name: string }; linenFloor: string | null };
  items: RoomItem[];
  floorAvailable: FloorItem[];
}

@Component({
  selector: 'app-inventario-inicial',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputNumberModule, SelectModule],
  template: `
    <section class="ii">
      <header class="top">
        <div><h1>Dotar Habitación (primera vez)</h1><p class="muted">Coloca las prendas exactas que quedan en la habitación tomándolas de la ropa disponible en su piso. Esto descuenta del piso y deja la ropa asignada a la habitación; al iniciar la limpieza se recogerá justamente esta ropa.</p></div>
      </header>

      <div class="bar">
        <div class="fld"><label>Habitación</label>
          <p-select [options]="rooms()" [(ngModel)]="roomId" (onChange)="load()" optionValue="id" [filter]="true" filterBy="number" placeholder="Selecciona una habitación" styleClass="dk">
            <ng-template let-r pTemplate="item">Hab. {{ r.number }} · {{ r.roomType?.name }} · Piso {{ r.floor || '-' }}</ng-template>
            <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }} · {{ r.roomType?.name }}</ng-template>
          </p-select>
        </div>
      </div>

      @if (!roomId) {
        <p class="muted empty">Selecciona una habitación para dotarla.</p>
      } @else if (data()) {
        @let d = data()!;
        <div class="grid">
          <!-- Ropa actual en la habitación -->
          <div class="card">
            <div class="ch">Ropa actual en la habitación <small>Hab. {{ d.room.number }}</small></div>
            <table class="tbl">
              <thead><tr><th>Prenda</th><th>Tipo</th><th class="cn">Cantidad</th></tr></thead>
              <tbody>
                @for (it of d.items; track it.linenItemId) {
                  <tr>
                    <td class="nm"><span class="dot" [style.background]="it.color || '#888'"></span>{{ it.name }}</td>
                    <td class="muted">{{ it.type }}</td>
                    <td class="cn"><b>{{ it.quantity }}</b></td>
                  </tr>
                } @empty { <tr><td colspan="3" class="muted center">La habitación aún no tiene ropa dotada.</td></tr> }
              </tbody>
            </table>
          </div>

          <!-- Agregar ropa del piso -->
          <div class="card">
            <div class="ch">Agregar ropa del piso <small>{{ d.room.linenFloor || 'sin piso' }}</small></div>
            @if (!d.room.linenFloor) {
              <p class="muted pad">La habitación no tiene un piso/subalmacén asignado. Configúralo en Inventario › Áreas (cobertura de subalmacenes).</p>
            } @else {
              <table class="tbl">
                <thead><tr><th>Prenda</th><th>Tipo</th><th class="cn">Disp. piso</th><th class="cn">Dotar</th></tr></thead>
                <tbody>
                  @for (f of d.floorAvailable; track f.linenItemId) {
                    <tr>
                      <td class="nm"><span class="dot" [style.background]="f.color || '#888'"></span>{{ f.name }}</td>
                      <td class="muted">{{ f.type }}</td>
                      <td class="cn" [class.zero]="f.available === 0">{{ f.available }}</td>
                      <td class="cn"><p-inputNumber [(ngModel)]="f.enviar" [min]="0" [max]="f.available" inputStyleClass="qty" /></td>
                    </tr>
                  } @empty { <tr><td colspan="4" class="muted center">No hay ropa disponible en el piso. Transfiérela primero desde Almacén de Ropa.</td></tr> }
                </tbody>
              </table>
              <div class="actions">
                @if (anyOver()) { <span class="over"><i class="pi pi-exclamation-triangle"></i> Alguna cantidad supera el disponible del piso.</span> }
                <span class="spacer"></span>
                <button class="btn green" [disabled]="saving() || !dotarReady()" (click)="dotar()"><i class="pi pi-inbox"></i> Dotar habitación ({{ totalDotar() }})</button>
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .ii { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; font-size: 1.6rem; } .muted { color: #8b97a8; } .center { text-align: center; } .empty { padding: 2rem 0; text-align: center; } .pad { padding: 1rem; }
      .bar { display: flex; align-items: flex-end; gap: 0.8rem; margin: 1rem 0; flex-wrap: wrap; }
      .bar .fld { display: flex; flex-direction: column; gap: 0.35rem; } .bar label { font-size: 0.8rem; color: #9fb0c3; }
      :host ::ng-deep .dk { min-width: 300px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; } @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
      .card { background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; overflow: hidden; }
      .ch { background: #101a2c; color: #cdd8e6; font-weight: 700; padding: 0.7rem 1rem; display: flex; justify-content: space-between; align-items: baseline; } .ch small { color: #8b97a8; font-weight: 500; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
      .tbl th { text-align: left; padding: 0.55rem 1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; font-size: 0.74rem; }
      .tbl td { padding: 0.5rem 1rem; border-bottom: 1px solid #16202e; vertical-align: middle; } .tbl tr:last-child td { border-bottom: 0; }
      th.cn, td.cn { text-align: center; } td.cn.zero { color: #f87171; }
      .nm { font-weight: 600; color: #fff; display: flex; align-items: center; gap: 0.45rem; }
      .dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); }
      .actions { display: flex; align-items: center; gap: 0.6rem; padding: 0.8rem 1rem; } .spacer { flex: 1; }
      .over { color: #f87171; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; }
      .btn { border: 0; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; }
      .btn.green { background: #10b981; color: #04130d; } .btn.green:disabled { opacity: 0.5; cursor: not-allowed; }
      :host ::ng-deep .qty { width: 4.4rem; text-align: center; }
    `,
  ],
})
export class InventarioInicialComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly ops = inject(OperationsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly messages = inject(MessageService);

  readonly rooms = signal<Room[]>([]);
  readonly data = signal<RoomLinen | null>(null);
  readonly saving = signal(false);
  roomId: string | null = null;

  ngOnInit(): void {
    this.ops.rooms.list({ pageSize: 300, sortBy: 'number' }).subscribe((r) => this.rooms.set(r.data ?? []));
    const pre = this.route.snapshot.queryParamMap.get('room');
    if (pre) { this.roomId = pre; this.load(); }
  }

  load(): void {
    if (!this.roomId) { this.data.set(null); return; }
    this.http.get<ApiResponse<RoomLinen>>(`${this.api}/rooms/${this.roomId}/linen`)
      .subscribe({ next: (r) => this.data.set(r.data ?? null), error: () => this.data.set(null) });
  }

  private lines(): FloorItem[] { return (this.data()?.floorAvailable ?? []).filter((f) => (Number(f.enviar) || 0) > 0); }
  anyOver(): boolean { return (this.data()?.floorAvailable ?? []).some((f) => (Number(f.enviar) || 0) > f.available); }
  totalDotar(): number { return this.lines().reduce((a, f) => a + (Number(f.enviar) || 0), 0); }
  dotarReady(): boolean { return !this.anyOver() && this.lines().length > 0; }

  dotar(): void {
    if (!this.roomId || !this.dotarReady()) return;
    const items = this.lines().map((f) => ({ linenItemId: f.linenItemId, quantity: Number(f.enviar) || 0 }));
    this.saving.set(true);
    this.http.post<ApiResponse<{ items: number }>>(`${this.api}/rooms/${this.roomId}/dote-linen`, { items }).subscribe({
      next: () => { this.saving.set(false); this.messages.add({ severity: 'success', summary: 'Habitación dotada', detail: `${items.length} prenda(s) asignadas y descontadas del piso.` }); this.load(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo dotar.' }); },
    });
  }
}
