import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { AnulacionService } from './anulacion.service';

/**
 * Modales compartidos de anulación (se montan UNA vez en el shell). Reaccionan a AnulacionService y
 * sirven para check-in y renovación disparados desde Card, Folio o Caja/Movimientos.
 */
@Component({
  selector: 'app-anulacion-modales',
  standalone: true,
  imports: [FormsModule, DecimalPipe, DialogModule, ButtonModule, InputNumberModule],
  template: `
    @if (svc.ctx(); as c) {
      <!-- Paso 1: estado de la habitación -->
      <p-dialog [visible]="svc.visible() && svc.step() === 'estado'" (visibleChange)="!$event && svc.close()" [modal]="true"
                [header]="c.kind === 'CHECKIN' ? 'Estado de Habitación tras anular ingreso' : 'Estado de Habitación tras anular renovación'"
                [style]="{ width: '34rem', maxWidth: '96vw' }" styleClass="dk-dialog">
        <p class="an-sub">Al confirmar la anulación, ¿cómo debe quedar la habitación <strong>{{ c.roomNumber || '—' }}</strong>?</p>

        @if (c.kind === 'RENOVACION') {
          <button class="an-opt occ" [disabled]="svc.busy()" (click)="svc.choose('OCUPADA')">
            <span class="an-ico"><i class="pi pi-moon"></i></span>
            <span class="an-body"><strong>Continúa ocupada</strong><small>Revierte la renovación y mantiene la estadía activa</small></span>
          </button>
        }
        <button class="an-opt free" [disabled]="svc.busy()" (click)="svc.choose('DISPONIBLE')">
          <span class="an-ico"><i class="pi pi-check-circle"></i></span>
          <span class="an-body"><strong>Disponible</strong><small>{{ c.kind === 'CHECKIN' ? 'Queda libre para nueva ocupación' : 'Ya fue limpiada y no tuvo uso posterior' }}</small></span>
        </button>
        <button class="an-opt clean" [disabled]="svc.busy()" (click)="svc.choose('LIMPIEZA')">
          <span class="an-ico"><i class="pi pi-sparkles"></i></span>
          <span class="an-body"><strong>{{ c.kind === 'CHECKIN' ? 'Limpieza en espera (sin uso)' : 'Limpieza en espera' }}</strong><small>Pasa a pendiente de limpieza</small></span>
        </button>
        <button class="an-opt use" [disabled]="svc.busy()" (click)="svc.choose('LIMPIEZA_USO')">
          <span class="an-ico"><i class="pi pi-exclamation-triangle"></i></span>
          <span class="an-body"><strong>Limpieza en espera (con uso)</strong><small>Pasa a pendiente de limpieza y permite registrar penalidad</small></span>
        </button>

        <ng-template pTemplate="footer">
          <p-button label="Cancelar" severity="secondary" [text]="true" [disabled]="svc.busy()" (onClick)="svc.close()" />
        </ng-template>
      </p-dialog>

      <!-- Paso 2: registrar penalidad por uso -->
      <p-dialog [visible]="svc.visible() && svc.step() === 'penalidad'" (visibleChange)="!$event && svc.close()" [modal]="true"
                header="Registrar penalidad por uso" [style]="{ width: '40rem', maxWidth: '96vw' }" styleClass="dk-dialog">
        <p class="an-sub">Se detectó uso parcial de la habitación <strong>{{ c.roomNumber || '—' }}</strong>. Completa el registro de la penalidad.</p>
        <div class="an-grid">
          <div><label>Tipo</label><div class="an-ro">Penalidades</div></div>
          <div><label>Concepto</label><div class="an-ro">Uso parcial de habitación</div></div>
          <div><label>Importe (S/)</label><p-inputNumber [(ngModel)]="penaltyAmount" [min]="0" mode="decimal" [minFractionDigits]="2" styleClass="w" /></div>
          <div><label>Origen</label><div class="an-ro">{{ c.kind === 'CHECKIN' ? 'Anulación de check-in' : 'Anulación de renovación' }}</div></div>
        </div>
        <label>Observación</label>
        <textarea [(ngModel)]="observation" rows="2" placeholder="Ej. Usó baño y toalla antes de retirarse"></textarea>

        @if ((c.paidAmount || 0) > 0) {
          <div class="an-sum">
            <div class="an-sum-h"><i class="pi pi-file"></i> Resumen de devolución</div>
            <div class="an-row"><span>Pagado por el cliente</span><b>S/ {{ c.paidAmount || 0 | number: '1.2-2' }}</b></div>
            <div class="an-row"><span>Penalidad por uso</span><b class="neg">- S/ {{ penaltyAmount | number: '1.2-2' }}</b></div>
            <div class="an-row tot"><span>Monto a devolver</span><b>S/ {{ montoDevolver() | number: '1.2-2' }}</b></div>
          </div>
          <p class="an-note"><i class="pi pi-info-circle"></i> La penalidad se descuenta del monto a devolver y se conserva aunque la estadía se anule. La devolución queda <strong>pendiente de confirmación</strong>.</p>
        } @else {
          <p class="an-note"><i class="pi pi-info-circle"></i> No hay dinero pagado para descontar: la penalidad quedará como <strong>deuda</strong> del cliente.</p>
        }

        <ng-template pTemplate="footer">
          <p-button label="Volver" severity="secondary" [text]="true" [disabled]="svc.busy()" (onClick)="svc.step.set('estado')" />
          <p-button label="Registrar penalidad" icon="pi pi-check" [loading]="svc.busy()" [disabled]="penaltyAmount == null || penaltyAmount < 0" (onClick)="confirm()" />
        </ng-template>
      </p-dialog>
    }
  `,
  styles: [`
    :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0b1220; color: #e6edf5; }
    .an-sub { color: #9fb0c3; margin: 0 0 1rem; }
    .an-opt { display: flex; align-items: center; gap: 0.9rem; width: 100%; text-align: left; margin-bottom: 0.7rem; padding: 0.9rem 1rem; border-radius: 14px; border: 1px solid #22314a; background: #0f1a2b; color: #e6edf5; cursor: pointer; }
    .an-opt:hover { border-color: #3a567f; } .an-opt:disabled { opacity: 0.6; cursor: default; }
    .an-ico { flex: 0 0 auto; width: 2.7rem; height: 2.7rem; border-radius: 12px; display: grid; place-items: center; font-size: 1.2rem; }
    .an-opt.free .an-ico { background: rgba(16,185,129,.16); color: #34d399; }
    .an-opt.clean .an-ico { background: rgba(176,122,0,.18); color: #e0a93a; }
    .an-opt.use .an-ico { background: rgba(220,53,53,.18); color: #f87171; }
    .an-opt.occ .an-ico { background: rgba(37,99,235,.2); color: #7aa2ff; }
    .an-body { display: flex; flex-direction: column; } .an-body strong { font-size: 1rem; } .an-body small { color: #9fb0c3; font-size: 0.82rem; }
    label { display: block; font-size: 0.78rem; color: #9fb0c3; margin: 0.6rem 0 0.25rem; }
    .an-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
    @media (max-width: 560px) { .an-grid { grid-template-columns: 1fr; } }
    .an-ro { background: #0f1a2b; border: 1px solid #22314a; border-radius: 9px; padding: 0.55rem 0.7rem; color: #cdd8e6; }
    textarea { width: 100%; background: #0f1a2b; border: 1px solid #22314a; color: #e6edf5; border-radius: 9px; padding: 0.55rem 0.7rem; font: inherit; resize: vertical; }
    :host ::ng-deep .w .p-inputnumber, :host ::ng-deep .w input { width: 100%; }
    .an-sum { margin-top: 1rem; background: #0f1a2b; border: 1px solid #22314a; border-radius: 12px; padding: 0.8rem 1rem; }
    .an-sum-h { font-weight: 700; color: #cfe0f5; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.5rem; }
    .an-row { display: flex; justify-content: space-between; padding: 0.25rem 0; color: #cdd8e6; } .an-row b { color: #e6edf5; } .an-row .neg { color: #f87171; }
    .an-row.tot { border-top: 1px solid #22314a; margin-top: 0.3rem; padding-top: 0.5rem; font-size: 1.05rem; } .an-row.tot b { color: #34d399; }
    .an-note { font-size: 0.82rem; color: #e0a93a; background: rgba(176,122,0,.1); border: 1px solid rgba(176,122,0,.3); border-radius: 9px; padding: 0.55rem 0.7rem; margin-top: 0.8rem; }
  `],
})
export class AnulacionModalesComponent {
  readonly svc = inject(AnulacionService);
  penaltyAmount: number | null = 5;
  observation = '';
  readonly montoDevolver = computed(() => Math.max(0, Math.round(((this.svc.ctx()?.paidAmount || 0) - (this.penaltyAmount || 0)) * 100) / 100));
  confirm(): void { this.svc.confirmPenalty(this.penaltyAmount ?? 0, this.observation); }
}
