import { Component, EventEmitter, Input, OnDestroy, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Folio {
  folio: { code: string; status: string };
  guest: { name: string; documentNumber?: string | null; phone?: string | null };
  room: { number: string; typeName: string };
  checkInAt: string; plannedCheckoutAt: string; durationMinutes: number; renewals: number;
  amounts: { habitacion: number; renovaciones: number; consumos: number; total: number; paid: number };
  cleaning: { done: number; allowed: number };
  cleaningLog: { at: string; action: string; by: string }[];
  movements: { at: string; type: string; description: string; method?: string; charge: number; payment: number; balance: number; by: string }[];
  products: { name: string; quantity: number; amount: number; at: string; paid: boolean }[];
  simulator: { hospedaje: number; productos: number; ratio: number; limit: number; exceeded: boolean; exceso: number; igvAdicional: number; suggested: number };
}
type Tab = 'resumen' | 'folio' | 'historial' | 'operacion';

@Component({
  selector: 'app-folio-estancia',
  standalone: true,
  imports: [DatePipe, DecimalPipe, DialogModule, ButtonModule],
  template: `
    <p-dialog [visible]="visible" (visibleChange)="onVis($event)" [modal]="true" [style]="{ width: '1000px', maxWidth: '97vw' }" [showHeader]="false" styleClass="fl-dialog" (onShow)="load()">
      @if (data(); as f) {
        <div class="fl">
          <header class="fl-head">
            <div class="fl-id"><span class="ico"><i class="pi pi-file"></i></span>
              <div><div class="ttl">Folio de Estancia <span class="rm">Habitación {{ f.room.number }}</span> · {{ f.guest.name }}</div>
                <div class="sub">Folio <strong>#{{ f.folio.code }}</strong> · Habitación {{ f.room.number }}</div></div>
            </div>
            <div class="fl-right"><span class="badge" [class.act]="f.folio.status === 'Activa'">● {{ f.folio.status }}</span>
              <button class="x" (click)="onVis(false)"><i class="pi pi-times"></i></button></div>
          </header>

          <div class="tabs">
            <button [class.on]="tab() === 'resumen'" (click)="tab.set('resumen')"><i class="pi pi-eye"></i> Resumen</button>
            <button [class.on]="tab() === 'folio'" (click)="tab.set('folio')"><i class="pi pi-chart-line"></i> Folio</button>
            <button [class.on]="tab() === 'historial'" (click)="tab.set('historial')"><i class="pi pi-list"></i> Historial</button>
            <button [class.on]="tab() === 'operacion'" (click)="tab.set('operacion')"><i class="pi pi-clock"></i> Operación</button>
          </div>

          <div class="fl-body">
            <!-- RESUMEN -->
            @if (tab() === 'resumen') {
              <div class="grid2">
                <div class="panel">
                  <h4><i class="pi pi-user"></i> HUÉSPED PRINCIPAL</h4>
                  <div class="g-name">{{ f.guest.name }}</div>
                  <div class="g-meta"><span><i class="pi pi-id-card"></i> {{ f.guest.documentNumber || '—' }}</span><span><i class="pi pi-phone"></i> {{ f.guest.phone || '—' }}</span></div>
                  <div class="g-meta"><span><i class="pi pi-users"></i> 1 / 3 personas</span></div>
                  <div class="bill"><div class="bh"><span>DATOS DE FACTURACIÓN</span></div>
                    <div>Nombre: {{ f.guest.name }}</div><div>DNI: {{ f.guest.documentNumber || '—' }}</div><div>Dir: Sin registrar</div></div>
                </div>
                <div class="panel">
                  <h4><i class="pi pi-calendar"></i> FECHAS Y TIEMPO</h4>
                  <div class="chips">
                    <span class="rchip"><i class="pi pi-refresh"></i> Renovación</span>
                    @if (f.renewals > 0) { <span class="rchip"><i class="pi pi-refresh"></i> {{ f.renewals }} renovación(es) previas</span> }
                  </div>
                  <div class="clean-box"><div><i class="pi pi-bolt"></i> LIMPIEZA PROGRAMADA<br><small>Progreso: {{ f.cleaning.done }}/{{ f.cleaning.allowed }}</small></div></div>
                  <div class="dates2">
                    <div><span>CHECK-IN</span><strong>{{ f.checkInAt | date: 'dd/MM/yyyy, hh:mm a' }}</strong></div>
                    <div><span>CHECK-OUT PROGRAMADO</span><strong>{{ f.plannedCheckoutAt | date: 'dd/MM/yyyy, hh:mm a' }}</strong></div>
                  </div>
                  <div class="timer" [class.exp]="expired()"><i class="pi pi-clock"></i> {{ expired() ? 'TIEMPO EXPIRADO' : 'TIEMPO RESTANTE' }} <strong>{{ remaining() }}</strong></div>
                  <div class="dur"><i class="pi pi-hourglass"></i> Duración: {{ durationLabel(f.durationMinutes) }} (en curso)</div>
                </div>
              </div>

              <div class="money3">
                <div class="mc"><span class="l"><i class="pi pi-home"></i> HABITACIÓN</span><span class="v">S/ {{ f.amounts.habitacion | number: '1.2-2' }}</span><span class="s">{{ f.room.typeName }}</span></div>
                <div class="mc"><span class="l"><i class="pi pi-refresh"></i> RENOVACIONES</span><span class="v">S/ {{ f.amounts.renovaciones | number: '1.2-2' }}</span><span class="s">{{ f.renewals }} período(s)</span></div>
                <div class="mc"><span class="l"><i class="pi pi-shopping-bag"></i> CONSUMOS</span><span class="v">S/ {{ f.amounts.consumos | number: '1.2-2' }}</span><span class="s">{{ f.products.length }} ítem(s)</span></div>
              </div>
              <div class="total-row"><span><i class="pi pi-dollar"></i> TOTAL DE ESTADÍA</span><div class="tr-r"><span class="big">S/ {{ f.amounts.total | number: '1.2-2' }}</span><small>Pagado: S/ {{ f.amounts.paid | number: '1.2-2' }}</small></div></div>

              <div class="sim" [class.bad]="f.simulator.exceeded">
                <h4><i class="pi pi-chart-line"></i> Simulador Límite Productos vs Hospedaje</h4>
                <div class="sim-cols"><div class="sc"><span>Hospedaje</span><strong>S/ {{ f.simulator.hospedaje | number: '1.2-2' }}</strong></div>
                  <div class="sc"><span>Productos</span><strong>S/ {{ f.simulator.productos | number: '1.2-2' }}</strong></div></div>
                <div class="ratio-row"><span>Ratio actual</span><span class="rb" [class.bad]="f.simulator.exceeded">{{ f.simulator.ratio }}% (Límite: {{ f.simulator.limit }}%)</span></div>
                <div class="bar"><div class="fill" [style.width.%]="barWidth(f.simulator.ratio)" [class.bad]="f.simulator.exceeded"></div><div class="mark" [style.left.%]="f.simulator.limit"></div></div>
                @if (f.simulator.exceeded) {
                  <div class="sim-warn"><strong><i class="pi pi-exclamation-circle"></i> Límite excedido</strong>
                    <div class="sw-row"><span>$ Exceso: <b>S/ {{ f.simulator.exceso | number: '1.2-2' }}</b></span><span>% IGV adicional: <b>S/ {{ f.simulator.igvAdicional | number: '1.2-2' }}</b></span></div>
                    <div class="sw-hint">💡 Para estar en {{ f.simulator.limit }}%, hospedaje debería ser: S/ {{ f.simulator.suggested | number: '1.2-2' }}</div></div>
                }
              </div>
              <div class="alerts"><span class="al-t">ALERTAS</span>
                <div>Limpiezas: <strong>{{ f.cleaning.done }} / {{ f.cleaning.allowed }}</strong></div>
                <div class="al-y">• {{ f.cleaning.done < f.cleaning.allowed ? 'Limpieza disponible hoy' : 'Sin limpiezas disponibles' }}</div>
              </div>
            }

            <!-- FOLIO -->
            @if (tab() === 'folio') {
              <div class="tablewrap">
                <table class="ftbl"><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th class="num">+Cargo</th><th class="num">-Pago</th><th class="num">Saldo</th><th>Responsable</th></tr></thead>
                  <tbody>
                    @for (m of f.movements; track $index) {
                      <tr><td class="muted">{{ m.at | date: 'dd/MM/yyyy hh:mm a' }}</td>
                        <td><span class="mtag" [class.pay]="m.type === 'Pago'">{{ m.type }}</span></td>
                        <td>{{ m.description }}</td>
                        <td class="num">{{ m.charge > 0 ? ('S/ ' + (m.charge | number: '1.2-2')) : '—' }}</td>
                        <td class="num pay">{{ m.payment > 0 ? ('S/ ' + (m.payment | number: '1.2-2')) : '—' }}</td>
                        <td class="num" [class.deb]="m.balance > 0">S/ {{ m.balance | number: '1.2-2' }}</td>
                        <td class="muted">{{ m.by }}</td></tr>
                    } @empty { <tr><td colspan="7" class="muted center">Sin movimientos.</td></tr> }
                  </tbody></table>
              </div>
            }

            <!-- HISTORIAL -->
            @if (tab() === 'historial') {
              <div class="panel">
                <h4><i class="pi pi-clock"></i> SEGMENTOS DE ESTADÍA</h4>
                <div class="seg"><span class="sn">1</span><div class="si"><strong>Pernocta</strong><small>Habitación base</small></div><span class="sa">S/ {{ f.amounts.habitacion | number: '1.2-2' }}</span></div>
                @if (f.amounts.renovaciones > 0) {
                  <div class="seg"><span class="sn r">2</span><div class="si"><strong>Renovación</strong><small>{{ f.renewals }} período(s)</small></div><span class="sa">S/ {{ f.amounts.renovaciones | number: '1.2-2' }}</span></div>
                }
              </div>
              <div class="panel">
                <h4><i class="pi pi-shopping-bag"></i> PRODUCTOS <span class="hl">S/ {{ f.amounts.consumos | number: '1.2-2' }}</span></h4>
                @for (p of f.products; track $index) {
                  <div class="prow"><div><strong>{{ p.name }}</strong><small>{{ p.quantity }} unidad(es) · {{ p.at | date: 'dd/MM/yyyy, hh:mm a' }}</small></div>
                    <div class="pr-r"><span class="pa">S/ {{ p.amount | number: '1.2-2' }}</span><span class="pg" [class.ok]="p.paid">{{ p.paid ? 'Pagado' : 'Pendiente' }}</span></div></div>
                } @empty { <p class="muted">Sin productos.</p> }
              </div>
              <div class="panel">
                <h4><i class="pi pi-sparkles"></i> LIMPIEZAS — {{ f.cleaning.done }} / {{ f.cleaning.allowed }} disponibles</h4>
                @for (c of f.cleaningLog; track $index) {
                  <div class="crow"><span>{{ c.at | date: 'dd/MM/yyyy, hh:mm a' }} · <strong>{{ c.action }}</strong></span><span class="muted">{{ c.by }}</span></div>
                } @empty { <p class="muted">Sin registros de limpieza.</p> }
              </div>
            }

            <!-- OPERACIÓN -->
            @if (tab() === 'operacion') {
              <div class="panel">
                <h4><i class="pi pi-clock"></i> OPERACIÓN (SOLO EVENTOS)</h4>
                <div class="evt"><span class="ev-ico in"><i class="pi pi-sign-in"></i></span>
                  <div class="ev-card"><strong>Check-In Original</strong><div class="muted">{{ f.checkInAt | date: 'dd/MM/yyyy, hh:mm a' }}</div><div class="muted">DÍA HOTELERO — Hab. #{{ f.room.number }}</div></div></div>
                @for (p of f.products; track $index) {
                  <div class="evt"><span class="ev-ico sale"><i class="pi pi-dollar"></i></span>
                    <div class="ev-card"><strong>Venta: {{ p.name }}</strong><div class="muted">{{ p.at | date: 'dd/MM/yyyy, hh:mm a' }}</div><div class="muted">{{ p.quantity }} unidad(es)</div></div></div>
                }
              </div>
            }
          </div>

          <footer class="fl-foot">
            <button class="fbtn green"><i class="pi pi-file-edit"></i> Facturar</button>
            <button class="fbtn orange"><i class="pi pi-file"></i> Nota de Crédito/Débito</button>
            <span class="spacer"></span>
            <button class="fbtn ghost" (click)="onVis(false)">Cerrar</button>
          </footer>
        </div>
      } @else { <p class="loading">Cargando folio…</p> }
    </p-dialog>
  `,
  styles: [
    `
      :host ::ng-deep .fl-dialog .p-dialog-content { background: #0a0e1a; color: #e6edf5; padding: 0; }
      .fl { display: flex; flex-direction: column; }
      .fl-head { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.4rem; background: #0f1a2b; border-bottom: 1px solid #1c2c44; }
      .fl-id { display: flex; align-items: center; gap: 0.8rem; }
      .ico { background: #5b21b6; color: #fff; width: 42px; height: 42px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.2rem; }
      .ttl { font-size: 1.15rem; font-weight: 800; } .ttl .rm { color: #8aa0bd; font-weight: 500; }
      .sub { color: #8aa0bd; font-size: 0.8rem; } .sub strong { color: #a78bfa; }
      .fl-right { display: flex; align-items: center; gap: 0.8rem; }
      .badge { font-size: 0.78rem; color: #8aa0bd; } .badge.act { color: #34d399; }
      .x { background: transparent; border: 0; color: #8aa0bd; cursor: pointer; font-size: 1.1rem; }
      .tabs { display: flex; gap: 0.2rem; padding: 0 1.4rem; background: #0f1a2b; border-bottom: 1px solid #1c2c44; }
      .tabs button { background: transparent; border: 0; border-bottom: 2px solid transparent; color: #8aa0bd; padding: 0.8rem 1rem; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .tabs button.on { color: #60a5fa; border-bottom-color: #60a5fa; font-weight: 700; }
      .fl-body { padding: 1.2rem 1.4rem; max-height: 62vh; overflow-y: auto; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .panel { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1.1rem; margin-bottom: 1rem; }
      h4 { margin: 0 0 0.8rem; font-size: 0.82rem; color: #8aa0bd; letter-spacing: 0.03em; display: flex; align-items: center; gap: 0.4rem; }
      h4 .hl { margin-left: auto; color: #fbbf24; } h4 .pi { color: #60a5fa; }
      .g-name { font-size: 1.2rem; font-weight: 800; }
      .g-meta { display: flex; gap: 1.2rem; color: #8aa0bd; font-size: 0.85rem; margin-top: 0.4rem; flex-wrap: wrap; }
      .bill { border: 1px solid #6b4f2a; border-radius: 10px; padding: 0.8rem; margin-top: 0.9rem; font-size: 0.82rem; color: #fcd9a8; }
      .bh { display: flex; justify-content: space-between; color: #fbbf24; font-weight: 700; margin-bottom: 0.4rem; }
      .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
      .rchip { background: rgba(45,212,191,0.15); color: #5eead4; border: 1px solid #155e63; border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.72rem; }
      .clean-box { background: rgba(96,165,250,0.1); border: 1px solid #1e3a8a; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.7rem; color: #93c5fd; font-weight: 700; font-size: 0.82rem; }
      .clean-box small { color: #8aa0bd; font-weight: 400; }
      .dates2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
      .dates2 > div { background: #0b1220; border: 1px solid #1c2c44; border-radius: 8px; padding: 0.5rem 0.7rem; }
      .dates2 span { font-size: 0.66rem; color: #8aa0bd; display: block; } .dates2 strong { font-size: 0.82rem; }
      .timer { margin-top: 0.7rem; background: rgba(127,29,29,0.15); border: 1px solid #7f1d1d; border-radius: 8px; padding: 0.6rem 0.8rem; color: #fca5a5; display: flex; align-items: center; gap: 0.5rem; }
      .timer strong { margin-left: auto; font-size: 1.2rem; letter-spacing: 0.04em; }
      .dur { margin-top: 0.6rem; color: #8aa0bd; font-size: 0.82rem; }
      .money3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
      .mc { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
      .mc .l { font-size: 0.72rem; color: #8aa0bd; display: flex; align-items: center; gap: 0.35rem; } .mc .v { font-size: 1.5rem; font-weight: 800; } .mc .s { font-size: 0.72rem; color: #8aa0bd; }
      .total-row { display: flex; align-items: center; justify-content: space-between; background: linear-gradient(90deg,#1e1b4b,#312e81); border: 1px solid #4338ca; border-radius: 12px; padding: 1rem 1.2rem; margin-bottom: 1rem; }
      .total-row .big { font-size: 1.8rem; font-weight: 800; } .tr-r { text-align: right; } .tr-r small { color: #a5b4fc; display: block; }
      .sim { border: 1px solid #1c2c44; border-radius: 12px; padding: 1.1rem; margin-bottom: 1rem; } .sim.bad { border-color: #b91c1c; }
      .sim-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 0.8rem; }
      .sc { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; } .sc span { font-size: 0.72rem; color: #8aa0bd; display: block; } .sc strong { font-size: 1.2rem; color: #60a5fa; }
      .ratio-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: #8aa0bd; margin-bottom: 0.4rem; }
      .rb { background: #166534; color: #6ee7b7; border-radius: 999px; padding: 0.15rem 0.6rem; font-weight: 700; } .rb.bad { background: #be123c; color: #fff; }
      .bar { position: relative; height: 8px; background: #1c2c44; border-radius: 999px; overflow: visible; }
      .fill { height: 100%; background: #34d399; border-radius: 999px; } .fill.bad { background: #f43f5e; }
      .mark { position: absolute; top: -3px; width: 2px; height: 14px; background: #f87171; }
      .sim-warn { background: rgba(127,29,29,0.2); border: 1px solid #7f1d1d; border-radius: 8px; padding: 0.7rem 0.9rem; margin-top: 0.8rem; color: #fca5a5; font-size: 0.82rem; }
      .sw-row { display: flex; justify-content: space-between; margin-top: 0.3rem; } .sw-hint { margin-top: 0.4rem; color: #fcd34d; }
      .alerts { background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 12px; padding: 1rem; font-size: 0.85rem; }
      .al-t { font-size: 0.7rem; color: #8aa0bd; display: block; margin-bottom: 0.4rem; } .al-y { color: #fbbf24; margin-top: 0.3rem; }
      .tablewrap { overflow-x: auto; border: 1px solid #1c2c44; border-radius: 12px; }
      .ftbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; min-width: 760px; }
      .ftbl th { text-align: left; padding: 0.7rem 0.9rem; color: #8aa0bd; font-weight: 600; border-bottom: 1px solid #1c2c44; background: #0f1a2b; }
      .ftbl td { padding: 0.6rem 0.9rem; border-bottom: 1px solid #16202e; } .ftbl .num { text-align: right; } .ftbl .num.pay { color: #34d399; } .ftbl .num.deb { color: #f87171; }
      .mtag { color: #60a5fa; font-weight: 600; } .mtag.pay { color: #34d399; }
      .muted { color: #8aa0bd; } .center { text-align: center; }
      .seg { display: flex; align-items: center; gap: 0.8rem; background: #0b1220; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.5rem; }
      .seg .sn { width: 1.8rem; height: 1.8rem; border-radius: 50%; background: #4338ca; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; } .seg .sn.r { background: #b45309; }
      .seg .si { flex: 1; } .seg .si small { display: block; color: #8aa0bd; } .seg .sa { color: #34d399; font-weight: 700; }
      .prow, .crow { display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid #16202e; }
      .prow small { display: block; color: #8aa0bd; } .pr-r { text-align: right; } .pa { color: #fbbf24; font-weight: 700; display: block; } .pg { font-size: 0.7rem; color: #8aa0bd; } .pg.ok { color: #34d399; }
      .evt { display: flex; gap: 0.8rem; margin-bottom: 0.7rem; }
      .ev-ico { width: 2rem; height: 2rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; } .ev-ico.in { background: #10b981; color: #04130d; } .ev-ico.sale { background: #0e7490; color: #fff; }
      .ev-card { flex: 1; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.6rem 0.9rem; } .ev-card .muted { font-size: 0.78rem; }
      .fl-foot { display: flex; align-items: center; gap: 0.6rem; padding: 0.9rem 1.4rem; background: #0f1a2b; border-top: 1px solid #1c2c44; }
      .fl-foot .spacer { flex: 1; }
      .fbtn { border: 1px solid #1c2c44; background: #0b1220; color: #e6edf5; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
      .fbtn.green { border-color: #14633f; color: #6ee7b7; } .fbtn.orange { border-color: #b45309; color: #fcd34d; } .fbtn.ghost { color: #8aa0bd; }
      .loading { padding: 2rem; text-align: center; color: #8aa0bd; }
      @media (max-width: 760px) { .grid2, .money3, .sim-cols, .dates2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class FolioEstanciaComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  @Input() visible = false;
  @Input() stayId: string | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();

  readonly data = signal<Folio | null>(null);
  readonly tab = signal<Tab>('resumen');
  readonly nowTick = signal(Date.now());
  private clock?: ReturnType<typeof setInterval>;

  ngOnDestroy(): void { if (this.clock) clearInterval(this.clock); }

  load(): void {
    this.tab.set('resumen');
    this.data.set(null);
    if (!this.stayId) return;
    this.http.get<ApiResponse<Folio>>(`${this.api}/stays/${this.stayId}/folio`).subscribe((r) => this.data.set(r.data));
    if (!this.clock) this.clock = setInterval(() => this.nowTick.set(Date.now()), 1000);
  }

  onVis(v: boolean): void { this.visible = v; this.visibleChange.emit(v); }

  expired(): boolean {
    const d = this.data();
    return d ? new Date(d.plannedCheckoutAt).getTime() - this.nowTick() < 0 : false;
  }
  remaining(): string {
    const d = this.data();
    if (!d) return '00:00:00';
    const ms = new Date(d.plannedCheckoutAt).getTime() - this.nowTick();
    const neg = ms < 0; const t = Math.abs(ms);
    const h = Math.floor(t / 3_600_000); const m = Math.floor((t % 3_600_000) / 60_000); const s = Math.floor((t % 60_000) / 1000);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${neg ? '-' : ''}${p(h)}:${p(m)}:${p(s)}`;
  }
  durationLabel(min: number): string {
    const h = Math.floor(min / 60); const m = min % 60;
    return `${h}h ${m}min`;
  }
  barWidth(ratio: number): number { return Math.min(100, Math.max(0, ratio)); }
}
