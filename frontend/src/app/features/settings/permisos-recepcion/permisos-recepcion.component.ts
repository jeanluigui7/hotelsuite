import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Perms { allowChangeRoom: boolean; allowWriteOff: boolean; allowViewCash: boolean; }

@Component({
  selector: 'app-permisos-recepcion',
  standalone: true,
  imports: [FormsModule, ToggleSwitchModule, ButtonModule],
  template: `
    <section>
      <header class="head">
        <h1>Permisos de Recepción</h1>
        <p class="muted">Habilita o restringe funciones del recepcionista en esta sucursal.</p>
      </header>
      <div class="card">
        <div class="row"><p-toggleswitch [(ngModel)]="form.allowChangeRoom" /><div><strong>Cambiar de habitación</strong><small class="block muted">Permite mover una estancia a otra habitación.</small></div></div>
        <div class="row"><p-toggleswitch [(ngModel)]="form.allowWriteOff" /><div><strong>Dar de baja inventario</strong><small class="block muted">Permite dar de baja productos del inventario de recepción.</small></div></div>
        <div class="row"><p-toggleswitch [(ngModel)]="form.allowViewCash" /><div><strong>Ver caja</strong><small class="block muted">Permite ver el detalle de la caja/turno.</small></div></div>
        <div class="actions"><p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" /></div>
      </div>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; } .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); } .block { display: block; }
      .card { background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 12px; padding: 1.5rem; max-width: 540px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      .row { display: flex; align-items: flex-start; gap: 0.85rem; margin-bottom: 1.1rem; }
      .actions { margin-top: 0.5rem; }
    `,
  ],
})
export class PermisosRecepcionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly saving = signal(false);
  form: Perms = { allowChangeRoom: false, allowWriteOff: false, allowViewCash: true };

  ngOnInit(): void {
    this.http.get<ApiResponse<Perms>>(`${this.api}/reception/permissions`).subscribe((r) => { if (r.data) this.form = { ...r.data }; });
  }

  save(): void {
    this.saving.set(true);
    this.http.put<ApiResponse<Perms>>(`${this.api}/reception/permissions`, this.form).subscribe({
      next: (r) => { if (r.data) this.form = { ...r.data }; this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Permisos actualizados.' }); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
