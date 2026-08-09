import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { printPdf } from '../../../core/utils/export';

interface Row { linenItemId: string; type: string; name: string; color?: string | null; rem: number; sum: number; }
interface Floor { floor: string; rows: Row[]; }
interface Supply { id: string; roomId: string; room: string; floor?: string | null; roomType?: string; description: string; category?: string; quantity: number; status: string; createdAt: string; }
interface SupplyGroup { roomId: string; room: string; floor?: string | null; roomType?: string; items: Supply[]; }
interface WriteoffRow { id: string; createdAt: string; user: string; floor: string; article: string; type: string; motivo: string; quantity: number; remBefore: number; remAfter: number; baseBefore: number; baseAfter: number; notes: string | null; }

// Colores conocidos por tipo (los ítems de ropa llevan como `type` el NOMBRE de su
// categoría, que varía por sucursal). Se normaliza a mayúsculas para el match.
const TYPE_COLORS: Record<string, string> = {
  TOALLA: '#f97316', TOALLAS: '#f97316',
  SABANA: '#d946ef', SABANAS: '#d946ef', 'SÁBANAS': '#d946ef', SABANAS_: '#d946ef',
  EDREDON: '#eab308', EDREDONES: '#eab308',
  FUNDA: '#22d3ee', FUNDAS: '#22d3ee', COBERTOR: '#a78bfa', COBERTORES: '#a78bfa',
};
const TYPE_PALETTE = ['#f97316', '#d946ef', '#eab308', '#22d3ee', '#a78bfa', '#34d399', '#fb7185', '#60a5fa'];

