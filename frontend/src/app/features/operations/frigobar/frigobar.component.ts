import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';
import { FinanceApiService } from '../../finance/services/finance-api.service';

interface Line {
  product: Product;
  quantity: number;
}

@Component({
  selector: 'app-frigobar',
  standalone: true,
  imports: [DecimalPipe, FormsModule, SelectModule, TableModule, ButtonModule, InputNumberModule],
  template: `
    <section>
      <header class="head">
        <h1>Frigobar</h1>
        <p class="muted">Registra el consumo de minibar y lo carga a la cuenta de la habitación.</p>
      </header>

      <div class="row">
        <div class="field">
          <label>Habitación / Estancia</label>
          <p-select [options]="stays()" [(ngModel)]="selectedStayId" optionValue="id" placeholder="Selecciona una habitación ocupada" styleClass="w" [filter]="true" filterBy="label">
            <ng-template let-s pTemplate="item">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
            <ng-template let-s pTemplate="selectedItem">Hab. {{ s.room.number }} · {{ s.guest.firstName }} {{ s.guest.lastName }}</ng-template>
          </p-select>
        </div>
        <div class="field">
          <label>Agregar producto</label>
          <p-select [options]="products()" [(ngModel)]="pickProductId" optionValue="id" placeholder="Producto" styleClass="w" [filter]="true" filterBy="name" (onChange)="addLine()">
            <ng-template let-p pTemplate="item">{{ p.name }} — {{ p.salePrice | number: '1.2-2' }} (stock {{ p.stock }})</ng-template>
          </p-select>
        </div>
      </div>

      <p-table [value]="lines()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Producto</th><th style="width:9rem">Precio</th><th style="width:9rem">Cantidad</th><th style="width:9rem">Subtotal</th><th style="width:4rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-l let-i="rowIndex">
          <tr>
            <td>{{ l.product.name }}</td>
            <td>{{ +l.product.salePrice | number: '1.2-2' }}</td>
            <td><p-inputNumber [(ngModel)]="l.quantity" [min]="1" [showButtons]="true" buttonLayout="horizontal" [step]="1" inputStyleClass="qty" (onInput)="touch()" /></td>
            <td>{{ +l.product.salePrice * l.quantity | number: '1.2-2' }}</td>
            <td><p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="removeLine(i)" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin productos agregados.</td></tr></ng-template>
      </p-table>

      <div class="foot">
        <div class="total">Total: <strong>{{ total() | number: '1.2-2' }}</strong></div>
        <p-button label="Registrar consumo" icon="pi pi-check" [disabled]="!canSubmit()" [loading]="saving()" (onClick)="submit()" />
      </div>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .center { text-align: center; }
      .row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; min-width: 280px; flex: 1; }
      label { font-size: 0.85rem; color: var(--p-text-muted-color, #6b7280); }
      :host ::ng-deep .w { width: 100%; }
      :host ::ng-deep .qty { width: 4rem; text-align: center; }
      .foot { display: flex; align-items: center; justify-content: flex-end; gap: 1.5rem; margin-top: 1.25rem; }
      .total { font-size: 1.1rem; }
    `,
  ],
})
export class FrigobarComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly inventory = inject(InventoryApiService);
  private readonly finance = inject(FinanceApiService);
  private readonly toast = inject(MessageService);

  readonly stays = signal<(Stay & { label?: string })[]>([]);
  readonly products = signal<Product[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly saving = signal(false);
  selectedStayId: string | null = null;
  pickProductId: string | null = null;

  readonly total = computed(() => this.lines().reduce((acc, l) => acc + Number(l.product.salePrice) * l.quantity, 0));

  ngOnInit(): void {
    this.ops.stays({ status: 'OPEN', pageSize: 200 }).subscribe((res) => this.stays.set(res.data ?? []));
    this.inventory.products.list({ pageSize: 300, status: 'active' }).subscribe((res) => this.products.set(res.data ?? []));
  }

  canSubmit(): boolean {
    return !!this.selectedStayId && this.lines().length > 0 && !this.saving();
  }

  touch(): void {
    this.lines.set([...this.lines()]);
  }

  addLine(): void {
    const p = this.products().find((x) => x.id === this.pickProductId);
    if (!p) return;
    const existing = this.lines().find((l) => l.product.id === p.id);
    if (existing) {
      existing.quantity += 1;
      this.lines.set([...this.lines()]);
    } else {
      this.lines.set([...this.lines(), { product: p, quantity: 1 }]);
    }
    this.pickProductId = null;
  }

  removeLine(i: number): void {
    const next = [...this.lines()];
    next.splice(i, 1);
    this.lines.set(next);
  }

  submit(): void {
    if (!this.canSubmit() || !this.selectedStayId) return;
    this.saving.set(true);
    this.finance
      .createSale({
        stayId: this.selectedStayId,
        items: this.lines().map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        payments: [],
      })
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Consumo registrado', detail: 'Cargado a la cuenta de la habitación.' });
          this.lines.set([]);
          this.selectedStayId = null;
          this.saving.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar el consumo.' });
        },
      });
  }
}
