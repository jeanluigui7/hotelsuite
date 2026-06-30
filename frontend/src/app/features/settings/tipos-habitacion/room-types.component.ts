import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { Rate, RoomAttribute, RoomType } from '../catalogs/catalog.models';
import { DURATION_PRESETS, STATUS_OPTIONS } from '../catalogs/catalog.constants';

interface Form {
  id?: string;
  name: string;
  description: string;
  capacity: number;
  basePrice: number | null;
  extraHourPrice: number | null;
  status: 'active' | 'inactive';
  attributeIds: string[];
}

const EMPTY: Form = {
  name: '',
  description: '',
  capacity: 2,
  basePrice: null,
  extraHourPrice: null,
  status: 'active',
  attributeIds: [],
};

@Component({
  selector: 'app-room-types',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    MultiSelectModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Tipos de Habitación</h1>
          <p class="muted">Define los tipos, sus atributos y las tarifas base por duración.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo tipo" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Nombre</th>
            <th style="width: 7rem">Capacidad</th>
            <th>Atributos</th>
            <th style="width: 7rem">Tarifas</th>
            <th style="width: 8rem">Estado</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td>{{ row.capacity }}</td>
            <td>
              @for (attr of row.attributes; track attr.id) {
                <p-tag [value]="attr.name" severity="secondary" styleClass="attr-tag" />
              }
            </td>
            <td>{{ row.rateCount }}</td>
            <td>
              <p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'"
                     [severity]="row.status === 'active' ? 'success' : 'danger'" />
            </td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="6" class="muted center">Sin tipos de habitación.</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '640px' }"
              [header]="form.id ? 'Editar tipo de habitación' : 'Nuevo tipo de habitación'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="form.description" />
        <div class="row">
          <div class="col">
            <label>Capacidad</label>
            <p-inputNumber [(ngModel)]="form.capacity" [min]="1" [max]="50" styleClass="w-full" />
          </div>
          <div class="col">
            <label>Precio base (referencia)</label>
            <p-inputNumber [(ngModel)]="form.basePrice" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" />
          </div>
          <div class="col">
            <label>Tarifa hora adicional (Tiempo Extra)</label>
            <p-inputNumber [(ngModel)]="form.extraHourPrice" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" />
          </div>
        </div>
        <label>Atributos</label>
        <p-multiSelect [options]="attributes()" optionLabel="name" optionValue="id"
                       [(ngModel)]="form.attributeIds" placeholder="Seleccionar atributos" styleClass="w-full" />
        <label>Estado</label>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />

        @if (form.id) {
          <h3>Tarifas base (por duración)</h3>
          <table class="rates">
            <thead>
              <tr><th>Etiqueta</th><th>Duración</th><th>Precio</th><th>Pernoctación</th><th>Especial</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              @for (rate of rates(); track rate.id) {
                <tr>
                  <td>{{ rate.label }}</td>
                  <td>{{ rate.pernocta ? 'Pernoctación' : rate.durationMinutes + ' min' }}</td>
                  <td>{{ rate.price }}</td>
                  <td>{{ rate.pernocta ? 'Sí' : 'No' }}</td>
                  <td>{{ rate.special ? 'Sí' : 'No' }}</td>
                  <td>{{ rate.status === 'active' ? 'Activa' : 'Inactiva' }}</td>
                  <td>
                    @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEditRate(rate)" /> }
                    @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="deleteRate(rate)" /> }
                  </td>
                </tr>
              }
              @if (rates().length === 0) {
                <tr><td colspan="7" class="muted center">Sin tarifas. Agrega una abajo.</td></tr>
              }
            </tbody>
          </table>

          @if (canCreate) {
            <div class="rate-add">
              @if (!newRate.pernocta) {
                <p-select [options]="durationPresets" optionLabel="label" optionValue="value"
                          [(ngModel)]="newRate.durationMinutes" placeholder="Duración" styleClass="rate-dur"
                          (onChange)="onPresetChange()" />
              }
              <input pInputText placeholder="Etiqueta" [(ngModel)]="newRate.label" class="rate-label" />
              <p-inputNumber [(ngModel)]="newRate.price" mode="currency" currency="PEN" locale="es-PE" placeholder="Precio" styleClass="rate-price" />
              <label class="rate-chk"><input type="checkbox" [(ngModel)]="newRate.pernocta" /> Pernoctación</label>
              <label class="rate-chk"><input type="checkbox" [(ngModel)]="newRate.special" /> Especial</label>
              <p-button icon="pi pi-plus" label="Agregar" (onClick)="addRate()" [loading]="addingRate()" />
            </div>
            <p class="muted hint">Marca <b>Pernoctación</b> si la salida se rige por la hora de corte de la sucursal (no por la duración).</p>
          }
        } @else {
          <p class="muted hint">Guarda el tipo de habitación para agregar sus tarifas base.</p>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <!-- Editar tarifa -->
    <p-dialog [(visible)]="rateEditVisible" [modal]="true" [style]="{ width: '28rem', maxWidth: '95vw' }" header="Editar tarifa">
      <div class="re-form">
        <label>Etiqueta</label>
        <input pInputText [(ngModel)]="rateEdit.label" />
        <label class="re-chk"><input type="checkbox" [(ngModel)]="rateEdit.pernocta" /> Pernoctación <small class="muted">(sigue la hora de corte de la sucursal)</small></label>
        @if (!rateEdit.pernocta) {
          <label>Duración (minutos)</label>
          <p-inputNumber [(ngModel)]="rateEdit.durationMinutes" [min]="1" styleClass="w-full" />
        }
        <label>Precio (S/)</label>
        <p-inputNumber [(ngModel)]="rateEdit.price" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w-full" />
        <label class="re-chk"><input type="checkbox" [(ngModel)]="rateEdit.special" /> Tarifa especial</label>
        <label class="re-chk"><input type="checkbox" [checked]="rateEdit.status === 'active'" (change)="rateEdit.status = rateEdit.status === 'active' ? 'inactive' : 'active'" /> Activa</label>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="rateEditVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="savingRate()" (onClick)="saveRateEdit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .re-form { display: flex; flex-direction: column; gap: 0.4rem; }
      .re-form label { font-size: 0.85rem; font-weight: 600; margin-top: 0.4rem; }
      .re-form label.re-chk { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; }
      .re-form input:not([type=checkbox]), :host ::ng-deep .re-form .w-full { width: 100%; }
      .rate-chk { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; cursor: pointer; }
      h3 {
        margin: 1.25rem 0 0.5rem;
        font-size: 1rem;
      }
      table.rates {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 0.75rem;
      }
      table.rates th,
      table.rates td {
        padding: 0.4rem 0.6rem;
        border-bottom: 1px solid var(--p-content-border-color, #2b2b30);
        text-align: left;
        font-size: 0.85rem;
      }
      .rate-add {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
      }
      :host ::ng-deep .rate-dur {
        width: 150px;
      }
      .rate-label {
        width: 140px;
      }
      :host ::ng-deep .rate-price {
        width: 140px;
      }
      .hint {
        margin-top: 1rem;
      }
      :host ::ng-deep .attr-tag {
        margin-right: 0.25rem;
      }
    `,
  ],
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class RoomTypesComponent implements OnInit {
  private readonly catalog = inject(CatalogApiService);
  private readonly api = this.catalog.roomTypes;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<RoomType[]>([]);
  readonly attributes = signal<RoomAttribute[]>([]);
  readonly rates = signal<Rate[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly addingRate = signal(false);

  readonly statusOptions = STATUS_OPTIONS;
  readonly durationPresets = DURATION_PRESETS;

  dialogVisible = false;
  form: Form = { ...EMPTY };
  newRate = { label: '', durationMinutes: 180, price: null as number | null, pernocta: false, special: false };
  // Edición de una tarifa existente
  rateEditVisible = false;
  rateEdit: { id: string; label: string; durationMinutes: number; price: number; pernocta: boolean; special: boolean; status: string } = { id: '', label: '', durationMinutes: 180, price: 0, pernocta: false, special: false, status: 'active' };
  readonly savingRate = signal(false);

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.catalog.roomAttributes.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) =>
      this.attributes.set(res.data ?? []),
    );
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { ...EMPTY, attributeIds: [] };
    this.rates.set([]);
    this.dialogVisible = true;
  }

  openEdit(row: RoomType): void {
    this.form = {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      capacity: row.capacity,
      basePrice: row.basePrice != null ? Number(row.basePrice) : null,
      extraHourPrice: row.extraHourPrice != null ? Number(row.extraHourPrice) : null,
      status: row.status as 'active' | 'inactive',
      attributeIds: [...row.attributeIds],
    };
    this.loadRates(row.id);
    this.dialogVisible = true;
  }

  private loadRates(roomTypeId: string): void {
    this.catalog.rates.list({ roomTypeId }).subscribe((res) => this.rates.set(res.data ?? []));
  }

  onPresetChange(): void {
    const preset = this.durationPresets.find((p) => p.value === this.newRate.durationMinutes);
    if (preset && !this.newRate.label) this.newRate.label = preset.label;
  }

  save(): void {
    const dto = {
      name: this.form.name,
      description: this.form.description,
      capacity: this.form.capacity,
      basePrice: this.form.basePrice ?? undefined,
      extraHourPrice: this.form.extraHourPrice ?? undefined,
      status: this.form.status,
      attributeIds: this.form.attributeIds,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Tipo de habitación guardado.' });
        this.reload();
        if (!this.form.id && res.data) {
          // Switch to edit mode so the user can add base rates right away.
          this.openEdit(res.data);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  addRate(): void {
    if (!this.form.id || this.newRate.price == null || !this.newRate.label) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa etiqueta, duración y precio.' });
      return;
    }
    this.addingRate.set(true);
    this.catalog.rates
      .create({
        roomTypeId: this.form.id,
        label: this.newRate.label,
        durationMinutes: this.newRate.pernocta ? 1440 : this.newRate.durationMinutes,
        price: this.newRate.price,
        pernocta: this.newRate.pernocta,
        special: this.newRate.special,
      } as unknown as Rate)
      .subscribe({
        next: () => {
          this.addingRate.set(false);
          this.newRate = { label: '', durationMinutes: 180, price: null, pernocta: false, special: false };
          this.loadRates(this.form.id!);
          this.reload();
        },
        error: (err: HttpErrorResponse) => {
          this.addingRate.set(false);
          this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo agregar la tarifa.' });
        },
      });
  }

  openEditRate(rate: Rate): void {
    this.rateEdit = { id: rate.id, label: rate.label, durationMinutes: rate.durationMinutes, price: Number(rate.price), pernocta: !!rate.pernocta, special: !!rate.special, status: rate.status };
    this.rateEditVisible = true;
  }

  saveRateEdit(): void {
    if (!this.rateEdit.label || (!this.rateEdit.pernocta && !this.rateEdit.durationMinutes)) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Etiqueta y duración (si no es pernoctación) son obligatorios.' });
      return;
    }
    this.savingRate.set(true);
    this.catalog.rates.update(this.rateEdit.id, {
      label: this.rateEdit.label,
      durationMinutes: this.rateEdit.pernocta ? 1440 : this.rateEdit.durationMinutes,
      price: this.rateEdit.price,
      pernocta: this.rateEdit.pernocta,
      special: this.rateEdit.special,
      status: this.rateEdit.status,
    } as unknown as Partial<Rate>).subscribe({
      next: () => { this.savingRate.set(false); this.rateEditVisible = false; this.loadRates(this.form.id!); this.reload(); this.messages.add({ severity: 'success', summary: 'Tarifa actualizada', detail: '' }); },
      error: (err: HttpErrorResponse) => { this.savingRate.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo actualizar.' }); },
    });
  }

  deleteRate(rate: Rate): void {
    this.catalog.rates.remove(rate.id).subscribe({
      next: () => {
        this.loadRates(this.form.id!);
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
    });
  }

  confirmDelete(row: RoomType): void {
    this.confirm.confirm({
      header: 'Eliminar tipo de habitación',
      message: `¿Eliminar "${row.name}"? Se eliminarán también sus tarifas.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Tipo de habitación eliminado.' });
            this.reload();
          },
          error: (err: HttpErrorResponse) =>
            this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
