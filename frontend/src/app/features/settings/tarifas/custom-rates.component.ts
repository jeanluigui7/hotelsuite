import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { ClientTier, CustomRate, RoomType } from '../catalogs/catalog.models';
import { DURATION_PRESETS, STATUS_OPTIONS } from '../catalogs/catalog.constants';

interface Form {
  id?: string;
  roomTypeId: string;
  tierId: string | null;
  label: string;
  durationMinutes: number;
  price: number | null;
  validFrom: string;
  validTo: string;
  status: 'active' | 'inactive';
}

const EMPTY: Form = {
  roomTypeId: '',
  tierId: null,
  label: '',
  durationMinutes: 180,
  price: null,
  validFrom: '',
  validTo: '',
  status: 'active',
};

@Component({
  selector: 'app-custom-rates',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Tarifa Personalizada</h1>
          <p class="muted">Tarifas especiales por tipo de habitación, tier de cliente y vigencia.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva tarifa" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Tipo</th>
            <th>Tier</th>
            <th>Etiqueta</th>
            <th style="width: 7rem">Duración</th>
            <th style="width: 7rem">Precio</th>
            <th>Vigencia</th>
            <th style="width: 8rem">Estado</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.roomType?.name }}</td>
            <td>{{ row.tier?.name ?? '—' }}</td>
            <td>{{ row.label }}</td>
            <td>{{ row.durationMinutes }} min</td>
            <td>{{ row.price }}</td>
            <td class="muted">
              {{ row.validFrom ? (row.validFrom | date: 'dd/MM/yy') : '—' }}
              <span>→</span>
              {{ row.validTo ? (row.validTo | date: 'dd/MM/yy') : '—' }}
            </td>
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
          <tr><td colspan="8" class="muted center">Sin tarifas personalizadas.</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '560px' }"
              [header]="form.id ? 'Editar tarifa personalizada' : 'Nueva tarifa personalizada'">
      <div class="cat-form">
        <div class="row">
          <div class="col">
            <label>Tipo de habitación</label>
            <p-select [options]="roomTypes()" optionLabel="name" optionValue="id" [(ngModel)]="form.roomTypeId"
                      placeholder="Seleccionar" styleClass="w-full" />
          </div>
          <div class="col">
            <label>Tier (opcional)</label>
            <p-select [options]="tiers()" optionLabel="name" optionValue="id" [(ngModel)]="form.tierId"
                      placeholder="Sin tier" [showClear]="true" styleClass="w-full" />
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Duración</label>
            <p-select [options]="durationPresets" optionLabel="label" optionValue="value"
                      [(ngModel)]="form.durationMinutes" (onChange)="onPresetChange()" styleClass="w-full" />
          </div>
          <div class="col">
            <label>Etiqueta</label>
            <input pInputText [(ngModel)]="form.label" />
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Precio</label>
            <p-inputNumber [(ngModel)]="form.price" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" />
          </div>
          <div class="col">
            <label>Estado</label>
            <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Vigente desde</label>
            <input pInputText type="date" [(ngModel)]="form.validFrom" />
          </div>
          <div class="col">
            <label>Vigente hasta</label>
            <input pInputText type="date" [(ngModel)]="form.validTo" />
          </div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class CustomRatesComponent implements OnInit {
  private readonly catalog = inject(CatalogApiService);
  private readonly api = this.catalog.customRates;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<CustomRate[]>([]);
  readonly roomTypes = signal<RoomType[]>([]);
  readonly tiers = signal<ClientTier[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly statusOptions = STATUS_OPTIONS;
  readonly durationPresets = DURATION_PRESETS;

  dialogVisible = false;
  form: Form = { ...EMPTY };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.catalog.roomTypes.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.roomTypes.set(res.data ?? []));
    this.catalog.clientTiers.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.tiers.set(res.data ?? []));
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onPresetChange(): void {
    const preset = this.durationPresets.find((p) => p.value === this.form.durationMinutes);
    if (preset && !this.form.label) this.form.label = preset.label;
  }

  openNew(): void {
    this.form = { ...EMPTY };
    this.dialogVisible = true;
  }

  openEdit(row: CustomRate): void {
    this.form = {
      id: row.id,
      roomTypeId: row.roomTypeId,
      tierId: row.tierId ?? null,
      label: row.label,
      durationMinutes: row.durationMinutes,
      price: Number(row.price),
      validFrom: row.validFrom ? row.validFrom.substring(0, 10) : '',
      validTo: row.validTo ? row.validTo.substring(0, 10) : '',
      status: row.status as 'active' | 'inactive',
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.roomTypeId || this.form.price == null || !this.form.label) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa tipo, etiqueta y precio.' });
      return;
    }
    const dto = {
      roomTypeId: this.form.roomTypeId,
      tierId: this.form.tierId ?? null,
      label: this.form.label,
      durationMinutes: this.form.durationMinutes,
      price: this.form.price,
      validFrom: this.form.validFrom || null,
      validTo: this.form.validTo || null,
      status: this.form.status,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Tarifa personalizada guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: CustomRate): void {
    this.confirm.confirm({
      header: 'Eliminar tarifa personalizada',
      message: `¿Eliminar la tarifa "${row.label}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Tarifa eliminada.' });
            this.reload();
          },
          error: (err: HttpErrorResponse) =>
            this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