@Component({
  selector: 'app-inventario-limpieza-rizzos',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule],
  template: `
    <section class="il">
      <header class="top">
        <div>
          <h1>Inventario Limpieza</h1>
          <p class="sub">Usuario: {{ userName() }}</p>
        </div>
        <div class="top-actions">
          <div class="seg">
            <button [class.on]="mode() === 'real'" (click)="mode.set('real')">Tiempo Real</button>
            <button [class.on]="mode() === 'turno'" (click)="mode.set('turno')">Por Turnos</button>
          </div>
          <button class="cerrar" (click)="closeShift()" [disabled]="busy()" title="Pasa lo suministrado (SUM) al remanente (REM) y reinicia SUM a 0"><i class="pi pi-flag"></i> Cerrar Turno</button>
          <button class="icon" (click)="openHistory()" title="Historial de bajas"><i class="pi pi-history"></i></button>
          <button class="icon" (click)="print()" title="Imprimir"><i class="pi pi-print"></i></button>
        </div>
      </header>

      <h3>Inventario de Ropa por Pisos</h3>
      <div class="floors">
        @for (f of floors(); track f.floor) {
          <div class="floor">
            <div class="fh"><i class="pi pi-building"></i> {{ f.floor }}</div>
            <div class="matrix" [style.grid-template-columns]="gridCols()">
              <!-- Cabecera de tipos -->
              <div class="corner"></div>
              @for (c of cols(); track c.type) {
                <div class="thead" [style.background]="c.color">{{ c.label }}</div>
              }
              <!-- Fila REM (remanente del turno anterior; accionable: solicitar / manchada) -->
              <div class="rowlabel rem">REM</div>
              @for (c of cols(); track c.type) {
                <div class="cell rem-cell">
                  @for (r of byType(f, c.type); track r.linenItemId) {
                    @if (r.rem > 0) {
                      <label class="chip">
                        <input type="checkbox" [checked]="isSel(f.floor, r.linenItemId)" (change)="toggle(f.floor, r.linenItemId)" />
                        <span class="dot" [style.background]="r.color || '#888'"></span><b>{{ r.rem }}</b> {{ r.name }}
                      </label>
                    }
                  } @empty { <span class="empty">—</span> }
                </div>
              }
              <!-- Fila SUM (suministrado este turno, solo lectura) -->
              <div class="rowlabel sum">SUM</div>
              @for (c of cols(); track c.type) {
                <div class="cell sum-cell">
                  @for (r of byType(f, c.type); track r.linenItemId) {
                    @if (r.sum > 0) { <span class="chip ro"><span class="dot" [style.background]="r.color || '#888'"></span><b>{{ r.sum }}</b> {{ r.name }}</span> }
                  } @empty { <span class="empty">—</span> }
                </div>
              }
            </div>
            <div class="fbtns">
              <button class="solicitar" [disabled]="floorSelected(f.floor).length === 0" (click)="openRequest(f.floor)">
                <i class="pi pi-send"></i> Solicitar ropa ({{ floorSelected(f.floor).length }})
              </button>
              <button class="manch" [disabled]="floorSelected(f.floor).length === 0" (click)="openLaundry(f.floor)">
                <i class="pi pi-exclamation-triangle"></i> Manchada / Deteriorada
              </button>
              <button class="baja" [disabled]="floorSelected(f.floor).length === 0" (click)="openBaja(f.floor)">
                <i class="pi pi-trash"></i> Dar de baja ({{ floorSelected(f.floor).length }})
              </button>
            </div>
          </div>
        } @empty { <p class="muted">Sin inventario de ropa configurado.</p> }
      </div>

      <h3>Amenities de Limpieza</h3>
      <div class="amen-grid">
        <div class="amen-card">
          <div class="amen-h">{{ amenWh() || 'AMENITIES - LIMPIEZA' }}<small>{{ amenities().length }} items</small></div>
          <div class="amen-sum">SUMINISTRADO</div>
          <div class="amen-list">
            @for (a of amenities(); track a.productId) {
              <div class="amen-row"><span class="an">{{ a.name }}</span><span class="aq">{{ a.quantity }}</span></div>
            } @empty { <p class="muted amen-empty">Aún no se ha suministrado amenities a limpieza. Transfiérelos desde Almacén de Amenities → "Transferir a Limpieza".</p> }
          </div>
        </div>
      </div>

      <h3>Suministros pendientes de entrega</h3>
      <div class="sup-grid">
        @for (g of groups(); track g.roomId) {
          <article class="sup-card">
            <span class="sp-badge"><i class="pi pi-box"></i> Suministro Pendiente</span>
            <div class="sp-num">Hab. {{ g.room }}</div>
            <div class="sp-ty">{{ g.roomType }}</div>
            <div class="sp-flo">Piso {{ g.floor || '-' }}</div>
            <button class="suministrar" (click)="openDeliver(g)"><i class="pi pi-box"></i> Suministrar Habitación</button>
          </article>
        } @empty { <p class="muted">No hay suministros pendientes.</p> }
      </div>
    </section>

    <!-- Confirmar entrega de suministro -->
    <p-dialog [(visible)]="delVisible" [modal]="true" [style]="{ width: '40rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <ng-template pTemplate="header"><div class="del-head"><i class="pi pi-box"></i> Confirmar Entrega - Habitación {{ delGroup?.room }}</div></ng-template>
      <div class="instr"><strong>Instrucciones:</strong> Los siguientes items fueron solicitados desde recepción. Por favor, confirma que los has entregado a la habitación.</div>
      <h4 class="del-h">Items a entregar:</h4>
      @for (it of delGroup?.items || []; track it.id) {
        <div class="del-item">
          <i class="pi pi-check-circle"></i>
          <div><strong>{{ it.description }}</strong><div class="muted">Cantidad: <b>{{ it.quantity }}</b> unidad</div><div class="muted">Categoría: {{ it.category }}</div></div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Rechazar Entrega" icon="pi pi-times-circle" severity="danger" [loading]="busy()" (onClick)="confirmReject()" />
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="delVisible = false" />
        <p-button label="Confirmar Entrega" icon="pi pi-check-circle" severity="success" [loading]="busy()" (onClick)="confirmDeliver()" />
      </ng-template>
    </p-dialog>

    <!-- Solicitar ropa -->
    <p-dialog [(visible)]="reqVisible" [modal]="true" [header]="'Solicitar ropa · ' + reqFloor" [style]="{ width: '30rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (s of floorSelected(reqFloor); track s.linenItemId) {
          <div class="qrow"><span>{{ s.name }}</span><p-inputNumber [(ngModel)]="qty[reqFloor + '|' + s.linenItemId]" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
        <p class="hint"><i class="pi pi-whatsapp"></i> Se enviará un aviso al administrador para que provea la ropa.</p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="reqVisible = false" />
        <p-button label="Enviar solicitud" icon="pi pi-send" [loading]="busy()" (onClick)="sendRequest()" />
      </ng-template>
    </p-dialog>

    <!-- Lavandería / Manchada -->
    <p-dialog [(visible)]="lndVisible" [modal]="true" [header]="'Manchada / Deteriorada · Piso ' + reqFloor" [style]="{ width: '28rem' }" styleClass="dk-dialog">
      <div class="form">
        @for (s of floorSelected(reqFloor); track s.linenItemId) {
          <div class="qrow"><span>{{ s.name }} (disp. {{ avail(s) }})</span><p-inputNumber [(ngModel)]="lndQty[s.linenItemId]" [min]="1" [max]="avail(s)" [showButtons]="true" buttonLayout="horizontal" /></div>
        }
        <label>Motivo</label>
        <input pInputText [(ngModel)]="lndReason" placeholder="Manchada / Deteriorada" />
        <p class="hint"><i class="pi pi-info-circle"></i> Disminuye el remanente y la envía a lavandería.</p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="lndVisible = false" />
        <p-button label="Enviar a lavandería" icon="pi pi-check" [loading]="busy()" (onClick)="sendLaundry()" />
      </ng-template>
    </p-dialog>

    <!-- Dar de Baja Masiva -->
    <p-dialog [(visible)]="bajaVisible" [modal]="true" [style]="{ width: '38rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <ng-template pTemplate="header"><div class="baja-head"><i class="pi pi-trash"></i> Dar de Baja Masiva</div></ng-template>
      <p class="baja-sub">Dando de baja {{ bajaRows.length }} referencia(s) · Piso {{ bajaFloor }}</p>
      <div class="form">
        <label>Motivo</label>
        <p-select [options]="motivos" [(ngModel)]="bajaMotivo" optionLabel="label" optionValue="value" appendTo="body" styleClass="w" />
        <p class="baja-hint">
          @switch (bajaMotivo) {
            @case ('RETORNO') { <i class="pi pi-undo"></i> <span>Se transfirió por error o de más. Devuelve la ropa al <b>almacén</b> (baja el Transferido, sube el Disponible). <b>No altera el Stock Base.</b></span> }
            @case ('DANADO') { <i class="pi pi-exclamation-triangle"></i> <span>Prenda inutilizable. Sale <b>definitivamente</b> del piso y <b>reduce el Stock Base.</b></span> }
            @case ('ROBADO') { <i class="pi pi-ban"></i> <span>Prenda perdida o sustraída. Sale <b>definitivamente</b> del piso y <b>reduce el Stock Base.</b></span> }
          }
        </p>

        <div class="baja-list">
          @for (r of bajaRows; track r.linenItemId; let i = $index) {
            <div class="baja-row">
              <div class="bi">
                <strong><span class="dot" [style.background]="r.color || '#888'"></span>{{ r.name }}</strong>
                <small>Piso: {{ r.floor }} | Remanente | Máx: {{ r.rem }}</small>
              </div>
              <p-inputNumber [(ngModel)]="r.qty" [min]="1" [max]="r.rem" [showButtons]="true" buttonLayout="horizontal" inputStyleClass="qi" />
              <button class="bx" (click)="removeBajaRow(i)" title="Quitar"><i class="pi pi-trash"></i></button>
            </div>
          } @empty { <p class="muted">No hay prendas seleccionadas.</p> }
        </div>

        <label>Notas</label>
        <input pInputText [(ngModel)]="bajaNotes" placeholder="Notas adicionales (opcional)" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="bajaVisible = false" />
        <p-button label="Dar de Baja Productos" icon="pi pi-check" severity="danger" [loading]="busy()" [disabled]="bajaRows.length === 0" (onClick)="confirmBaja()" />
      </ng-template>
    </p-dialog>

    <!-- Historial de Bajas -->
    <p-dialog [(visible)]="histVisible" [modal]="true" header="Historial de Bajas de Ropa" [style]="{ width: '64rem', maxWidth: '97vw' }" styleClass="dk-dialog">
      <div class="hist-wrap">
        <table class="hist">
          <thead><tr><th>Fecha/Hora</th><th>Usuario</th><th>Piso</th><th>Artículo</th><th class="cn">Cant.</th><th>Motivo</th><th class="cn">REM</th><th class="cn">Base</th><th>Notas</th></tr></thead>
          <tbody>
            @for (h of history(); track h.id) {
              <tr>
                <td>{{ h.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
                <td>{{ h.user }}</td>
                <td>{{ h.floor }}</td>
                <td class="art"><b>{{ h.article }}</b><small>{{ h.type }}</small></td>
                <td class="cn">{{ h.quantity }}</td>
                <td><span class="mtag" [class.ret]="h.motivo === 'RETORNO'" [class.dan]="h.motivo === 'DANADO'" [class.rob]="h.motivo === 'ROBADO'">{{ motivoLabel(h.motivo) }}</span></td>
                <td class="cn">{{ h.remBefore }} → {{ h.remAfter }}</td>
                <td class="cn">{{ h.baseBefore }} → {{ h.baseAfter }}</td>
                <td class="nt">{{ h.notes || '—' }}</td>
              </tr>
            } @empty { <tr><td colspan="9" class="muted" style="padding:1rem;text-align:center;">Aún no hay bajas registradas.</td></tr> }
          </tbody>
        </table>
      </div>
    </p-dialog>
  `,
  styles: [
    `
      .il { background: #0b1410; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6efe9; }
      h1 { margin: 0; color: #fff; } h3 { margin: 1.4rem 0 0.7rem; color: #34d399; }
      .sub { margin: 0.1rem 0 0; color: #8aa499; font-size: 0.82rem; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .top-actions { display: flex; align-items: center; gap: 0.6rem; }
      .seg { display: inline-flex; background: #0e241c; border: 1px solid #1f3a2c; border-radius: 9px; padding: 3px; }
      .seg button { background: transparent; border: 0; color: #9fb0c3; padding: 0.4rem 0.8rem; border-radius: 7px; cursor: pointer; font-size: 0.8rem; }
      .seg button.on { background: #7c3aed; color: #fff; }
      .icon { background: #0e241c; border: 1px solid #1f3a2c; color: #b9f0d6; border-radius: 8px; padding: 0.45rem 0.6rem; cursor: pointer; }
      .cerrar { background: #047857; border: 0; color: #fff; border-radius: 8px; padding: 0.45rem 0.85rem; cursor: pointer; font-weight: 700; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.4rem; } .cerrar:hover { background: #059669; } .cerrar:disabled { opacity: 0.5; cursor: not-allowed; }
      .muted { color: #8aa499; }

      .floors { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px,1fr)); gap: 1.1rem; }
      .floor { background: #0f1e28; border: 1px solid #24455a; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.25), 0 10px 26px rgba(0,0,0,0.22); }
      .fh { background: linear-gradient(180deg, #16324a 0%, #112637 100%); text-align: center; font-weight: 800; padding: 0.7rem; color: #fff; letter-spacing: 0.08em; font-size: 0.95rem; border-bottom: 1px solid #24455a; display: flex; align-items: center; justify-content: center; gap: 0.45rem; }
      .fh .pi { color: #5fd0a3; font-size: 0.9rem; }
      .matrix { display: grid; gap: 2px; background: #24455a; padding: 2px; }
      .corner { background: #0f1e28; }
      .thead { color: #14100a; font-weight: 800; font-size: 0.7rem; text-align: center; padding: 0.5rem 0.2rem; letter-spacing: 0.04em; text-shadow: 0 1px 0 rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; }
      .rowlabel { display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.76rem; color: #fff; letter-spacing: 0.05em; }
      .rowlabel.rem { background: linear-gradient(180deg, #dc2626, #b91c1c); } .rowlabel.sum { background: linear-gradient(180deg, #2563eb, #1d4ed8); }
      .cell { padding: 0.45rem; display: flex; flex-direction: column; gap: 0.35rem; min-height: 2.6rem; justify-content: center; }
      .rem-cell { background: #14262f; box-shadow: inset 3px 0 0 rgba(220,38,38,0.55); }
      .sum-cell { background: #0f2130; box-shadow: inset 3px 0 0 rgba(37,99,235,0.55); }
      .empty { color: #45606c; font-size: 0.8rem; text-align: center; }
      .chip { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.79rem; color: #eaf2ec; cursor: pointer; padding: 0.12rem 0.15rem; border-radius: 6px; transition: background 0.12s; } .chip:hover { background: rgba(255,255,255,0.05); }
      .chip b { color: #fff; font-weight: 800; } .chip.ro { cursor: default; }
      .chip input[type=checkbox] { accent-color: #dc2626; width: 0.95rem; height: 0.95rem; }
      .dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); flex: none; }
      .fbtns { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.8rem; }
      .solicitar, .manch, .baja { border: 0; border-radius: 10px; padding: 0.62rem; font-weight: 800; cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; color: #fff; letter-spacing: 0.02em; transition: filter 0.12s, transform 0.05s; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
      .solicitar:hover, .manch:hover, .baja:hover { filter: brightness(1.1); } .solicitar:active, .manch:active, .baja:active { transform: translateY(1px); }
      .solicitar { background: linear-gradient(180deg, #2f6bf0, #2158d8); }
      .manch { background: linear-gradient(180deg, #f59e0b, #d97706); color: #241300; }
      .baja { background: linear-gradient(180deg, #ef4444, #b91c1c); }
      .solicitar:disabled, .manch:disabled, .baja:disabled { opacity: 0.4; cursor: not-allowed; filter: none; box-shadow: none; }

      .baja-head { display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; font-weight: 800; color: #fff; } .baja-head .pi { color: #f87171; }
      .baja-sub { margin: 0 0 0.6rem; color: #8aa499; font-size: 0.84rem; }
      .baja-hint { display: flex; align-items: flex-start; gap: 0.45rem; background: rgba(180,35,35,0.1); border: 1px solid rgba(180,35,35,0.35); border-radius: 10px; padding: 0.6rem 0.8rem; color: #f0c9c9; font-size: 0.8rem; margin: 0.3rem 0 0.3rem; } .baja-hint .pi { margin-top: 0.1rem; color: #f87171; } .baja-hint b { color: #fff; }
      .baja-list { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.3rem; }
      .baja-row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 0.7rem; background: #0e241c; border: 1px solid #1f3a2c; border-radius: 10px; padding: 0.55rem 0.7rem; }
      .baja-row .bi strong { display: flex; align-items: center; gap: 0.35rem; font-size: 0.9rem; color: #e6efe9; } .baja-row .bi small { color: #8aa499; font-size: 0.74rem; }
      .bx { background: transparent; border: 0; color: #f87171; cursor: pointer; padding: 0.3rem 0.4rem; border-radius: 6px; } .bx:hover { background: rgba(248,113,113,0.15); }
      :host ::ng-deep .w { width: 100%; }

      .hist-wrap { overflow-x: auto; }
      .hist { width: 100%; border-collapse: collapse; min-width: 780px; font-size: 0.82rem; }
      .hist thead th { text-align: left; color: #9fb0c3; font-weight: 700; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.5rem 0.6rem; border-bottom: 1px solid #1f3a2c; position: sticky; top: 0; background: #0e1a14; }
      .hist thead th.cn, .hist td.cn { text-align: center; }
      .hist td { padding: 0.5rem 0.6rem; border-bottom: 1px solid #14251d; color: #dbe7f0; vertical-align: middle; }
      .hist td.art b { display: block; } .hist td.art small { color: #8aa499; font-size: 0.72rem; } .hist td.nt { color: #9fb0c3; max-width: 220px; }
      .mtag { font-size: 0.7rem; font-weight: 800; border-radius: 999px; padding: 0.1rem 0.5rem; }
      .mtag.ret { color: #93c5fd; background: rgba(37,99,235,0.18); } .mtag.dan { color: #fbbf24; background: rgba(217,119,6,0.18); } .mtag.rob { color: #fca5a5; background: rgba(180,35,35,0.2); }

      .amen-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; margin-bottom: 0.5rem; }
      .amen-card { background: #0c1f1a; border: 1px solid #14603f; border-radius: 14px; overflow: hidden; }
      .amen-h { background: #0f2a22; color: #6ee7b7; font-weight: 800; text-align: center; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.15rem; } .amen-h small { color: #8aa89b; font-weight: 500; font-size: 0.72rem; }
      .amen-sum { background: #10b981; color: #04130d; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.04em; padding: 0.25rem 0.7rem; }
      .amen-list { padding: 0.3rem 0; }
      .amen-row { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.9rem; border-bottom: 1px solid #10241d; font-size: 0.85rem; } .amen-row:last-child { border-bottom: 0; }
      .amen-row .aq { color: #34d399; font-weight: 800; } .amen-empty { padding: 0.9rem; }
      .sup-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
      .sup-card { background: #11202c; border: 1px solid #1c3340; border-radius: 16px; padding: 1.1rem; text-align: center; display: flex; flex-direction: column; gap: 0.3rem; }
      .sp-badge { align-self: center; background: #ea7a0b; color: #fff; font-weight: 800; font-size: 0.72rem; border-radius: 999px; padding: 0.25rem 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; margin-bottom: 0.4rem; }
      .sp-num { font-size: 1.8rem; font-weight: 800; color: #fff; }
      .sp-ty { font-weight: 700; color: #dbe7f0; letter-spacing: 0.03em; }
      .sp-flo { color: #8aa499; font-size: 0.85rem; }
      .suministrar { margin-top: 0.9rem; background: #10b981; color: #06281c; border: 0; border-radius: 12px; padding: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; }
      .suministrar:hover { background: #34d399; }
      .del-head { display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; font-weight: 800; color: #fff; } .del-head .pi { color: #ea7a0b; }
      .instr { background: rgba(37,99,235,0.1); border: 1px solid rgba(37,99,235,0.4); border-radius: 10px; padding: 0.8rem 1rem; color: #cdd8e6; font-size: 0.88rem; margin-bottom: 0.8rem; } .instr strong { color: #93c5fd; }
      .del-h { margin: 0 0 0.5rem; color: #cdd8e6; font-size: 0.9rem; }
      .del-item { display: flex; gap: 0.7rem; background: #0e241c; border: 1px solid #1f3a2c; border-radius: 12px; padding: 0.9rem 1rem; margin-bottom: 0.5rem; }
      .del-item .pi { color: #34d399; font-size: 1.2rem; } .del-item strong { font-size: 1rem; }
      .form { display: flex; flex-direction: column; gap: 0.5rem; }
      .form label { font-size: 0.85rem; color: #9fb0c3; margin-top: 0.4rem; }
      :host ::ng-deep .form input { width: 100%; }
      .qrow { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
      .hint { color: #9fe7c4; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1a14; color: #e6efe9; }
    `,
  ],
})
export class InventarioLimpiezaRizzosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly floors = signal<Floor[]>([]);
  /**
   * Columnas: SIEMPRE las tres canónicas (Toallas / Sábanas / Edredones) aunque estén
   * vacías, y luego cualquier otra categoría con data (dedup por nombre, sin distinguir
   * mayúsculas). Así se recupera la columna EDREDONES aunque no tenga prendas.
   */
  readonly cols = computed<{ type: string; label: string; color: string }[]>(() => {
    const CANON = [
      { type: 'Toallas', label: 'TOALLAS' },
      { type: 'Sabanas', label: 'SÁBANAS' },
      { type: 'Edredones', label: 'EDREDONES' },
    ];
    const seen = new Set(CANON.map((c) => c.type.toUpperCase()));
    const out = CANON.map((c) => ({ type: c.type, label: c.label, color: TYPE_COLORS[c.type.toUpperCase()] ?? '#888' }));
    const extras: string[] = [];
    for (const f of this.floors()) for (const r of f.rows) {
      const u = (r.type || '').toUpperCase();
      if (r.type && !seen.has(u) && !extras.some((e) => e.toUpperCase() === u)) extras.push(r.type);
    }
    extras.sort((a, b) => a.localeCompare(b, 'es'));
    extras.forEach((t, i) => out.push({ type: t, label: t.toUpperCase(), color: TYPE_COLORS[t.toUpperCase()] ?? TYPE_PALETTE[i % TYPE_PALETTE.length] }));
    return out;
  });
  gridCols(): string { return `3rem ${'1fr '.repeat(Math.max(1, this.cols().length)).trim()}`; }
  readonly amenities = signal<{ productId: string; name: string; code: string | null; quantity: number }[]>([]);
  readonly amenWh = signal<string | null>(null);
  readonly supplies = signal<Supply[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  readonly mode = signal<'real' | 'turno'>('real');
  qty: Record<string, number> = {};
  lndQty: Record<string, number> = {};
  lndReason = '';
  reqVisible = false;
  lndVisible = false;
  reqFloor = '';
  delVisible = false;
  delGroup: SupplyGroup | null = null;

  // Dar de baja masiva
  readonly motivos = [
    { label: 'Retorno', value: 'RETORNO' },
    { label: 'Dañado', value: 'DANADO' },
    { label: 'Robado', value: 'ROBADO' },
  ];
  bajaVisible = false;
  bajaFloor = '';
  bajaMotivo: 'RETORNO' | 'DANADO' | 'ROBADO' = 'RETORNO';
  bajaRows: { linenItemId: string; name: string; color?: string | null; floor: string; rem: number; qty: number }[] = [];
  bajaNotes = '';
  // Historial de bajas
  histVisible = false;
  readonly history = signal<WriteoffRow[]>([]);

  /** Agrupa los suministros pendientes por habitación (una tarjeta por habitación). */
  readonly groups = computed<SupplyGroup[]>(() => {
    const map = new Map<string, SupplyGroup>();
    for (const s of this.supplies()) {
      let g = map.get(s.roomId);
      if (!g) { g = { roomId: s.roomId, room: s.room, floor: s.floor, roomType: s.roomType, items: [] }; map.set(s.roomId, g); }
      g.items.push(s);
    }
    return [...map.values()];
  });

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<{ floors: Floor[] }>>(`${this.api}/cleaning/linen-inventory`).subscribe((r) => this.floors.set(r.data?.floors ?? []));
    this.http.get<ApiResponse<{ warehouse: string | null; items: { productId: string; name: string; code: string | null; quantity: number }[] }>>(`${this.api}/cleaning/amenities-inventory`)
      .subscribe((r) => { this.amenWh.set(r.data?.warehouse ?? null); this.amenities.set(r.data?.items ?? []); });
    this.http.get<ApiResponse<Supply[]>>(`${this.api}/services/supplies?status=PENDING`).subscribe((r) => this.supplies.set(r.data ?? []));
  }

  userName(): string {
    return this.auth.user()?.email?.split('@')[0] ?? 'Limpieza';
  }

  byType(f: Floor, type: string): Row[] {
    const u = type.toUpperCase();
    return f.rows.filter((r) => (r.type || '').toUpperCase() === u);
  }

  /** Disponible del piso = remanente (REM) + suministrado en el turno (SUM). */
  avail(r: Row): number { return (r.rem || 0) + (r.sum || 0); }

  /** Cierra el turno: NUEVO REM = REM + SUM, NUEVO SUM = 0 (en todos los pisos). */
  closeShift(): void {
    if (!confirm('¿Cerrar el turno de ropa? Lo suministrado (SUM) pasará al remanente (REM) y SUM se reinicia a 0. El total disponible no cambia.')) return;
    this.busy.set(true);
    this.http.post<ApiResponse<{ floors: number; moved: number }>>(`${this.api}/admin/linen/close-shift`, {}).subscribe({
      next: (r) => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Turno cerrado', detail: `Se consolidó el remanente en ${r.data?.floors ?? 0} piso(s).` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cerrar el turno.' }); },
    });
  }

  private k(floor: string, id: string): string { return floor + '|' + id; }
  isSel(floor: string, id: string): boolean { return this.selected().has(this.k(floor, id)); }
  toggle(floor: string, id: string): void {
    const s = new Set(this.selected());
    const key = this.k(floor, id);
    if (s.has(key)) s.delete(key);
    else { s.add(key); this.qty[key] = this.qty[key] || 1; }
    this.selected.set(s);
  }

  floorSelected(floor: string): Row[] {
    const f = this.floors().find((x) => x.floor === floor);
    if (!f) return [];
    return f.rows.filter((r) => this.selected().has(this.k(floor, r.linenItemId)));
  }

  openRequest(floor: string): void {
    this.reqFloor = floor;
    for (const s of this.floorSelected(floor)) this.qty[this.k(floor, s.linenItemId)] = this.qty[this.k(floor, s.linenItemId)] || 1;
    this.reqVisible = true;
  }

  sendRequest(): void {
    this.busy.set(true);
    const items = this.floorSelected(this.reqFloor).map((s) => ({ linenItemId: s.linenItemId, floor: this.reqFloor, quantity: this.qty[this.k(this.reqFloor, s.linenItemId)] || 1 }));
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/linen/request`, { items }).subscribe({
      next: () => { this.busy.set(false); this.reqVisible = false; this.clearFloor(this.reqFloor); this.toast.add({ severity: 'success', summary: 'Solicitud enviada', detail: 'Se avisó al administrador.' }); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  openLaundry(floor: string): void {
    this.reqFloor = floor;
    for (const s of this.floorSelected(floor)) this.lndQty[s.linenItemId] = Math.min(this.lndQty[s.linenItemId] || 1, this.avail(s));
    this.lndReason = '';
    this.lndVisible = true;
  }

  sendLaundry(): void {
    const items = this.floorSelected(this.reqFloor);
    if (!items.length) return;
    this.busy.set(true);
    // Envía cada prenda seleccionada de forma secuencial.
    const send = (i: number): void => {
      if (i >= items.length) {
        this.busy.set(false);
        this.lndVisible = false;
        this.clearFloor(this.reqFloor);
        this.toast.add({ severity: 'success', summary: 'Enviado a lavandería', detail: '' });
        this.reload();
        return;
      }
      const s = items[i];
      this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/linen/laundry`, { linenItemId: s.linenItemId, floor: this.reqFloor, quantity: this.lndQty[s.linenItemId] || 1, reason: this.lndReason }).subscribe({
        next: () => send(i + 1),
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
      });
    };
    send(0);
  }

  private clearFloor(floor: string): void {
    const s = new Set(this.selected());
    for (const key of [...s]) if (key.startsWith(floor + '|')) s.delete(key);
    this.selected.set(s);
  }

  openDeliver(g: SupplyGroup): void {
    this.delGroup = g;
    this.delVisible = true;
  }

  /** Confirma la entrega de TODOS los items de la habitación (descuenta inventario). */
  confirmDeliver(): void {
    const g = this.delGroup;
    if (!g) return;
    this.busy.set(true);
    forkJoin(g.items.map((it) => this.http.post<ApiResponse<unknown>>(`${this.api}/services/supplies/${it.id}/deliver`, {}))).subscribe({
      next: () => { this.busy.set(false); this.delVisible = false; this.toast.add({ severity: 'success', summary: 'Entregado', detail: `Hab. ${g.room}: suministro entregado y descontado del inventario.` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  confirmReject(): void {
    const g = this.delGroup;
    if (!g) return;
    this.busy.set(true);
    forkJoin(g.items.map((it) => this.http.post<ApiResponse<unknown>>(`${this.api}/services/supplies/${it.id}/reject`, {}))).subscribe({
      next: () => { this.busy.set(false); this.delVisible = false; this.toast.add({ severity: 'warn', summary: 'Rechazado', detail: `Hab. ${g.room}: entrega rechazada.` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  // ── Dar de baja masiva ──
  openBaja(floor: string): void {
    this.bajaFloor = floor;
    this.bajaMotivo = 'RETORNO';
    this.bajaNotes = '';
    this.bajaRows = this.floorSelected(floor)
      .filter((r) => r.rem > 0)
      .map((r) => ({ linenItemId: r.linenItemId, name: r.name, color: r.color, floor, rem: r.rem, qty: 1 }));
    this.bajaVisible = true;
  }

  removeBajaRow(i: number): void {
    const removed = this.bajaRows[i];
    this.bajaRows = this.bajaRows.filter((_, idx) => idx !== i);
    // Deselecciona el chip correspondiente en la matriz.
    if (removed) {
      const s = new Set(this.selected());
      s.delete(this.k(this.bajaFloor, removed.linenItemId));
      this.selected.set(s);
    }
    if (this.bajaRows.length === 0) this.bajaVisible = false;
  }

  confirmBaja(): void {
    const rows = this.bajaRows
      .filter((r) => (Number(r.qty) || 0) > 0)
      .map((r) => ({ linenItemId: r.linenItemId, floor: r.floor, quantity: Math.min(Number(r.qty) || 1, r.rem) }));
    if (!rows.length) return;
    this.busy.set(true);
    this.http.post<ApiResponse<{ count: number; motivo: string }>>(`${this.api}/admin/linen/writeoff`, { motivo: this.bajaMotivo, notes: this.bajaNotes, rows }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.bajaVisible = false;
        this.clearFloor(this.bajaFloor);
        this.toast.add({ severity: 'success', summary: 'Baja registrada', detail: `${r.data?.count ?? rows.length} prenda(s) dadas de baja por ${this.motivoLabel(this.bajaMotivo)}.` });
        this.reload();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo dar de baja.' }); },
    });
  }

  motivoLabel(m: string): string { return this.motivos.find((x) => x.value === m)?.label ?? m; }

  openHistory(): void {
    this.histVisible = true;
    this.http.get<ApiResponse<WriteoffRow[]>>(`${this.api}/admin/linen/writeoffs`).subscribe((r) => this.history.set(r.data ?? []));
  }

  print(): void {
    const cols = this.cols();
    const body = this.floors()
      .map((f) => {
        const cell = (type: string, key: 'rem' | 'sum'): string =>
          this.byType(f, type).filter((r) => r[key] > 0).map((r) => `${r[key]} ${r.name}`).join('<br>') || '—';
        return `<h2>Piso ${f.floor}</h2><table><thead><tr><th></th>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><td><b>REM</b></td>${cols.map((c) => `<td>${cell(c.type, 'rem')}</td>`).join('')}</tr>
            <tr><td><b>SUM</b></td>${cols.map((c) => `<td>${cell(c.type, 'sum')}</td>`).join('')}</tr>
          </tbody></table>`;
      })
      .join('');
    printPdf('Inventario de Limpieza · RIZZOS', body);
  }
}
