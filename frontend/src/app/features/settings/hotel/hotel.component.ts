import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { CrudApi } from '../../../core/http/crud-api';
import { AuthService } from '../../../core/auth/auth.service';
import type { Branch } from '../../../core/auth/auth.models';

interface Form {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  currency: string;
  cutoffHour: number;
}

@Component({
  selector: 'app-hotel',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, InputNumberModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Hotel</h1>
          <p class="muted">Datos de la sucursal activa: {{ auth.activeBranch()?.name }}</p>
        </div>
      </header>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else {
        <div class="cat-form panel">
          <div class="row">
            <div class="col">
              <label>Nombre comercial</label>
              <input pInputText [(ngModel)]="form.name" [disabled]="!canEdit" />
            </div>
            <div class="col">
              <label>Razón social</label>
              <input pInputText [(ngModel)]="form.legalName" [disabled]="!canEdit" />
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>RUC / Identificación fiscal</label>
              <input pInputText [(ngModel)]="form.taxId" [disabled]="!canEdit" />
            </div>
            <div class="col">
              <label>Teléfono</label>
              <input pInputText [(ngModel)]="form.phone" [disabled]="!canEdit" />
            </div>
          </div>
          <label>Dirección</label>
          <input pInputText [(ngModel)]="form.address" [disabled]="!canEdit" />
          <div class="row">
            <div class="col">
              <label>Email</label>
              <input pInputText type="email" [(ngModel)]="form.email" [disabled]="!canEdit" />
            </div>
            <div class="col">
              <label>Logo (URL)</label>
              <input pInputText [(ngModel)]="form.logoUrl" [disabled]="!canEdit" />
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Moneda (ISO)</label>
              <input pInputText maxlength="3" [(ngModel)]="form.currency" [disabled]="!canEdit" />
            </div>
            <div class="col">
              <label>Hora de corte de turno</label>
              <p-inputNumber [(ngModel)]="form.cutoffHour" [min]="0" [max]="23" [disabled]="!canEdit" styleClass="w-full" />
            </div>
          </div>

          @if (canEdit) {
            <div class="actions-row">
              <p-button label="Guardar cambios" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .panel {
        max-width: 720px;
        background: var(--p-content-background, #1f1f23);
        border: 1px solid var(--p-content-border-color, #2b2b30);
        border-radius: 12px;
        padding: 1.5rem;
      }
      .actions-row {
        margin-top: 1.5rem;
      }
    `,
  ],
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class HotelComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = new CrudApi<Branch>(this.http, 'branches');
  readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly canEdit = this.auth.can('settings', 'edit');

  form: Form = {
    name: '',
    legalName: '',
    taxId: '',
    address: '',
    phone: '',
    email: '',
    logoUrl: '',
    currency: 'PEN',
    cutoffHour: 0,
  };

  ngOnInit(): void {
    const id = this.auth.activeBranchId();
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.api.get(id).subscribe({
      next: (res) => {
        const b = res.data;
        this.form = {
          name: b.name ?? '',
          legalName: (b as Branch & { legalName?: string }).legalName ?? '',
          taxId: b.taxId ?? '',
          address: b.address ?? '',
          phone: (b as Branch & { phone?: string }).phone ?? '',
          email: (b as Branch & { email?: string }).email ?? '',
          logoUrl: (b as Branch & { logoUrl?: string }).logoUrl ?? '',
          currency: b.currency ?? 'PEN',
          cutoffHour: b.cutoffHour ?? 0,
        };
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save(): void {
    const id = this.auth.activeBranchId();
    if (!id) return;
    this.saving.set(true);
    this.api.update(id, this.form).subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Datos del hotel actualizados.' });
        this.auth.loadBranches().subscribe();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }
}
