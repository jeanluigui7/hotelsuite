import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { Rate, RateIncludedService, RoomType } from '../catalogs/catalog.models';

interface RateGroup { roomTypeId: string; roomTypeName: string; rates: Rate[]; extraHourPrice: number | null; }
interface ConceptOpt { id: string; name: string; }
interface ApiResponse<T> { data: T; }
// Árbol del catálogo de servicios (tipo SERVICIO): array de categorías con grupos y conceptos.
type CatTree = { name: string; groups: { name: string; concepts: { id: string; name: string }[] }[] }[];

@Component({
  selector: 'app-rates',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ButtonModule, DialogModule, SelectModule, InputTextModule, InputNumberModule],
  template: `
    <section class="rt">
      <header class="head">
        <div><h1>Tarifas</h1><p class="muted">Define las tarifas por tipo de habitación (duración y precio). Se usan en el check-in.</p></div>
        <p-button label="Nueva tarifa" icon="pi pi-plus" (onClick)="openNew()" [disabled]="roomTypes().length === 0" />
      </header>

      @if (roomTypes().length === 0) {
        <div class="empty">Primero crea tipos de habitación en <b>Tipos de Habitación</b>.</div>
      }

      @for (g of groups(); track g.roomTypeId) {
        <div class="card">
          <div class="card-h">
            <h3>{{ g.roomTypeName }}</h3>
            <span class="ext" title="Se usa para el 'Tiempo Extra' de una renovación (monto por hora)">
              <i class="pi pi-clock"></i> Extensión / hora:
              <p-inputNumber [(ngModel)]="g.extraHourPrice" mode="decimal" [minFractionDigits]="2" [min]="0" inputStyleClass="ext-in" />
              <p-button label="Guardar" size="small" [text]="true" [loading]="savingExt() === g.roomTypeId" (onClick)="saveExt(g.roomTypeId, g.extraHourPrice)" />
            </span>
            <p-button label="Agregar a {{ g.roomTypeName }}" icon="pi pi-plus" size="small" [text]="true" (onClick)="openNew(g.roomTypeId)" />
          </div>
          <table class="tbl">
            <thead><tr><th>Etiqueta</th><th>Duración</th><th class="r">Precio</th><th class="c">Pernoctación</th><th class="c">Especial</th><th class="c">Estado</th><th class="ac">Acciones</th></tr></thead>
            <tbody>
              @for (r of g.rates; track r.id) {
                <tr [class.off]="r.status !== 'active'">
                  <td>{{ r.label }}</td>
                  <td>{{ r.pernocta ? 'Pernoctación' : durLabel(r.durationMinutes) }}</td>
                  <td class="r">S/ {{ +r.price | number: '1.2-2' }}</td>
                  <td class="c"><span class="pill" [class.yes]="r.pernocta">{{ r.pernocta ? 'Sí' : 'No' }}</span></td>
                  <td class="c"><span class="pill" [class.special]="r.special">{{ r.special ? 'Sí' : 'No' }}</span></td>
                  <td class="c"><span class="pill" [class.yes]="r.status === 'active'">{{ r.status === 'active' ? 'Activa' : 'Inactiva' }}</span></td>
                  <td class="ac">
                    <p-button icon="pi pi-pencil" size="small" [text]="true" (onClick)="openEdit(r)" pTooltip="Editar" />
                    <p-button icon="pi pi-trash" size="small" severity="danger" [text]="true" (onClick)="remove(r)" pTooltip="Eliminar" />
                  </td>
                </tr>
              } @empty { <tr><td colspan="7" class="muted center">Sin tarifas. Agrega una con "Agregar".</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [header]="form.id ? 'Editar tarifa' : 'Nueva tarifa'" [style]="{ width: '52rem', maxWidth: '96vw' }" styleClass="rate-dlg">
      <p class="dlg-sub">Configura el alojamiento y los servicios incluidos.</p>
      <div class="rate-grid">
        <div class="col">
          <h4 class="col-h">Datos de la tarifa</h4>
          <div class="form">
            <label>Tipo de habitación</label>
            <p-select [options]="roomTypes()" optionLabel="name" optionValue="id" [(ngModel)]="form.roomTypeId" placeholder="Selecciona" styleClass="w" appendTo="body" [disabled]="!!form.id" />
            <label>Nombre de la tarifa</label>
            <input pInputText [(ngModel)]="form.label" placeholder="Ej: Día hotelero con desayuno" />
            <label class="chk"><input type="checkbox" [(ngModel)]="form.pernocta" /> <span>Pernoctación</span> <small class="muted">(el corte sigue la hora de corte de la sucursal, no la duración)</small></label>
            @if (!form.pernocta) {
              <label>Duración (horas)</label>
              <p-inputNumber [(ngModel)]="form.hours" [min]="0.5" [max]="72" [step]="0.5" [minFractionDigits]="0" [maxFractionDigits]="1" styleClass="w" placeholder="Ej: 3" />
            }
            <label>Precio total de la tarifa (S/)</label>
            <p-inputNumber [(ngModel)]="form.price" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
            <small class="muted">Incluye alojamiento y los servicios configurados. No se suma de nuevo el precio del servicio incluido.</small>
            <label class="chk"><input type="checkbox" [(ngModel)]="form.special" /> <span>Tarifa especial</span></label>
            <label class="chk"><input type="checkbox" [checked]="form.status === 'active'" (change)="form.status = form.status === 'active' ? 'inactive' : 'active'" /> <span>Activa</span></label>
          </div>
        </div>

        <div class="col">
          <h4 class="col-h">Servicios incluidos <span class="inc-count" [class.on]="form.includedServices.length">{{ form.includedServices.length }}</span></h4>
          <p class="muted sm">Beneficios que cubre esta tarifa al contratarla. Pertenecen a la TARIFA, no al tipo de habitación.</p>
          @for (s of form.includedServices; track $index) {
            <div class="inc-card">
              <div class="inc-top">
                <span class="inc-tag">Incluido en tarifa</span>
                <button class="inc-del" (click)="removeIncluded($index)" title="Quitar"><i class="pi pi-trash"></i></button>
              </div>
              <label>Servicio</label>
              <p-select [options]="concepts()" optionLabel="name" optionValue="id" [(ngModel)]="s.conceptId" placeholder="Selecciona un servicio" styleClass="w" appendTo="body" [filter]="true" />
              <div class="inc-row2">
                <div><label>Cantidad</label><p-inputNumber [(ngModel)]="s.quantity" [min]="1" [showButtons]="true" styleClass="w" /></div>
                <div><label>Asignación</label><p-select [options]="assignOpts" optionLabel="label" optionValue="value" [(ngModel)]="s.assignment" styleClass="w" appendTo="body" /></div>
              </div>
              <label>Frecuencia</label>
              <p-select [options]="freqOpts" optionLabel="label" optionValue="value" [(ngModel)]="s.frequency" styleClass="w" appendTo="body" />
              <label>Disponible</label>
              <p-select [options]="availOpts" optionLabel="label" optionValue="value" [(ngModel)]="s.availability" styleClass="w" appendTo="body" />
              <label>Horario de atención</label>
              <div class="inc-row2">
                <div><small class="muted">Desde</small><input pInputText [(ngModel)]="s.scheduleFrom" placeholder="07:00" /></div>
                <div><small class="muted">Hasta</small><input pInputText [(ngModel)]="s.scheduleTo" placeholder="10:00" /></div>
              </div>
              <label>Lugar de atención</label>
              <p-select [options]="placeOpts" optionLabel="label" optionValue="value" [(ngModel)]="s.place" styleClass="w" appendTo="body" />
            </div>
          } @empty {
            <div class="inc-empty">Sin servicios incluidos. Esta tarifa no otorga beneficios.</div>
          }
          <p-button label="Agregar servicio" icon="pi pi-plus" [text]="true" [disabled]="concepts().length === 0" (onClick)="addIncluded()" />
          @if (concepts().length === 0) { <small class="muted">No hay conceptos de servicio en el catálogo. Créalos en Configuración › Servicios/Penalidades.</small> }
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar tarifa" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .rt { padding: 1.5rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      h1 { margin: 0; } .muted { color: var(--p-text-muted-color, #8aa0bd); margin: 0.2rem 0 0; }
      .empty { background: var(--p-content-background, #0e1622); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 12px; padding: 1.2rem; margin-top: 1rem; }
      .card { background: var(--p-content-background, #0e1622); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 14px; padding: 1rem 1.2rem; margin-top: 1.2rem; }
      .card-h { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap; }
      .card-h h3 { margin: 0; }
      .ext { display: inline-flex; align-items: center; gap: 0.4rem; margin-left: auto; font-size: 0.82rem; color: var(--p-text-muted-color, #8aa0bd); }
      :host ::ng-deep .ext .ext-in { width: 6rem; text-align: right; }
      .tbl { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
      .tbl th, .tbl td { padding: 0.7rem 0.6rem; border-bottom: 1px solid var(--p-content-border-color, #1c2c44); text-align: left; font-size: 0.9rem; }
      .tbl th { color: var(--p-text-muted-color, #8aa0bd); font-weight: 600; }
      .tbl .r { text-align: right; } .tbl .c { text-align: center; } .tbl .ac { text-align: right; white-space: nowrap; } .center { text-align: center; }
      .tbl tr.off td { opacity: 0.5; }
      .pill { font-size: 0.72rem; font-weight: 700; padding: 0.12rem 0.6rem; border-radius: 999px; background: rgba(148,163,184,0.18); color: #94a3b8; }
      .pill.yes { background: rgba(16,185,129,0.18); color: #10b981; } .pill.special { background: rgba(168,85,247,0.18); color: #a855f7; }
      .form { display: flex; flex-direction: column; gap: 0.4rem; }
      .form label, .col label { font-size: 0.85rem; font-weight: 600; margin-top: 0.5rem; }
      .form label.chk { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; }
      .form label.chk small { font-weight: 400; }
      :host ::ng-deep .form .w, :host ::ng-deep .form input:not([type=checkbox]) { width: 100%; }
      .dlg-sub { color: var(--p-text-muted-color, #8aa0bd); margin: 0 0 0.9rem; font-size: 0.88rem; }
      .rate-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.4rem; }
      @media (max-width: 720px) { .rate-grid { grid-template-columns: 1fr; } }
      .col-h { margin: 0 0 0.3rem; display: flex; align-items: center; gap: 0.5rem; }
      .muted.sm, .col small.muted { font-size: 0.8rem; color: var(--p-text-muted-color, #8aa0bd); }
      .inc-count { font-size: 0.72rem; font-weight: 800; min-width: 1.3rem; text-align: center; padding: 0.05rem 0.4rem; border-radius: 999px; background: rgba(148,163,184,0.18); color: #94a3b8; }
      .inc-count.on { background: rgba(16,185,129,0.18); color: #10b981; }
      .inc-card { border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 12px; padding: 0.7rem 0.8rem; margin: 0.6rem 0; display: flex; flex-direction: column; gap: 0.1rem; background: rgba(16,185,129,0.04); }
      .inc-top { display: flex; align-items: center; justify-content: space-between; }
      .inc-tag { font-size: 0.66rem; font-weight: 800; letter-spacing: 0.03em; padding: 0.1rem 0.5rem; border-radius: 6px; background: rgba(16,185,129,0.18); color: #10b981; }
      .inc-del { background: none; border: none; color: #f87171; cursor: pointer; padding: 0.2rem; }
      .inc-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
      .inc-empty { border: 1px dashed var(--p-content-border-color, #1c2c44); border-radius: 10px; padding: 0.9rem; text-align: center; color: var(--p-text-muted-color, #8aa0bd); font-size: 0.85rem; margin: 0.4rem 0; }
      :host ::ng-deep .col .w, :host ::ng-deep .col input:not([type=checkbox]) { width: 100%; }
    `,
  ],
})
export class RatesComponent implements OnInit {
  private readonly catalog = inject(CatalogApiService);
  private readonly toast = inject(MessageService);
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly roomTypes = signal<RoomType[]>([]);
  readonly rates = signal<Rate[]>([]);
  readonly concepts = signal<ConceptOpt[]>([]);
  readonly saving = signal(false);
  dialogVisible = false;
  form: { id?: string; roomTypeId: string | null; label: string; hours: number; price: number; pernocta: boolean; special: boolean; status: string; includedServices: RateIncludedService[] } = { roomTypeId: null, label: '', hours: 3, price: 0, pernocta: false, special: false, status: 'active', includedServices: [] };

