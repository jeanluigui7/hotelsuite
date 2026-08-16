import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface PosMethod { enabled: boolean; pct: number }
interface OperationsConfig {
  branchName: string;
  blindCash: boolean;
  cutoffHour: number;
  reservaMarginMin: number;
  minPriceEnabled: boolean;
  commissionsEnabled: boolean;
  pos: { transfer: PosMethod; yape: PosMethod; plin: PosMethod; credit: PosMethod; debit: PosMethod };
  cleaningTimeLimitMin: number;
  inspectionEnabled: boolean;
  preCheckoutEnabled: boolean;
  stockAlertEveryHours: number;
  reception: { declareStay: boolean; roomChange: boolean; productWriteoff: boolean; creditNote: boolean };
  cleaning: { linenWriteoff: boolean };
}

const DEFAULTS: OperationsConfig = {
  branchName: '',
  blindCash: false,
  cutoffHour: 12,
  reservaMarginMin: 60,
  minPriceEnabled: false,
  commissionsEnabled: false,
  pos: {
    transfer: { enabled: false, pct: 0 },
    yape: { enabled: false, pct: 0 },
    plin: { enabled: false, pct: 0 },
    credit: { enabled: false, pct: 5 },
    debit: { enabled: false, pct: 5 },
  },
  cleaningTimeLimitMin: 12,
  inspectionEnabled: true,
  preCheckoutEnabled: false,
  stockAlertEveryHours: 24,
  reception: { declareStay: false, roomChange: false, productWriteoff: false, creditNote: false },
  cleaning: { linenWriteoff: false },
};

