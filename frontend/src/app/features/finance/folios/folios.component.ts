import { Component, OnInit, inject, signal } from '@angular/core';
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
import { FinanceApiService } from '../services/finance-api.service';
import type { FolioSeries } from '../services/finance.models';

const DOC_TYPES = [
  { label: 'Boleta', value: 'BOLETA' },
  { label: 'Factura', value: 'FACTURA' },
  { label: 'Nota (C/D)', value: 'NOTE' },
];

interface Form {
  id?: string;
  documentType: 'BOLETA' | 'FACTURA' | 'NOTE';
  series: string;
  currentNumber: number;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-folios',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Folios Maestros</h1>
          <p class="muted">Series y correlativos por tipo de comprobante.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva serie" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Tipo</th><th>Serie</th><th style="width:10rem">Correlativo actual</th><th style="width:8rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ docLabel(row.documentType) }}</td>
            <td><strong>{{ row.series }}</strong></td>
            <td>{{ row.currentNumber }}</td>
            <td><p-tag [value]="row.status === 'active' ? 'Activa' : 'Inactiva'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin series.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '420px' }" [header]="form.id ? 'Editar serie' : 'Nueva serie'">
      <div class="cat-form">
        <label>Tipo de documento</label>
        <p-select [options]="docTypes" optionLabel="label" optionValue="value" [(ngModel)]="form.documentType" styleClass="w-full" />
        <label>Serie</label>
        <input pInputText [(ngModel)]="form.series" placeholder="B001" />
        <label>Correlativo actual</label>
        <p-inputNumber [(ngModel)]="form.currentNumber" [min]="0" styleClass="w-full" />
        <label>Estado</label>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class FoliosComponent implements OnInit {
  private readonly api = inject(FinanceApiService).folios;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<FolioSeries[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly docTypes = DOC_TYPES;
  readonly statusOptions = [
    { label: 'Activa', value: 'active' },
    { label: 'Inactiva', value: 'inactive' },
  ];

  dialogVisible = false;
  form: Form = { documentType: 'BOLETA', series: '', currentNumber: 0, status: 'active' };

  readonly canCreate = this.auth.can('finance', 'create');
  readonly canEdit = this.auth.can('finance', 'edit');
  readonly canDelete = this.auth.can('finance', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  docLabel(v: string): string {
    return DOC_TYPES.find((d) => d.value === v)?.label ?? v;
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'documentType' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { documentType: 'BOLETA', series: '', currentNumber: 0, status: 'active' };
    this.dialogVisible = true;
  }

  openEdit(row: FolioSeries): void {
    this.form = { id: row.id, documentType: row.documentType, series: row.series, currentNumber: row.currentNumber, status: row.status as 'active' | 'inactive' };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.series) {
      this.messages.add({ severity: 'warn', summary: 'Falta serie', detail: 'Ingresa la serie.' });
      return;
    }
    const dto = { documentType: this.form.documentType, series: this.form.series, currentNumber: this.form.currentNumber, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Serie guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: FolioSeries): void {
    this.confirm.confirm({
      header: 'Eliminar serie',
      message: `¿Eliminar la serie ${row.series}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Serie eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