  readonly assignOpts = [{ label: 'Por habitación', value: 'PER_ROOM' }, { label: 'Por persona', value: 'PER_PERSON' }];
  readonly freqOpts = [{ label: 'Por estadía', value: 'PER_STAY' }, { label: 'Por noche contratada', value: 'PER_NIGHT' }];
  readonly availOpts = [{ label: 'Mismo día', value: 'SAME_DAY' }, { label: 'Mañana siguiente', value: 'NEXT_MORNING' }];
  readonly placeOpts = [{ label: 'Habitación', value: 'ROOM' }, { label: 'Comedor', value: 'DINING' }, { label: 'Comedor o habitación', value: 'BOTH' }];

  readonly savingExt = signal<string | null>(null);
  readonly groups = computed<RateGroup[]>(() =>
    this.roomTypes().map((rt) => ({ roomTypeId: rt.id, roomTypeName: rt.name, extraHourPrice: rt.extraHourPrice != null ? Number(rt.extraHourPrice) : null, rates: this.rates().filter((r) => r.roomTypeId === rt.id).sort((a, b) => a.durationMinutes - b.durationMinutes) })),
  );

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.catalog.roomTypes.list({ pageSize: 200, sortBy: 'name' }).subscribe((res) => this.roomTypes.set(res.data ?? []));
    this.catalog.rates.list({ pageSize: 500 }).subscribe((res) => this.rates.set(res.data ?? []));
    // Conceptos de servicio (tipo SERVICIO) del catálogo, para elegir los incluidos.
    this.http.get<ApiResponse<CatTree>>(`${this.api}/services/catalog-tree?tipo=SERVICIO`).subscribe({
      next: (res) => {
        const opts: ConceptOpt[] = [];
        for (const cat of res.data ?? []) for (const g of cat.groups) for (const c of g.concepts) opts.push({ id: c.id, name: `${g.name} · ${c.name}` });
        this.concepts.set(opts);
      },
      error: () => this.concepts.set([]),
    });
  }

  addIncluded(): void {
    this.form.includedServices = [
      ...this.form.includedServices,
      { conceptId: this.concepts()[0]?.id ?? '', quantity: 1, assignment: 'PER_ROOM', frequency: 'PER_STAY', availability: 'SAME_DAY', scheduleFrom: null, scheduleTo: null, place: 'BOTH' },
    ];
  }
  removeIncluded(i: number): void {
    this.form.includedServices = this.form.includedServices.filter((_, idx) => idx !== i);
  }

  durLabel(min: number): string {
    if (min % 1440 === 0) return `${min / 1440} día(s)`;
    if (min % 60 === 0) return `${min / 60} horas`;
    return `${min} min`;
  }

  openNew(roomTypeId?: string): void {
    this.form = { roomTypeId: roomTypeId ?? this.roomTypes()[0]?.id ?? null, label: '', hours: 3, price: 0, pernocta: false, special: false, status: 'active', includedServices: [] };
    this.dialogVisible = true;
  }

  /** Guarda la tarifa por hora (extensión / Tiempo Extra) del tipo de habitación. */
  saveExt(roomTypeId: string, value: number | null): void {
    this.savingExt.set(roomTypeId);
    this.catalog.roomTypes.update(roomTypeId, { extraHourPrice: value ?? 0 } as unknown as Partial<RoomType>).subscribe({
      next: () => { this.savingExt.set(null); this.toast.add({ severity: 'success', summary: 'Extensión guardada', detail: 'Tarifa por hora actualizada.' }); this.catalog.roomTypes.list({ pageSize: 200, sortBy: 'name' }).subscribe((res) => this.roomTypes.set(res.data ?? [])); },
      error: (e: HttpErrorResponse) => { this.savingExt.set(null); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  openEdit(r: Rate): void {
    this.form = {
      id: r.id, roomTypeId: r.roomTypeId, label: r.label, hours: r.durationMinutes / 60, price: Number(r.price),
      pernocta: !!r.pernocta, special: !!r.special, status: r.status,
      // Copia editable de los servicios incluidos existentes (no se mutan los del listado).
      includedServices: (r.includedServices ?? []).map((s) => ({
        conceptId: s.conceptId, quantity: s.quantity, assignment: s.assignment, frequency: s.frequency,
        availability: s.availability, scheduleFrom: s.scheduleFrom ?? null, scheduleTo: s.scheduleTo ?? null, place: s.place,
      })),
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.roomTypeId || !this.form.label.trim() || (!this.form.pernocta && !this.form.hours)) {
      this.toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Tipo, etiqueta y duración (si no es pernoctación) son obligatorios.' });
      return;
    }
    // Validación: cada servicio incluido debe tener un concepto elegido.
    if (this.form.includedServices.some((s) => !s.conceptId)) {
      this.toast.add({ severity: 'warn', summary: 'Servicio incompleto', detail: 'Elige un servicio en cada beneficio incluido (o quítalo).' });
      return;
    }
    // Pernoctación: la duración no aplica (rige la hora de corte); se guarda 1 día base.
    const durationMinutes = this.form.pernocta ? 1440 : Math.round(this.form.hours * 60);
    const dto = {
      roomTypeId: this.form.roomTypeId, label: this.form.label.trim(), durationMinutes, price: this.form.price,
      pernocta: this.form.pernocta, special: this.form.special, status: this.form.status,
      // Siempre se envía la lista completa (reemplaza la existente al editar; [] = sin beneficios).
      includedServices: this.form.includedServices.map((s) => ({
        conceptId: s.conceptId, quantity: s.quantity, assignment: s.assignment, frequency: s.frequency,
        availability: s.availability, scheduleFrom: s.scheduleFrom || null, scheduleTo: s.scheduleTo || null, place: s.place,
      })),
    } as unknown as Partial<Rate>;
    this.saving.set(true);
    const req$ = this.form.id ? this.catalog.rates.update(this.form.id, dto) : this.catalog.rates.create(dto as Rate);
    req$.subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Tarifa guardada.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  remove(r: Rate): void {
    if (!confirm(`¿Eliminar la tarifa "${r.label}" de este tipo?`)) return;
    this.catalog.rates.remove(r.id).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Eliminada', detail: 'Tarifa eliminada.' }); this.reload(); },
      error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo eliminar.' }),
    });
  }
}