@Component({
  selector: 'app-operations-config',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink, ToggleSwitchModule, InputNumberModule, ButtonModule],
  template: `
    <section class="wrap">
      <header class="head">
        <div>
          <h1>Configuración Operativa</h1>
          <p class="branch">Configurando parámetros de: <strong>{{ auth.activeBranch()?.name || cfg.branchName }}</strong></p>
        </div>
        @if (canEdit) {
          <p-button label="Guardar configuración" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
        }
      </header>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else {
        <div class="grid">

          <!-- ===== BLOQUE A ===== -->
          <div class="block-title">A · Estadías y operación hotelera</div>

          <article class="card">
            <h3>Pernoctación</h3>
            <p class="desc">Define el comportamiento de las tarifas de pernoctación. El día hotelero no usa 24h rígidas: la pernocta vence a la hora de corte (ej. ingreso martes 17:00 → salida miércoles a la hora de corte).</p>
            <label>Hora de corte</label>
            <p-inputNumber [(ngModel)]="cfg.cutoffHour" [min]="0" [max]="23" suffix=":00" [disabled]="!canEdit" styleClass="w" />
          </article>

          <article class="card">
            <h3>Reservas</h3>
            <p class="desc">Define con cuánta anticipación una reserva bloquea la habitación. Una reserva sin hora definida se maneja con las reglas generales del sistema.</p>
            <label>Margen de bloqueo (minutos)</label>
            <p-inputNumber [(ngModel)]="cfg.reservaMarginMin" [min]="0" [max]="1440" suffix=" min" [disabled]="!canEdit" styleClass="w" />
            <p class="hint">Ej.: reserva 18:00 con margen 60 → la habitación queda bloqueada desde las 17:00.</p>
          </article>

          <article class="card">
            <div class="sw-head"><h3>Tarifa Descuento / Precio mínimo</h3><p-toggleswitch [(ngModel)]="cfg.minPriceEnabled" [disabled]="!canEdit" /></div>
            <p class="desc">Al activarlo, recepción puede usar la <strong>Tarifa Descuento</strong> cuando una tarifa tenga configurado un precio mínimo permitido. Si está inactivo, recepción no dispone de esa opción (admin/gerencia conserva sus permisos).</p>
            <p class="hint">El valor de cada tarifa se configura en Configuraciones → Tarifas. Aquí solo se habilita la función.</p>
          </article>

          <!-- ===== BLOQUE B ===== -->
          <div class="block-title">B · Caja, pagos y comisiones</div>

          <article class="card">
            <div class="sw-head"><h3>Caja Ciega</h3><p-toggleswitch [(ngModel)]="cfg.blindCash" [disabled]="!canEdit" /></div>
            <p class="desc">Caja ciega para Recepción. <strong>Activa:</strong> recepción no ve el efectivo esperado ni diferencias/faltantes/sobrantes; al cerrar solo declara cuánto entrega, y administración audita después. <strong>Inactiva:</strong> cierre detallado según permisos.</p>
            <p class="hint">Reemplaza a la antigua opción “Administrador presente” (misma configuración, una sola fuente de verdad).</p>
          </article>

          <article class="card">
            <div class="sw-head"><h3>Comisiones</h3><p-toggleswitch [(ngModel)]="cfg.commissionsEnabled" [disabled]="!canEdit" /></div>
            <p class="desc">Comisiones habilitadas. Si está activo, el sistema calcula las comisiones configuradas. Si está inactivo, se conservan las configuraciones pero no se generan recargos nuevos.</p>
          </article>

          <article class="card wide">
            <h3>Comisiones POS / Tarjeta</h3>
            <p class="desc">Habilita individualmente los medios de pago que generan comisión. Controla solo el recargo; los métodos de pago se administran en su fuente maestra.</p>
            @if (!cfg.commissionsEnabled) {
              <p class="pos-lock"><i class="pi pi-info-circle"></i> Activa el switch <strong>Comisiones</strong> (arriba) para que estos recargos se apliquen. Con Comisiones desactivado no se cobra ninguna comisión, aunque un método esté marcado.</p>
            }
            <div class="pos-tbl" [class.dimmed]="!cfg.commissionsEnabled">
              <div class="pos-row pos-h"><span>Medio</span><span class="c">Activo</span><span class="c">% comisión</span><span class="r">Ejemplo S/100</span></div>
              @for (m of posRows; track m.key) {
                <div class="pos-row">
                  <span>{{ m.label }}</span>
                  <span class="c"><p-toggleswitch [(ngModel)]="cfg.pos[m.key].enabled" [disabled]="!canEdit || !cfg.commissionsEnabled" /></span>
                  <span class="c"><p-inputNumber [(ngModel)]="cfg.pos[m.key].pct" [min]="0" [max]="100" suffix=" %" [disabled]="!canEdit || !cfg.commissionsEnabled || !cfg.pos[m.key].enabled" styleClass="pct" /></span>
                  <span class="r">S/ {{ (100 * (1 + (cfg.commissionsEnabled && cfg.pos[m.key].enabled ? cfg.pos[m.key].pct : 0) / 100)) | number: '1.2-2' }}</span>
                </div>
              }
            </div>
          </article>

          <!-- ===== BLOQUE C ===== -->
          <div class="block-title">C · Limpieza e inspección</div>

          <article class="card">
            <h3>Limpieza</h3>
            <p class="desc">Genera una alerta operativa cuando una limpieza excede este tiempo. Las dotaciones base tienen su propia configuración.</p>
            <label>Tiempo límite de limpieza (minutos)</label>
            <p-inputNumber [(ngModel)]="cfg.cleaningTimeLimitMin" [min]="0" [max]="600" suffix=" min" [disabled]="!canEdit" styleClass="w" />
          </article>

          <article class="card">
            <div class="sw-head"><h3>Sistema de Inspecciones</h3><p-toggleswitch [(ngModel)]="cfg.inspectionEnabled" [disabled]="!canEdit" /></div>
            <p class="desc">Inspección de habitaciones: determina si tras ciertos procesos de limpieza la habitación debe pasar por inspección antes de continuar.</p>
            <div class="sw-row"><p-toggleswitch [(ngModel)]="cfg.preCheckoutEnabled" [disabled]="!canEdit" /><div><strong>PRE CHECK OUT</strong><small class="block">Permite una inspección preventiva antes del Check Out definitivo.</small></div></div>
            <a routerLink="/settings/inspeccion" class="link-btn"><i class="pi pi-external-link"></i> Ir a Gestión de ítems y penalidades</a>
          </article>

          <!-- ===== BLOQUE D ===== -->
          <div class="block-title">D · Inventario y stock</div>

          <article class="card">
            <h3>Stock Mínimo</h3>
            <p class="desc">Cuando un producto baja de su stock mínimo genera alerta y sigue recordando mientras siga por debajo. El stock mínimo de cada artículo se configura en el catálogo; aquí solo la frecuencia global del aviso.</p>
            <label>Repetir aviso cada (horas)</label>
            <p-inputNumber [(ngModel)]="cfg.stockAlertEveryHours" [min]="0" [max]="720" suffix=" h" [disabled]="!canEdit" styleClass="w" />
          </article>

          <!-- ===== BLOQUE E ===== -->
          <div class="block-title">E · Permisos de Recepción</div>

          <article class="card wide">
            <h3>Permisos de Recepción</h3>
            <p class="desc">Controla funciones especiales del rol Recepción en esta sucursal. Admin / Gerente / CEO conservan acceso administrativo según la matriz de roles.</p>
            <div class="sw-row"><p-toggleswitch [(ngModel)]="cfg.reception.declareStay" [disabled]="!canEdit" /><div><strong>Declarar Estancias</strong><small class="block">Registrar estadías por contingencia (apagón, caída de internet, sistema no disponible).</small></div></div>
            <div class="sw-row"><p-toggleswitch [(ngModel)]="cfg.reception.roomChange" [disabled]="!canEdit" /><div><strong>Cambio de Habitaciones</strong><small class="block">Mover a un huésped activo de una habitación a otra.</small></div></div>
            <div class="sw-row"><p-toggleswitch [(ngModel)]="cfg.reception.productWriteoff" [disabled]="!canEdit" /><div><strong>Baja de Productos</strong><small class="block">Si está activo, ejecuta la baja directamente; si no, solo genera una solicitud/reporte de baja.</small></div></div>
            <div class="sw-row"><p-toggleswitch [(ngModel)]="cfg.reception.creditNote" [disabled]="!canEdit" /><div><strong>Nota de Crédito</strong><small class="block">Si está inactivo, solo usuarios administrativos autorizados pueden generarlas.</small></div></div>
            <div class="ref-row"><i class="pi pi-lock"></i> <strong>Caja Ciega:</strong> gestionado desde el bloque “Caja Ciega” (fuente única).</div>
          </article>

          <!-- ===== BLOQUE F ===== -->
          <div class="block-title">F · Permisos de Limpieza</div>

          <article class="card wide">
            <h3>Permisos de Limpieza</h3>
            <p class="desc">Controla funciones especiales del personal de Limpieza.</p>
            <div class="sw-row"><p-toggleswitch [(ngModel)]="cfg.cleaning.linenWriteoff" [disabled]="!canEdit" /><div><strong>Dar de Baja Inventario de Limpieza</strong><small class="block">Por seguridad el valor recomendado es <strong>INACTIVO</strong>. Si está inactivo, Limpieza solo reporta ropa dañada/manchada/deteriorada; NO ejecuta la baja definitiva (corresponde a CEO / Gerente / Administrador / encargado autorizado).</small></div></div>
          </article>

        </div>

        @if (canEdit) {
          <div class="foot"><p-button label="Guardar configuración" icon="pi pi-check" [loading]="saving()" (onClick)="save()" /></div>
        }
      }
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.25rem; max-width: 1100px; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
      h1 { margin: 0; font-size: 1.5rem; }
      h3 { margin: 0 0 0.15rem; font-size: 1rem; }
      .branch { margin: 0.25rem 0 0; color: var(--p-text-muted-color, #64748b); }
      .muted { color: var(--p-text-muted-color, #64748b); }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
      .block-title { grid-column: 1 / -1; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--p-primary-color, #3b82f6); margin-top: 0.5rem; padding-bottom: 0.25rem; border-bottom: 2px solid var(--p-content-border-color, #e2e8f0); }
      .card { background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 12px; padding: 1.1rem 1.2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      .card.wide { grid-column: 1 / -1; }
      .desc { margin: 0.15rem 0 0.7rem; font-size: 0.85rem; line-height: 1.4; color: var(--p-text-muted-color, #64748b); }
      .hint { margin: 0.5rem 0 0; font-size: 0.78rem; color: var(--p-text-muted-color, #94a3b8); font-style: italic; }
      label { display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.3rem; }
      .sw-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .sw-row { display: flex; align-items: flex-start; gap: 0.75rem; margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px dashed var(--p-content-border-color, #e5e7eb); }
      .block { display: block; font-size: 0.8rem; color: var(--p-text-muted-color, #64748b); margin-top: 0.15rem; }
      .ref-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.9rem; padding: 0.5rem 0.7rem; border-radius: 8px; background: rgba(148,163,184,0.14); font-size: 0.82rem; color: var(--p-text-muted-color, #64748b); }
      .link-btn { display: inline-flex; align-items: center; gap: 0.4rem; margin-top: 0.9rem; font-size: 0.85rem; font-weight: 600; color: var(--p-primary-color, #3b82f6); text-decoration: none; }
      .link-btn:hover { text-decoration: underline; }
      .pos-tbl { display: flex; flex-direction: column; gap: 0.1rem; }
      .pos-row { display: grid; grid-template-columns: 1.5fr 0.8fr 1fr 1fr; align-items: center; gap: 0.5rem; padding: 0.4rem 0; border-bottom: 1px solid var(--p-content-border-color, #f1f5f9); font-size: 0.86rem; }
      .pos-row .c { text-align: center; } .pos-row .r { text-align: right; font-variant-numeric: tabular-nums; }
      .pos-h { font-weight: 700; color: var(--p-text-muted-color, #64748b); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.4px; }
      .pos-tbl.dimmed { opacity: 0.55; }
      .pos-lock { display: flex; align-items: flex-start; gap: 0.45rem; margin: 0 0 0.6rem; padding: 0.55rem 0.75rem; border-radius: 8px; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: var(--p-primary-color, #2563eb); font-size: 0.82rem; }
      .foot { margin-top: 1.25rem; display: flex; justify-content: flex-end; }
      :host ::ng-deep .w { width: 10rem; }
      :host ::ng-deep .pct { width: 7rem; }
      @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } .pos-row { grid-template-columns: 1.3fr 0.7fr 0.9fr; } .pos-row .r { display: none; } }
    `,
  ],
})
export class OperationsConfigComponent {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly canEdit = this.auth.can('settings', 'edit');

