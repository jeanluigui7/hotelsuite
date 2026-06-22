import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface CleanRoom { id: string; number: string; floor?: string | null; status: string; typeName: string; repaso: boolean; mantenimiento?: boolean; enCurso: boolean; revision?: boolean; taskId: string | null; startedAt?: string | null; }
interface LinenItem { id: string; type: string; name: string; color?: string | null; reusable: boolean; }
interface InspRow { item: LinenItem; tipo: 'BASE' | 'EXTRA'; state: 'OK' | 'ROBADA' | 'DETERIORADA'; pickup: boolean; }
interface RepoRow { section: string; tipo: string; name: string; code: string; type: string | null; color: string | null; cant: number; mantiene: boolean; motivo: string; subName?: string; subIndex?: number; }

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sábana', EDREDON: 'Edredón', AMENITY: 'Amenity' };

/** Catálogo registrado de fallas por categoría (seleccionables en la revisión). */
const FALLAS: Record<string, string[]> = {
  MOBILIARIO: ['Mueble roto', 'Cajón dañado', 'Silla inestable', 'Closet/puerta dañada', 'Mesa de noche dañada', 'Otro'],
  ARTEFACTOS: ['TV no enciende', 'Frigobar no enfría', 'Aire acondicionado no funciona', 'Control remoto dañado', 'Secadora dañada', 'Otro'],
  BANO: ['Fuga de agua', 'Inodoro tapado', 'Grifo goteando', 'Ducha dañada', 'Espejo roto', 'Falta presión de agua', 'Otro'],
  CAMA: ['Colchón manchado', 'Cama rota', 'Cabecera suelta', 'Base dañada', 'Otro'],
  ELECTRICIDAD: ['Foco quemado', 'Tomacorriente dañado', 'Interruptor no funciona', 'Cableado expuesto', 'Otro'],
  PAREDES: ['Mancha/humedad', 'Pintura descascarada', 'Hueco o grieta', 'Papel mural dañado', 'Otro'],
  PUERTA: ['Cerradura dañada', 'Bisagra suelta', 'Puerta no cierra', 'Tarjeta/llave no funciona', 'Otro'],
  VENTANAS: ['Vidrio roto', 'Cortina dañada', 'Ventana no cierra', 'Espejo rajado', 'Otro'],
  REPARACION: ['Remodelación pendiente', 'Reparación mayor', 'Cambio de equipo', 'Otro'],
};

/** Acciones periódicas registradas (Mantenimiento Periódico). */
const ACCIONES_PERIODICAS = [
  'Cambio de cortinas', 'Reemplazo de colchones', 'Cambio de chapas y cerraduras',
  'Cambio de vidrios dañados', 'Limpieza profunda de ventiladores', 'Limpieza de paredes', 'Limpieza inodoro',
];

