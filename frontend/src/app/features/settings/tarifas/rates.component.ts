import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { Rate, RoomType } from '../catalogs/catalog.models';

interface RateGroup { roomTypeId: string; roomTypeName: string; rates: Rate[]; }

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
          <div class="card-h"><h3>{{ g.roomTypeName }}</h3><p-button label="Agregar a {{ g.roomTypeName }}" icon="pi pi-plus" size="small" [text]="true" (onClick)="openNew(g.roomTypeId)" /></div>
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

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [header]="form.id ? 'Editar tarifa' : 'Nueva tarifa'" [style]="{ width: '30rem', maxWidth: '95vw' }">
      <div class="form">
        <label>Tipo de habitación</label>
        <p-select [options]="roomTypes()" optionLabel="name" optionValue="id" [(ngModel)]="form.roomTypeId" placeholder="Selecciona" styleClass="w" appendTo="body" [disabled]="!!form.id" />
        <label>Etiqueta</label>
        <input pInputText [(ngModel)]="form.label" placeholder="Ej: 3 horas, 12 horas, DIA HOTELERO" />
        <label class="chk"><input type="checkbox" [(ngModel)]="form.pernocta" /> <span>Pernoctación</span> <small class="muted">(el corte sigue la hora de corte de la sucursal, no la duración)</small></label>
        @if (!form.pernocta) {
          <label>Duración (horas)</label>
          <p-inputNumber [(ngModel)]="form.hours" [min]="0.5" [max]="72" [step]="0.5" [minFractionDigits]="0" [maxFractionDigits]="1" styleClass="w" placeholder="Ej: 3" />
        }
        <label>Precio (S/)</label>
        <p-inputNumber [(ngModel)]="form.price" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w" />
        <label class="chk"><input type="checkbox" [(ngModel)]="form.special" /> <span>Tarifa especial</span></label>
        <label class="chk"><input type="checkbox" [checked]="form.status === 'active'" (change)="form.status = form.status === 'active' ? 'inactive' : 'active'" /> <span>Activa</span></label>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
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
      .card-h { display: flex; align-items: center; justify-content: space-between; }
      .card-h h3 { margin: 0; }
      .tbl { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
      .tbl th, .tbl td { padding: 0.7rem 0.6rem; border-bottom: 1px solid var(--p-content-border-color, #1c2c44); text-align: left; font-size: 0.9rem; }
      .tbl th { color: var(--p-text-muted-color, #8aa0bd); font-weight: 600; }
      .tbl .r { text-align: right; } .tbl .c { text-align: center; } .tbl .ac { text-align: right; white-space: nowrap; } .center { text-align: center; }
      .tbl tr.off td { opacity: 0.5; }
      .pill { font-size: 0.72rem; font-weight: 700; padding: 0.12rem 0.6rem; border-radius: 999px; background: rgba(148,163,184,0.18); color: #94a3b8; }
      .pill.yes { background: rgba(16,185,129,0.18); color: #10b981; } .pill.special { background: rgba(168,85,247,0.18); color: #a855f7; }
      .form { display: flex; flex-direction: column; gap: 0.4rem; }
      .form label { font-size: 0.85rem; font-weight: 600; margin-top: 0.5rem; }
      .form label.chk { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; }
      .form label.chk small { font-weight: 400; }
      :host ::ng-deep .form .w, :host ::ng-deep .form input:not([type=checkbox]) { width: 100%; }
    `,
  ],
})
export class RatesComponent implements OnInit {
  private readonly catalog = inject(CatalogApiService);
  private readonly toast = inject(MessageService);

  readonly roomTypes = signal<RoomType[]>([]);
  readonly rates = signal<Rate[]>([]);
  readonly saving = signal(false);
  dialogVisible = false;
  form: { id?: string; roomTypeId: string | null; label: string; hours: number; price: number; pernocta: boolean; special: boolean; status: string } = { roomTypeId: null, label: '', hours: 3, price: 0, pernocta: false, special: false, status: 'active' };

  readonly groups = computed<RateGroup[]>(() =>
    this.roomTypes().map((rt) => ({ roomTypeId: rt.id, roomTypeName: rt.name, rates: this.rates().filter((r) => r.roomTypeId === rt.id).sort((a, b) => a.durationMinutes - b.durationMinutes) })),
  );

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.catalog.roomTypes.list({ pageSize: 200, sortBy: 'name' }).subscribe((res) => this.roomTypes.set(res.data ?? []));
    this.catalog.rates.list({ pageSize: 500 }).subscribe((res) => this.rates.set(res.data ?? []));
  }

  durLabel(min: number): string {
    if (min % 1440 === 0) return `${min / 1440} día(s)`;
    if (min % 60 === 0) return `${min / 60} horas`;
    return `${min} min`;
  }

  openNew(roomTypeId?: string): void {
    this.form = { roomTypeId: roomTypeId ?? this.roomTypes()[0]?.id ?? null, label: '', hours: 3, price: 0, pernocta: false, special: false, status: 'active' };
    this.dialogVisible = true;
  }

  openEdit(r: Rate): void {
    this.form = { id: r.id, roomTypeId: r.roomTypeId, label: r.label, hours: r.durationMinutes / 60, price: Number(r.price), pernocta: !!r.pernocta, special: !!r.special, status: r.status };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.roomTypeId || !this.form.label.trim() || (!this.form.pernocta && !this.form.hours)) {
      this.toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Tipo, etiqueta y duración (si no es pernoctación) son obligatorios.' });
      return;
    }
    // Pernoctación: la duración no aplica (rige la hora de corte); se guarda 1 día base.
    const durationMinutes = this.form.pernocta ? 1440 : Math.round(this.form.hours * 60);
    const dto = { roomTypeId: this.form.roomTypeId, label: this.form.label.trim(), durationMinutes, price: this.form.price, pernocta: this.form.pernocta, special: this.form.special, status: this.form.status } as unknown as Partial<Rate>;
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
