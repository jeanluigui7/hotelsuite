import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface RoomOpt { id: string; number: string; }
interface Rev { id: string; room: string; status: string; tipoFalla?: string | null; acciones?: string[]; observaciones?: string | null; photo?: string | null; createdAt: string; }

const TIPOS = ['Mobiliario', 'Baño', 'Electricidad', 'Plomería', 'Pintura/Paredes', 'Otros'];
const ACCIONES = ['Limpieza de paredes', 'Cambio de foco', 'Reparación de mueble', 'Destape de desagüe', 'Pintura', 'Revisión general'];

@Component({
  selector: 'app-revision-periodica',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, SelectModule, InputTextModule, TagModule],
  template: `
    <section class="rp">
      <header class="top"><h1>Revisión Periódica</h1></header>
      <div class="grid">
        <div class="form card">
          <div class="field"><label>Habitación</label>
            <p-select [options]="rooms()" [(ngModel)]="roomId" optionValue="id" optionLabel="number" [filter]="true" filterBy="number" placeholder="Selecciona habitación" styleClass="w" />
          </div>
          <div class="field"><label>Tipo de falla</label>
            <p-select [options]="tipos" [(ngModel)]="tipoFalla" placeholder="Sin falla / OK" [showClear]="true" styleClass="w" />
          </div>
          <label>Acciones realizadas</label>
          <div class="acc">
            @for (a of acciones; track a) {
              <label class="chk"><input type="checkbox" [checked]="selAcc.has(a)" (change)="toggleAcc(a)" /> {{ a }}</label>
            }
          </div>
          <div class="field"><label>Observaciones</label><input pInputText [(ngModel)]="observaciones" placeholder="Detalle de la revisión" /></div>
          <div class="field"><label>Foto</label>
            <input type="file" accept="image/*" (change)="onPhoto($event)" />
            @if (photo()) { <img [src]="photo()" class="prev" alt="foto" /> }
          </div>
          <div class="actions">
            <p-button label="Finalizar - Todo OK" icon="pi pi-check" (onClick)="save('OK')" [loading]="busy()" />
            <p-button label="Finalizar con observación" icon="pi pi-exclamation-triangle" severity="warn" (onClick)="save('ISSUE')" [loading]="busy()" [disabled]="!roomId" />
          </div>
        </div>

        <div class="hist">
          <h3>Historial de revisiones</h3>
          @for (r of history(); track r.id) {
            <div class="rev">
              <div class="rh"><strong>Hab. {{ r.room }}</strong> <p-tag [value]="r.status === 'OK' ? 'OK' : 'Observación'" [severity]="r.status === 'OK' ? 'success' : 'warn'" /> <span class="muted">{{ r.createdAt | date: 'dd/MM HH:mm' }}</span></div>
              @if (r.tipoFalla) { <div class="muted">Falla: {{ r.tipoFalla }}</div> }
              @if (r.acciones?.length) { <div class="muted">Acciones: {{ r.acciones?.join(', ') }}</div> }
              @if (r.observaciones) { <div>{{ r.observaciones }}</div> }
              @if (r.photo) { <img [src]="r.photo" class="thumb" alt="foto" /> }
            </div>
          } @empty { <p class="muted">Sin revisiones registradas.</p> }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .rp { background: #0b1410; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6efe9; }
      h1 { margin: 0; color: #fff; } h3 { margin: 0 0 0.7rem; color: #34d399; }
      .muted { color: #8aa499; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
      .card { background: #0e241c; border: 1px solid #1f3a2c; border-radius: 12px; padding: 1.25rem; }
      .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
      label { font-size: 0.85rem; color: #9fb0c3; }
      :host ::ng-deep .w .p-select, :host ::ng-deep .form input[pInputText] { width: 100%; background: #0b1410; border-color: #1f3a2c; color: #e6efe9; }
      .acc { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin: 0.3rem 0 0.8rem; }
      .chk { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #cde8db; }
      .prev, .thumb { max-width: 160px; border-radius: 8px; margin-top: 0.5rem; border: 1px solid #1f3a2c; }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
      .hist { display: flex; flex-direction: column; gap: 0.6rem; }
      .rev { background: #0e241c; border: 1px solid #1f3a2c; border-radius: 10px; padding: 0.8rem; }
      .rh { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.3rem; }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class RevisionPeriodicaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);

  readonly rooms = signal<RoomOpt[]>([]);
  readonly history = signal<Rev[]>([]);
  readonly photo = signal<string | null>(null);
  readonly busy = signal(false);
  readonly tipos = TIPOS;
  readonly acciones = ACCIONES;
  selAcc = new Set<string>();
  roomId: string | null = null;
  tipoFalla: string | null = null;
  observaciones = '';

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.http.get<ApiResponse<RoomOpt[]>>(`${this.api}/rooms/map`).subscribe((r) => this.rooms.set((r.data ?? []).map((x: { id: string; number: string }) => ({ id: x.id, number: x.number }))));
    this.http.get<ApiResponse<Rev[]>>(`${this.api}/cleaning/revisions`).subscribe((r) => this.history.set(r.data ?? []));
  }

  toggleAcc(a: string): void { if (this.selAcc.has(a)) this.selAcc.delete(a); else this.selAcc.add(a); }

  onPhoto(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) { this.toast.add({ severity: 'warn', summary: 'Foto muy grande', detail: 'Usa una imagen menor a 1.5 MB.' }); return; }
    const reader = new FileReader();
    reader.onload = () => this.photo.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  save(status: 'OK' | 'ISSUE'): void {
    if (!this.roomId) { this.toast.add({ severity: 'warn', summary: 'Falta habitación', detail: 'Selecciona una habitación.' }); return; }
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/cleaning/revision`, {
      roomId: this.roomId, status, tipoFalla: this.tipoFalla || undefined, acciones: [...this.selAcc], observaciones: this.observaciones || undefined, photo: this.photo() || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.add({ severity: 'success', summary: 'Revisión registrada', detail: status === 'OK' ? 'Todo OK' : 'Con observación' });
        this.roomId = null; this.tipoFalla = null; this.observaciones = ''; this.selAcc = new Set(); this.photo.set(null);
        this.reload();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