  cfg: OperationsConfig = structuredClone(DEFAULTS);

  readonly posRows: { key: keyof OperationsConfig['pos']; label: string }[] = [
    { key: 'transfer', label: 'Transferencia bancaria' },
    { key: 'yape', label: 'Yape' },
    { key: 'plin', label: 'Plin' },
    { key: 'credit', label: 'Tarjeta de crédito' },
    { key: 'debit', label: 'Tarjeta de débito' },
  ];

  constructor() {
    // Recarga automática al cambiar de sucursal (selector global).
    // allowSignalWrites: load() escribe señales (loading/cfg) de forma síncrona.
    effect(() => {
      const id = this.auth.activeBranchId();
      if (id) this.load();
    }, { allowSignalWrites: true });
  }

  private load(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<OperationsConfig>>(`${this.api}/operations-config`).subscribe({
      next: (res) => { if (res.data) this.cfg = { ...structuredClone(DEFAULTS), ...res.data, pos: { ...DEFAULTS.pos, ...res.data.pos } }; this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  save(): void {
    this.saving.set(true);
    this.http.put<ApiResponse<OperationsConfig>>(`${this.api}/operations-config`, this.cfg).subscribe({
      next: (res) => {
        if (res.data) this.cfg = { ...structuredClone(DEFAULTS), ...res.data, pos: { ...DEFAULTS.pos, ...res.data.pos } };
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuración operativa actualizada.' });
        // La Caja Ciega vive en la sucursal (adminPresent); refrescar para que el módulo de caja la vea.
        this.auth.loadBranches().subscribe();
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }
}