@Component({
  selector: 'app-gestion-limpieza',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, SelectModule],
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

      @if (revisionRooms().length) {
        <h3 class="rev"><i class="pi pi-wrench"></i> En Revisión de Mantenimiento <span class="count purple">{{ revisionRooms().length }}</span></h3>
        <div class="grid">
          @for (r of revisionRooms(); track r.id) {
            <article class="card revision">
              <div class="card-top"><div class="num">Hab. {{ r.number }}</div><span class="dot-purple"></span></div>
              <div class="ty">{{ r.typeName }}</div><div class="pi-flo">Piso {{ r.floor || '-' }}</div>
              <div class="timer rev-t"><i class="pi pi-clock"></i><div><span class="t">{{ elapsed(r.startedAt) }}</span><small>Revisión en curso</small></div></div>
              <button class="cta rev-btn" (click)="openRevPer(r)"><i class="pi pi-check"></i> Finalizar Revisión PERIÓDICA</button>
            </article>
          }
        </div>
      }

      @if (mantenimientoRooms().length) {
        <h3 class="mnt"><i class="pi pi-wrench"></i> Enviadas a Mantenimiento <span class="count red">{{ mantenimientoRooms().length }}</span></h3>
        <div class="grid">
          @for (r of mantenimientoRooms(); track r.id) {
            <article class="card mantenimiento">
              <div class="num">Hab. {{ r.number }}</div><div class="ty">{{ r.typeName }}</div><div class="pi-flo">Piso {{ r.floor || '-' }}</div>
              <div class="st">En mantenimiento</div>
              <button class="cta" (click)="openIniciar(r)"><i class="pi pi-play"></i> Iniciar Limpieza</button>
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
              <button class="cta done" (click)="openFinalizar(r)"><i class="pi pi-check"></i> Finalizar Limpieza</button>
            } @else {
              <div class="st">Limpieza en espera</div>
              <button class="cta" (click)="openIniciar(r)"><i class="pi pi-play"></i> Iniciar Limpieza</button>
            }
          </article>
        } @empty { <p class="muted">No hay habitaciones pendientes de limpieza.</p> }
      </div>
    </section>

    <!-- Iniciar limpieza: FASE 1 (Recoger) → Confirmar Recojo -->
    <p-dialog [(visible)]="iniciarVisible" [modal]="true"
              [header]="(iniStep === 'fase1' ? 'FASE 1: Recoger Ropa y Amenities – Habitación ' : 'Confirmar Recojo – Habitación ') + (selRoom?.number || '')"
              [style]="{ width: '52rem', maxWidth: '96vw' }" styleClass="dk-dialog">
      @if (iniStep === 'fase1') {
        <p class="sub">Marca el estado de cada ítem y decide si recogerlo (☑) o dejarlo (☐)</p>
        <div class="instr">
          <strong><i class="pi pi-info-circle"></i> Instrucciones</strong>
          <p>☑ <b>RECOGER:</b> Sábanas/toallas van a lavandería y se reponen. Edredones van a lavandería pero NO se reponen automáticamente.</p>
          <p>☐ <b>DEJAR:</b> Los items permanecen en la habitación. Edredones regresan al almacén. Sin reposición.</p>
          <p><b>ROBADA/AUSENTE:</b> Se marca como "—". Sábanas/toallas se reponen automáticamente. Edredones solo por orden de Recepción.</p>
          <p><b>DETERIORADA:</b> Fuerza ☑ RECOGER. Sábanas/toallas se reponen. Edredones solo por orden de Recepción.</p>
        </div>
        <div class="insp2">
          <div class="ir ih"><span>Item</span><span>Cantidad</span><span>Estado</span><span class="rc">Recoger</span></div>
          @for (row of rows(); track $index) {
            <div class="ir">
              <div class="it"><strong>{{ row.item.name }}</strong><small>{{ typeLabel(row.item.type) }} · {{ row.tipo }} @if (row.tipo === 'EXTRA') { <span class="oblig">⚠ Recoger obligatorio</span> }</small></div>
              <div class="qty"><span class="qb">1</span></div>
              <div class="states2">
                <button [class.on]="row.state === 'OK'" class="ok" (click)="setState(row, 'OK')">OK</button>
                <button [class.on]="row.state === 'ROBADA'" class="rob" (click)="setState(row, 'ROBADA')">ROBADA</button>
                <button [class.on]="row.state === 'DETERIORADA'" class="det" (click)="setState(row, 'DETERIORADA')">DETERIORADA</button>
              </div>
              <div class="rc">
                @if (row.state === 'ROBADA') { <span class="dash">—</span> }
                @else {
                  <input type="checkbox" [checked]="row.pickup" [disabled]="!canToggle(row)" (change)="togglePickup(row)" />
                  @if (forced(row)) { <small class="forced">(Forzado)</small> }
                }
              </div>
              <div class="ir-note"><i class="pi pi-info-circle"></i> {{ noteFor(row) }}</div>
            </div>
          } @empty { <div class="ir"><span class="muted" style="grid-column:1/-1">No hay ropa configurada.</span></div> }
        </div>
        <div class="done-bar"><span><i class="pi pi-check-circle"></i> Todos los items completados</span><span>{{ rows().length }} / {{ rows().length }} completados</span></div>
      } @else {
        <p class="sub">Revisa el resumen de tu selección antes de confirmar</p>
        <div class="confbox recoger">
          <div class="cb-h">☑ Items a RECOGER ({{ recogerList().length }})</div>
          @for (row of recogerList(); track $index) { <div class="cb-row"><span>{{ row.item.name }}</span><span><span class="qb">1</span> <span class="ok-badge">{{ row.state }}</span></span></div> }
          @if (!recogerList().length) { <div class="cb-row muted">Ninguno</div> }
        </div>
        <div class="confbox dejar">
          <div class="cb-h">☐ Items a DEJAR ({{ dejarList().length }})</div>
          @for (row of dejarList(); track $index) { <div class="cb-row"><span>{{ row.item.name }}</span><span><span class="qb">1</span> <span class="ok-badge">{{ row.state }}</span></span></div> }
          @if (!dejarList().length) { <div class="cb-row muted">Ninguno</div> }
        </div>
        <div class="rep-info"><p><i class="pi pi-info-circle"></i> <strong>¿Estás seguro?</strong></p><p>Una vez confirmado, esta acción registrará el recojo de items y no podrá deshacerse. Si cometiste un error, presiona "Volver" para corregir.</p></div>
      }
      <ng-template pTemplate="footer">
        @if (iniStep === 'fase1') {
          <p-button label="Cancelar" [text]="true" (onClick)="iniciarVisible = false" />
          <p-button label="Siguiente" icon="pi pi-arrow-right" iconPos="right" (onClick)="iniStep = 'confirmar'" />
        } @else {
          <p-button label="Volver" icon="pi pi-arrow-left" severity="secondary" (onClick)="iniStep = 'fase1'" />
          <p-button label="Confirmar Recojo" icon="pi pi-check" [loading]="busy()" (onClick)="confirmRecojo()" />
        }
      </ng-template>
    </p-dialog>

    <!-- Finalizar limpieza: Reposición → Revisión de Mantenimiento -->
    <p-dialog [(visible)]="finVisible" [modal]="true" [header]="(finStep === 'reposicion' ? 'Reposición · Hab. ' : 'Revisión de Mantenimiento · Hab. ') + (finRoom?.number || '')" [style]="{ width: '40rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      @if (finStep === 'reposicion') {
        <p class="hint"><i class="pi pi-info-circle"></i> Confirma los ítems a reponer <span class="ck-badge">CHECKOUT</span> {{ repoCount() }} items</p>

        <h4 class="rep-h"><i class="pi pi-bookmark"></i> Ropa <span class="frac">{{ repoRopaRepuestos() }}/{{ reposicion().ropa.length }}</span></h4>
        <div class="rep-tbl">
          <div class="rep-row rh"><span>Tipo</span><span>Item</span><span>Cant.</span><span>Motivo</span></div>
          @for (r of reposicion().ropa; track $index) {
            <div class="rep-row">
              <span><span class="base">BASE</span></span>
              <span class="it"><strong>{{ r.subName || r.name }}</strong><small>{{ r.code }}</small></span>
              <span>@if (r.mantiene) { <span class="mant">MANTIENE</span> } @else { <span class="cant"><i class="pi pi-check-circle"></i> {{ r.cant }}</span> }</span>
              <span class="motivo">{{ r.mantiene ? 'Permanece en habitación' : r.motivo }} @if (!r.mantiene && r.type) { <button class="refresh-i" (click)="cycleSub(r)" title="Cambiar color/sustituto"><i class="pi pi-sync"></i></button> }</span>
            </div>
          } @empty { <div class="rep-row"><span class="muted" style="grid-column:1/-1">Sin ropa recogida.</span></div> }
        </div>

        <h4 class="rep-h"><i class="pi pi-sparkles"></i> Amenities <span class="frac">{{ repoAmenRepuestos() }}/{{ reposicion().amenities.length }}</span></h4>
        <div class="rep-tbl">
          <div class="rep-row rh"><span>Tipo</span><span>Item</span><span>Cant.</span><span>Motivo</span></div>
          @for (r of reposicion().amenities; track $index) {
            <div class="rep-row">
              <span><span class="base">BASE</span></span>
              <span class="it"><strong>{{ r.name }}</strong><small>{{ r.code }}</small></span>
              <span>@if (r.mantiene) { <span class="mant">MANTIENE</span> } @else { <span class="cant"><i class="pi pi-check-circle"></i> {{ r.cant }}</span> }</span>
              <span class="motivo">{{ r.motivo }}</span>
            </div>
          } @empty { <div class="rep-row"><span class="muted" style="grid-column:1/-1">Sin amenities recogidos.</span></div> }
        </div>

        <div class="rep-info">
          <p><i class="pi pi-info-circle"></i> <strong>Información:</strong></p>
          <ul><li>CHECKOUT: solo ítems BASE.</li><li>Ítems TARIFA / VENTA y PREMIUM no se reponen.</li><li>Ítems con "—" permanecen en habitación.</li></ul>
        </div>
      } @else {
        <p class="hint"><i class="pi pi-info-circle"></i> Verifica el estado de la habitación e informa cualquier problema detectado.</p>
        <h4 class="q">¿Todo está en buen estado?</h4>
        <div class="okno">
          <button [class.on]="todoOk === true" (click)="setOk(true)"><i class="pi pi-check-circle"></i> Sí, todo OK</button>
          <button class="no" [class.on]="todoOk === false" (click)="setOk(false)"><i class="pi pi-exclamation-circle"></i> No, hay problemas</button>
        </div>
        @if (todoOk === false) {
          <h4>Selecciona los items con problemas</h4>
          <div class="cats">
            @for (c of cats; track c.key) {
              <div class="cat" [class.open]="c.selected">
                <button class="cat-h" (click)="c.selected = !c.selected"><input type="checkbox" [checked]="c.selected" /> {{ c.label }} <i class="pi" [class.pi-chevron-down]="c.selected" [class.pi-chevron-right]="!c.selected"></i></button>
                @if (c.selected) {
                  <div class="cat-b">
                    <small class="muted">{{ c.hint }}</small>
                    <label>Selecciona la Falla Detectada *</label>
                    <p-select [options]="fallasFor(c.key)" [(ngModel)]="c.falla" placeholder="Selecciona una falla..." styleClass="wsel" />
                    @if (!c.falla) { <div class="req"><i class="pi pi-exclamation-triangle"></i> Selecciona una falla específica para continuar</div> }
                    <label>Observación</label>
                    <textarea [(ngModel)]="c.observacion" rows="2" placeholder="Describe el problema..."></textarea>
                  </div>
                }
              </div>
            }
          </div>
          <label>Observaciones Generales (Opcional)</label>
          <input pInputText [(ngModel)]="obsGenerales" placeholder="Comentarios adicionales sobre la habitación..." />
        }
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="finVisible = false" />
        @if (finStep === 'reposicion') {
          <p-button label="Siguiente" icon="pi pi-arrow-right" iconPos="right" (onClick)="finStep = 'revision'" />
        } @else {
          <p-button label="Finalizar Limpieza" icon="pi pi-check" [disabled]="!canFinalizar()" [loading]="busy()" (onClick)="confirmFinalizar()" />
        }
      </ng-template>
    </p-dialog>

    <!-- Mantenimiento Periódico (Finalizar Revisión Periódica) -->
    <p-dialog [(visible)]="revPerVisible" [modal]="true" [header]="'Mantenimiento Periódico - Hab. ' + (revPerRoom?.number || '')" [style]="{ width: '42rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <p class="sub">Marca los items con problemas y selecciona las acciones periódicas realizadas.</p>
      <div class="rev-status" [class.bad]="revHasProblems()">
        <i class="pi" [class.pi-check-circle]="!revHasProblems()" [class.pi-exclamation-circle]="revHasProblems()"></i>
        <div><strong>{{ revHasProblems() ? 'Problemas detectados' : 'Sin problemas detectados' }}</strong><br><small>{{ revCats.length }} items | {{ selAcc().length }} acciones seleccionadas</small></div>
      </div>

      <h4 class="rp-h"><i class="pi pi-exclamation-triangle"></i> Marcar items con problemas</h4>
      <div class="cats">
        @for (c of revCats; track c.key) {
          <div class="cat" [class.open]="c.selected">
            <button class="cat-h" (click)="c.selected = !c.selected"><input type="checkbox" [checked]="c.selected" /> {{ c.label }} <i class="pi" [class.pi-chevron-down]="c.selected" [class.pi-chevron-right]="!c.selected"></i></button>
            @if (c.selected) {
              <div class="cat-b">
                <label>Selecciona la Falla Detectada *</label>
                <p-select [options]="fallasFor(c.key)" [(ngModel)]="c.falla" placeholder="Selecciona una falla..." styleClass="wsel" />
                @if (!c.falla) { <div class="req"><i class="pi pi-exclamation-triangle"></i> Selecciona una falla específica para continuar</div> }
                <label>Observación</label><textarea [(ngModel)]="c.observacion" rows="2" placeholder="Describe el problema..."></textarea>
              </div>
            }
          </div>
        }
      </div>

      <div class="acc-box" [class.warn]="selAcc().length === 0">
        <div class="acc-head"><span><i class="pi pi-sync"></i> Acciones Periódicas Realizadas</span><span class="acc-count">{{ selAcc().length }} seleccionadas</span></div>
        <small class="muted">Selecciona las acciones periódicas que realizaste (mínimo 1).</small>
        <div class="acc-grid">
          @for (a of revActions; track a.label) {
            <label class="acc" [class.on]="a.sel"><input type="checkbox" [(ngModel)]="a.sel" /> {{ a.label }}</label>
          }
        </div>
        @if (selAcc().length === 0) { <div class="req"><i class="pi pi-exclamation-triangle"></i> Debes seleccionar al menos 1 acción periódica</div> }
      </div>

      <div class="rp-foot">
        <div><label>Turno</label><div class="turno-chip"><i class="pi pi-moon"></i> {{ turnoActual() }} <span class="auto">Automático</span></div></div>
        <div><label>Imagen (Obligatoria)</label>
          <div class="foto-row">
            <label class="foto-btn"><i class="pi pi-camera"></i> {{ revFoto ? 'Cambiar foto' : 'Tomar Foto' }}<input type="file" accept="image/*" capture="environment" (change)="onFoto($event)" hidden /></label>
            @if (revFoto) { <img [src]="revFoto" class="foto-prev" alt="foto" /> }
          </div>
        </div>
      </div>
      <label>Observaciones Generales</label>
      <textarea [(ngModel)]="revObs" rows="2" placeholder="Comentarios adicionales (opcional)..."></textarea>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="revPerVisible = false" />
        <p-button [label]="revHasProblems() ? 'Finalizar con observación' : 'Finalizar - Todo OK'" icon="pi pi-check-circle" [disabled]="!canRevPer()" [loading]="busy()" (onClick)="confirmRevPer()" />
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
      .card.revision { background: linear-gradient(160deg, #3b1c63, #1e1040); border-color: #7c3aed; }
      .card.mantenimiento { background: linear-gradient(160deg, #b91c1c, #7f1d1d); border-color: #ef4444; }
      .count.red { background: #ef4444; }
      h3.ges { color: #fbbf24; } h3.rev { color: #a78bfa; }
      .count.purple { background: #5b21b6; color: #fff; }
      .dot-purple { width: 12px; height: 12px; border-radius: 50%; background: #a78bfa; box-shadow: 0 0 0 4px rgba(167,139,250,0.2); }
      .timer.rev-t { background: rgba(124,58,237,0.25); border-color: #7c3aed; color: #ddd6fe; }
      .timer.rev-t .t { color: #c4b5fd; }
      .cta.rev-btn { background: #7c3aed; }
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

      /* FASE 1 (Iniciar limpieza) */
      .sub { color: #8aa499; margin: 0 0 0.8rem; font-size: 0.85rem; }
      .instr { background: rgba(59,130,246,0.08); border: 1px solid #1e40af; border-radius: 10px; padding: 0.8rem 1rem; margin-bottom: 1rem; color: #cdd8e6; font-size: 0.8rem; }
      .instr strong { color: #93c5fd; display: block; margin-bottom: 0.4rem; } .instr p { margin: 0.25rem 0; } .instr b { color: #e6efe9; }
      .insp2 { border: 1px solid #1f3a2c; border-radius: 10px; overflow: hidden; }
      .ir { display: grid; grid-template-columns: 2fr 0.7fr 2fr 1fr; gap: 0.6rem; align-items: center; padding: 0.7rem 0.9rem; border-top: 1px solid #14271f; }
      .ir.ih { background: #12231b; border-top: 0; color: #8aa499; font-size: 0.75rem; }
      .ir .it strong { display: block; } .ir .it small { color: #8aa499; }
      .oblig { color: #fbbf24; } .qb { background: #14271f; border-radius: 999px; padding: 0.1rem 0.6rem; font-weight: 700; }
      .states2 { display: flex; gap: 0.3rem; flex-wrap: wrap; }
      .states2 button { background: #0b1410; border: 1px solid #2a3f33; color: #cde8db; border-radius: 7px; padding: 0.35rem 0.6rem; cursor: pointer; font-size: 0.74rem; }
      .states2 .ok.on { background: #10b981; border-color: #10b981; color: #06281c; font-weight: 700; }
      .states2 .rob.on { background: #ef4444; border-color: #ef4444; color: #fff; }
      .states2 .det.on { background: #f59e0b; border-color: #f59e0b; color: #3a2606; font-weight: 700; }
      .rc { text-align: center; } .ir .rc { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; }
      .dash { color: #8aa499; font-weight: 700; font-size: 1.1rem; } .forced { color: #fbbf24; font-size: 0.66rem; }
      .ir-note { grid-column: 1 / -1; background: #0b1923; border-radius: 6px; padding: 0.4rem 0.6rem; color: #9fb0c3; font-size: 0.74rem; display: flex; align-items: center; gap: 0.4rem; }
      .done-bar { display: flex; align-items: center; justify-content: space-between; margin-top: 0.8rem; background: rgba(16,185,129,0.1); border: 1px solid #14633f; color: #6ee7b7; border-radius: 8px; padding: 0.6rem 0.9rem; font-size: 0.85rem; }
      .confbox { border-radius: 10px; padding: 0.9rem; margin-bottom: 0.8rem; }
      .confbox.recoger { border: 1px solid #14633f; } .confbox.dejar { border: 1px solid #6b4f2a; }
      .cb-h { font-weight: 700; margin-bottom: 0.5rem; } .confbox.recoger .cb-h { color: #6ee7b7; } .confbox.dejar .cb-h { color: #fbbf24; }
      .cb-row { display: flex; align-items: center; justify-content: space-between; padding: 0.45rem 0.6rem; border-radius: 8px; background: #0b1410; margin-bottom: 0.35rem; }
      .ok-badge { background: #10b981; color: #04130d; border-radius: 6px; padding: 0.05rem 0.4rem; font-size: 0.7rem; font-weight: 700; }

      /* Mantenimiento Periódico */
      .rev-status { display: flex; align-items: center; gap: 0.7rem; border: 1px solid #14633f; background: rgba(16,185,129,0.08); border-radius: 10px; padding: 0.8rem 1rem; color: #6ee7b7; margin-bottom: 1rem; }
      .rev-status.bad { border-color: #b45309; background: rgba(245,158,11,0.08); color: #fbbf24; }
      .rev-status .pi { font-size: 1.4rem; } .rev-status small { color: #8aa499; }
      .rp-h { color: #fbbf24; display: flex; align-items: center; gap: 0.4rem; margin: 0.8rem 0 0.5rem; }
      .acc-box { border: 1px solid #1f3a2c; border-radius: 12px; padding: 1rem; margin: 1rem 0; }
      .acc-box.warn { border-color: #6b4f2a; }
      .acc-head { display: flex; align-items: center; justify-content: space-between; color: #a78bfa; font-weight: 700; }
      .acc-count { background: #2e1065; color: #c4b5fd; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.72rem; }
      .acc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.6rem; }
      .acc { display: flex; align-items: center; gap: 0.5rem; background: #0b1410; border: 1px solid #1f3a2c; border-radius: 10px; padding: 0.7rem 0.8rem; cursor: pointer; font-size: 0.85rem; }
      .acc.on { border-color: #7c3aed; color: #c4b5fd; }
      .rp-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 0.6rem 0; }
      .turno-chip { background: #12231b; border: 1px solid #1f3a2c; border-radius: 10px; padding: 0.6rem 0.8rem; display: flex; align-items: center; gap: 0.5rem; }
      .turno-chip .auto { background: #14271f; color: #9fe7c4; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.7rem; margin-left: auto; }
      .foto-btn { display: inline-flex; align-items: center; gap: 0.5rem; background: #fbeef4; color: #be185d; border-radius: 10px; padding: 0.6rem 0.9rem; cursor: pointer; font-weight: 700; }
      .foto-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
      .foto-prev { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid #1f3a2c; }
      :host ::ng-deep .dk-dialog textarea { width: 100%; background: #0b1410; border: 1px solid #1f3a2c; color: #e6efe9; border-radius: 8px; padding: 0.5rem 0.7rem; font: inherit; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1a14; color: #e6efe9; }
      .rep-info { background: rgba(59,130,246,0.1); border: 1px solid #1e40af; border-radius: 10px; padding: 0.8rem 1rem; color: #bfdbfe; font-size: 0.85rem; margin-top: 0.8rem; }
      .rep-info ul { margin: 0.3rem 0 0; padding-left: 1.1rem; }
      .ck-badge { background: #065f46; color: #6ee7b7; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.7rem; font-weight: 700; }
      .rep-h { color: #e6efe9; margin: 1rem 0 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
      .rep-h .frac { background: #14271f; color: #9fe7c4; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.72rem; }
      .rep-tbl { border: 1px solid #1f3a2c; border-radius: 10px; overflow: hidden; }
      .rep-row { display: grid; grid-template-columns: 4rem 1.6fr 0.8fr 2fr; gap: 0.5rem; align-items: center; padding: 0.55rem 0.8rem; border-top: 1px solid #14271f; font-size: 0.82rem; }
      .rep-row.rh { background: #12231b; border-top: 0; color: #8aa499; font-size: 0.72rem; }
      .base { background: #064e3b; color: #6ee7b7; border: 1px solid #14633f; border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.68rem; font-weight: 700; }
      .it strong { display: block; } .it small { color: #8aa499; }
      .cant { color: #34d399; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 700; }
      .mant { background: #1e3a8a; color: #93c5fd; border-radius: 6px; padding: 0.1rem 0.5rem; font-size: 0.68rem; font-weight: 700; }
      .motivo { color: #9fe7c4; display: flex; align-items: center; gap: 0.4rem; }
      .refresh-i { background: transparent; border: 0; color: #34d399; cursor: pointer; }
      .q { color: #34d399; margin: 0.8rem 0 0.5rem; }
      .okno { display: flex; gap: 0.6rem; margin-bottom: 0.8rem; }
      .okno button { flex: 1; background: #0e241c; border: 1px solid #1f3a2c; color: #e6efe9; border-radius: 10px; padding: 0.8rem; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }
      .okno button.on { background: #10b981; color: #04130d; } .okno button.no.on { background: #ef4444; color: #fff; }
      .cats { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.6rem; }
      .cat { border: 1px solid #1f3a2c; border-radius: 10px; overflow: hidden; }
      .cat-h { width: 100%; background: #0e241c; border: 0; color: #e6efe9; padding: 0.7rem 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; text-align: left; }
      .cat-h .pi { margin-left: auto; }
      .cat-b { padding: 0.7rem 0.9rem; display: flex; flex-direction: column; gap: 0.3rem; background: #0b1923; }
      .cat-b label { font-size: 0.8rem; color: #9fb0c3; margin-top: 0.3rem; }
      :host ::ng-deep .cat-b input, :host ::ng-deep .cat-b textarea, :host ::ng-deep .cat-b .wsel { width: 100%; }
      .cat-b textarea { background: #0b1410; border: 1px solid #1f3a2c; color: #e6efe9; border-radius: 8px; padding: 0.5rem 0.7rem; font: inherit; }
      .req { background: rgba(245,158,11,0.12); border: 1px solid #b45309; color: #fbbf24; border-radius: 8px; padding: 0.4rem 0.6rem; font-size: 0.78rem; display: flex; align-items: center; gap: 0.4rem; }
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
  iniStep: 'fase1' | 'confirmar' = 'fase1';
  selRoom: CleanRoom | null = null;

  // Finalizar limpieza (Reposición → Revisión de Mantenimiento)
  finVisible = false;
  finStep: 'reposicion' | 'revision' = 'reposicion';
  finRoom: CleanRoom | null = null;
  todoOk: boolean | null = null;
  obsGenerales = '';
  readonly reposicion = signal<{ ropa: RepoRow[]; amenities: RepoRow[] }>({ ropa: [], amenities: [] });
  cats: { key: string; label: string; hint: string; selected: boolean; falla: string; observacion: string }[] = [];
  // Mantenimiento Periódico
  revPerVisible = false;
  revPerRoom: CleanRoom | null = null;
  revCats: { key: string; label: string; hint: string; selected: boolean; falla: string; observacion: string }[] = [];
  revActions: { label: string; sel: boolean }[] = [];
  revFoto: string | null = null;
  revObs = '';
  private readonly CATS = [
    { key: 'MOBILIARIO', label: 'MOBILIARIO', hint: 'Revisar muebles, cajones, sillas.' },
    { key: 'ARTEFACTOS', label: 'ARTEFACTOS ELÉCTRICOS', hint: 'TV, frigobar, A/C, control remoto.' },
    { key: 'BANO', label: 'BAÑO', hint: 'Revisar baños: fugas, goteos, inodoro.' },
    { key: 'CAMA', label: 'CAMA/COLCHÓN/CABECERA', hint: 'Estado de cama, colchón, cabecera.' },
    { key: 'ELECTRICIDAD', label: 'ELECTRICIDAD/ILUMINACIÓN', hint: 'Focos, tomas, interruptores.' },
    { key: 'PAREDES', label: 'PAREDES', hint: 'Manchas, humedad, pintura.' },
    { key: 'PUERTA', label: 'PUERTA/CERRADURAS', hint: 'Chapas, seguros, bisagras.' },
    { key: 'VENTANAS', label: 'VENTANAS/ESPEJOS', hint: 'Vidrios, espejos, cortinas.' },
    { key: 'REPARACION', label: 'REPARACIÓN / REMODELACIÓN', hint: 'Trabajos mayores pendientes.' },
  ];
  private readonly tick = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  readonly repasoRooms = computed(() => this.rooms().filter((r) => r.repaso));
  readonly revisionRooms = computed(() => this.rooms().filter((r) => r.revision));
  readonly mantenimientoRooms = computed(() => this.rooms().filter((r) => r.mantenimiento && !r.enCurso));
  readonly normalRooms = computed(() => this.rooms().filter((r) => !r.repaso && !r.revision && !(r.mantenimiento && !r.enCurso)));

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
    this.iniStep = 'fase1';
    // BASE: la ropa/amenities del inventario; por defecto se recogen (sábanas/toallas/amenities).
    const base: InspRow[] = this.linen().map((item) => ({ item, tipo: 'BASE' as const, state: 'OK' as const, pickup: item.type !== 'EDREDON' }));
    this.rows.set(base);
    this.iniciarVisible = true;
    // EXTRA: suministros pendientes de la habitación (recoger obligatorio).
    this.http.get<ApiResponse<{ id: string; room: string; description: string }[]>>(`${this.api}/services/supplies?status=PENDING`).subscribe((res) => {
      const sups = (res.data ?? []).filter((s) => s.room === r.number);
      if (!sups.length) return;
      const extras: InspRow[] = sups.map((s) => ({ item: { id: 'sup-' + s.id, type: 'AMENITY', name: s.description, reusable: true }, tipo: 'EXTRA' as const, state: 'OK' as const, pickup: true }));
      this.rows.set([...this.rows(), ...extras]);
    });
  }

  setState(row: InspRow, state: 'OK' | 'ROBADA' | 'DETERIORADA'): void {
    row.state = state;
    if (state === 'ROBADA') row.pickup = false; // marcado "—", reposición automática
    else if (state === 'DETERIORADA') row.pickup = true; // fuerza recoger
    else if (row.tipo === 'EXTRA') row.pickup = true; // EXTRA siempre se recoge
    this.rows.set([...this.rows()]);
  }
  /** Solo los BASE en estado OK pueden alternarse; EXTRA/DETERIORADA forzados, ROBADA "—". */
  canToggle(row: InspRow): boolean { return row.tipo === 'BASE' && row.state === 'OK'; }
  forced(row: InspRow): boolean { return row.state !== 'ROBADA' && (row.tipo === 'EXTRA' || row.state === 'DETERIORADA'); }
  togglePickup(row: InspRow): void { if (this.canToggle(row)) { row.pickup = !row.pickup; this.rows.set([...this.rows()]); } }
  private effPickup(row: InspRow): boolean { return row.state === 'ROBADA' ? false : (this.forced(row) || row.pickup); }
  noteFor(row: InspRow): string {
    if (row.state === 'ROBADA') return 'Marcado como ausente "—" → reposición automática (sábanas/toallas).';
    if (row.state === 'DETERIORADA') return 'Deteriorada → se recoge y se repone.';
    if (row.tipo === 'EXTRA') return 'Suministro adicional → se recoge obligatoriamente (no se repone).';
    if (row.item.type === 'AMENITY') return 'Se recoge → va al inventario correspondiente.';
    return this.effPickup(row)
      ? 'Se recoge → va a lavandería y se repone automáticamente.'
      : 'Se deja en la habitación → permanece hasta la próxima limpieza (sin reposición).';
  }
  recogerList(): InspRow[] { return this.rows().filter((r) => this.effPickup(r)); }
  dejarList(): InspRow[] { return this.rows().filter((r) => !this.effPickup(r)); }

  confirmRecojo(): void {
    if (!this.selRoom) return;
    this.busy.set(true);
    const inspections = this.rows().map((r) => ({
      linenItemId: r.item.id.startsWith('sup-') ? undefined : r.item.id,
      description: `${this.typeLabel(r.item.type)} ${r.item.name}`,
      state: r.state,
      pickup: this.effPickup(r),
    }));
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

  openFinalizar(r: CleanRoom): void {
    this.finRoom = r;
    this.finStep = 'reposicion';
    this.todoOk = null;
    this.obsGenerales = '';
    this.cats = this.CATS.map((c) => ({ ...c, selected: false, falla: '', observacion: '' }));
    this.reposicion.set({ ropa: [], amenities: [] });
    this.http.get<ApiResponse<{ ropa: RepoRow[]; amenities: RepoRow[] }>>(`${this.api}/cleaning/${r.id}/reposicion`).subscribe((res) => this.reposicion.set(res.data ?? { ropa: [], amenities: [] }));
    this.finVisible = true;
  }
  setOk(v: boolean): void { this.todoOk = v; }
  repoCount(): number { return this.reposicion().ropa.length + this.reposicion().amenities.length; }
  repoRopaRepuestos(): number { return this.reposicion().ropa.filter((r) => !r.mantiene).length; }
  repoAmenRepuestos(): number { return this.reposicion().amenities.filter((r) => !r.mantiene).length; }
  /** "Ruedita de refrescar": intercala el sustituto entre prendas del mismo tipo. */
  cycleSub(r: RepoRow): void {
    const same = this.linen().filter((l) => l.type === r.type);
    if (same.length < 2) { this.toast.add({ severity: 'info', summary: 'Sin sustitutos', detail: 'No hay otro color/prenda del mismo tipo en inventario.' }); return; }
    r.subIndex = ((r.subIndex ?? 0) + 1) % same.length;
    const li = same[r.subIndex];
    r.subName = `${TYPE_LABEL[r.type ?? ''] ?? ''} ${li.name}`.trim();
    this.reposicion.set({ ...this.reposicion() });
  }
  fallasFor(key: string): string[] { return FALLAS[key] ?? ['Otro']; }
  /** Habilita Finalizar: todo OK, o cada categoría marcada tiene una falla seleccionada. */
  canFinalizar(): boolean {
    if (this.todoOk === null) return false;
    if (this.todoOk === true) return true;
    const sel = this.cats.filter((c) => c.selected);
    return sel.length > 0 && sel.every((c) => !!c.falla);
  }
  confirmFinalizar(): void {
    const r = this.finRoom;
    if (!r || this.todoOk === null) return;
    const problems = this.todoOk
      ? []
      : this.cats.filter((c) => c.selected).map((c) => ({ category: c.label, falla: c.falla, observacion: c.observacion }));
    this.busy.set(true);
    this.http.post<ApiResponse<{ maintenance: boolean }>>(`${this.api}/cleaning/${r.id}/finish`, { problems, observacionesGenerales: this.obsGenerales }).subscribe({
      next: (res) => {
        this.busy.set(false); this.finVisible = false;
        const m = res.data?.maintenance;
        this.toast.add({ severity: 'success', summary: 'Limpieza finalizada', detail: m ? `Hab. ${r.number} → Mantenimiento (problemas registrados)` : `Hab. ${r.number} disponible` });
        this.reload();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }

  // --- Mantenimiento Periódico (Finalizar Revisión Periódica) ---
  openRevPer(r: CleanRoom): void {
    this.revPerRoom = r;
    this.revCats = this.CATS.map((c) => ({ ...c, selected: false, falla: '', observacion: '' }));
    this.revActions = ACCIONES_PERIODICAS.map((label) => ({ label, sel: false }));
    this.revFoto = null;
    this.revObs = '';
    this.revPerVisible = true;
  }
  selAcc(): { label: string }[] { return this.revActions.filter((a) => a.sel); }
  revHasProblems(): boolean { return this.revCats.some((c) => c.selected); }
  turnoActual(): string { const h = new Date().getHours(); return h >= 7 && h < 15 ? 'Mañana' : h >= 15 && h < 23 ? 'Tarde' : 'Noche'; }
  onFoto(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toast.add({ severity: 'warn', summary: 'Archivo inválido', detail: 'Selecciona una imagen.' }); input.value = ''; return; }
    if (file.size > 15 * 1024 * 1024) { this.toast.add({ severity: 'warn', summary: 'Imagen muy grande', detail: 'Máximo 15 MB.' }); input.value = ''; return; }
    // Comprime a máx 1024px / JPEG 0.6 para una miniatura ligera (la foto no se sube en bruto).
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1024;
        let { width, height } = img;
        if (width > max || height > max) { const s = max / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        this.revFoto = canvas.toDataURL('image/jpeg', 0.6);
      };
      img.onerror = () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo leer la imagen.' });
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }
  /** Foto obligatoria + al menos 1 acción; cada problema marcado requiere su falla. */
  canRevPer(): boolean {
    if (!this.revFoto || this.selAcc().length === 0) return false;
    return this.revCats.filter((c) => c.selected).every((c) => !!c.falla);
  }
  confirmRevPer(): void {
    const r = this.revPerRoom;
    if (!r || !this.canRevPer()) return;
    const problems = this.revCats.filter((c) => c.selected);
    const status = problems.length ? 'ISSUE' : 'OK';
    const tipoFalla = (problems.map((c) => `${c.label}: ${c.falla}`).join(' · ') || '').slice(0, 300) || undefined;
    const obs = [this.revObs, ...problems.filter((c) => c.observacion).map((c) => `${c.label}: ${c.observacion}`)].filter(Boolean).join(' | ');
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/revision`, {
      // Solo se envía una marca de foto (no el base64) para no exceder el límite del servidor.
      roomId: r.id, status, tipoFalla, acciones: this.selAcc().map((a) => a.label), observaciones: obs, photo: this.revFoto ? 'foto-adjunta' : undefined,
    }).subscribe({
      next: () => { this.busy.set(false); this.revPerVisible = false; this.toast.add({ severity: 'success', summary: 'Revisión finalizada', detail: status === 'OK' ? `Hab. ${r.number} disponible` : `Hab. ${r.number}: observaciones registradas` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
