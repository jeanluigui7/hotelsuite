import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import type { ApiResponse } from '../../../core/models/api-response.model';

type WifiMode = 'GLOBAL' | 'TARIFA' | 'TIPO' | 'POOL' | 'NONE';
interface WifiConfig { mode: WifiMode; globalSsid: string; globalPassword: string }

const MODES: { value: WifiMode; label: string; desc: string }[] = [
  { value: 'GLOBAL', label: 'WiFi Global', desc: 'Una sola credencial para todo el hospedaje.' },
  { value: 'TARIFA', label: 'WiFi por Tarifa', desc: 'Credencial específica según la tarifa contratada (recomendado).' },
  { value: 'TIPO', label: 'WiFi por Tipo de Habitación', desc: 'Credencial específica según el tipo de habitación.' },
  { value: 'POOL', label: 'Pool WiFi / Pool de Credenciales', desc: 'Asigna una credencial disponible del Pool WiFi.' },
  { value: 'NONE', label: 'Sin WiFi', desc: 'No incluir información de WiFi.' },
];

@Component({
  selector: 'app-wifi-config',
  standalone: true,
  imports: [FormsModule, RouterLink, InputTextModule, ButtonModule],
  template: `
    <section class="wrap">
      <header class="head">
        <div>
          <h1><i class="pi pi-wifi"></i> Configuración WiFi</h1>
          <p class="muted">Define cómo se entrega la credencial de WiFi al huésped. El WiFi es la fuente; <a routerLink="/whatsapp/mensajes">WhatsApp</a> y el Ticket la consumen.</p>
        </div>
        @if (canEdit) { <p-button label="Guardar configuración" icon="pi pi-check" [loading]="saving()" (onClick)="save()" /> }
      </header>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        <div class="card">
          <h3>Modo de entrega de credenciales</h3>
          <p class="desc">Elige cómo el sistema determina la credencial WiFi del huésped. Son modos internos, no submenús.</p>
          <div class="modes">
            @for (m of modes; track m.value) {
              <label class="mode" [class.on]="cfg.mode === m.value">
                <input type="radio" name="wmode" [value]="m.value" [(ngModel)]="cfg.mode" [disabled]="!canEdit" />
                <span class="dot"></span>
                <span class="txt"><strong>{{ m.label }}</strong><small>{{ m.desc }}</small></span>
              </label>
            }
          </div>

          @if (cfg.mode === 'GLOBAL') {
            <div class="global">
              <h4>Credencial global</h4>
              <div class="row">
                <div class="col"><label>Red (SSID)</label><input pInputText [(ngModel)]="cfg.globalSsid" [disabled]="!canEdit" placeholder="Nombre de la red" /></div>
                <div class="col"><label>Contraseña</label><input pInputText [(ngModel)]="cfg.globalPassword" [disabled]="!canEdit" placeholder="Clave de la red" /></div>
              </div>
            </div>
          } @else if (cfg.mode === 'POOL') {
            <p class="hint"><i class="pi pi-info-circle"></i> Las credenciales se tomarán del <a routerLink="/wifi/pool">Pool WiFi</a>. La lógica de asignación se implementará en una etapa posterior.</p>
          } @else if (cfg.mode === 'TARIFA' || cfg.mode === 'TIPO') {
            <p class="hint"><i class="pi pi-info-circle"></i> La asignación de credenciales por {{ cfg.mode === 'TARIFA' ? 'tarifa' : 'tipo de habitación' }} se implementará en una etapa posterior.</p>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.5rem; max-width: 820px; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .head h1 { margin: 0; font-size: 1.5rem; display: inline-flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--p-text-muted-color, #64748b); margin: 0.35rem 0 0; }
      .muted a, .hint a { color: var(--p-primary-color, #3b82f6); font-weight: 600; }
      .card { margin-top: 1.25rem; background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; padding: 1.25rem; }
      h3 { margin: 0; font-size: 1.05rem; } h4 { margin: 0 0 0.5rem; }
      .desc { color: var(--p-text-muted-color, #64748b); font-size: 0.86rem; margin: 0.25rem 0 0.9rem; }
      .modes { display: flex; flex-direction: column; gap: 0.6rem; }
      .mode { display: flex; align-items: flex-start; gap: 0.7rem; padding: 0.9rem 1rem; border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 10px; cursor: pointer; }
      .mode.on { border-color: var(--p-primary-color, #3b82f6); background: rgba(59,130,246,0.06); }
      .mode input { position: absolute; opacity: 0; width: 0; height: 0; }
      .mode .dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--p-content-border-color, #cbd5e1); margin-top: 0.15rem; flex: none; position: relative; }
      .mode.on .dot { border-color: var(--p-primary-color, #3b82f6); }
      .mode.on .dot::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--p-primary-color, #3b82f6); }
      .mode .txt strong { display: block; } .mode .txt small { color: var(--p-text-muted-color, #64748b); font-size: 0.83rem; }
      .global { margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--p-content-border-color, #e2e8f0); }
      .row { display: flex; gap: 1rem; flex-wrap: wrap; } .col { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 0.3rem; }
      .col label { font-size: 0.82rem; font-weight: 600; }
      :host ::ng-deep .col input { width: 100%; }
      .hint { display: flex; align-items: center; gap: 0.45rem; margin: 1rem 0 0; padding: 0.6rem 0.8rem; border-radius: 8px; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: var(--p-primary-color, #2563eb); font-size: 0.84rem; }
    `,
  ],
})
export class WifiConfigComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly modes = MODES;
  cfg: WifiConfig = { mode: 'GLOBAL', globalSsid: '', globalPassword: '' };

  ngOnInit(): void {
    this.http.get<ApiResponse<WifiConfig>>(`${this.api}/wifi/config`).subscribe({
      next: (r) => { if (r.data) this.cfg = { ...this.cfg, ...r.data }; this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  save(): void {
    this.saving.set(true);
    this.http.put<ApiResponse<WifiConfig>>(`${this.api}/wifi/config`, this.cfg).subscribe({
      next: (r) => { if (r.data) this.cfg = { ...this.cfg, ...r.data }; this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuración WiFi actualizada.' }); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
}
