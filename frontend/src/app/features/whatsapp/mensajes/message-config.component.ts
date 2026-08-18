import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import type { ApiResponse } from '../../../core/models/api-response.model';

interface Notif { enabled: boolean; numbers: string[] }
type NotifKey = 'reception' | 'productRequest' | 'productWriteoff' | 'maintenance';
interface MsgConfig {
  autoSend: boolean;
  aiAgent: boolean;
  showWifi: boolean;
  welcomeTemplate: string;
  notifications: Record<NotifKey, Notif>;
  variables: string[];
  defaultTemplate: string;
}
const WIFI_MODE_LABEL: Record<string, string> = {
  GLOBAL: 'WiFi Global', TARIFA: 'WiFi por Tarifa', TIPO: 'WiFi por Tipo de Habitación', POOL: 'Pool WiFi', NONE: 'Sin WiFi',
};

@Component({
  selector: 'app-message-config',
  standalone: true,
  imports: [FormsModule, RouterLink, InputTextModule, ToggleSwitchModule, ButtonModule],
  template: `
    <section class="wrap">
      <header class="head">
        <div>
          <h1>Configuración de Mensajes</h1>
          <p class="muted">Personaliza los mensajes de bienvenida automáticos para tus huéspedes.</p>
        </div>
        <div class="head-actions">
          <span class="badge" [class.on]="cfg.autoSend"><i class="pi" [class.pi-check-circle]="cfg.autoSend" [class.pi-times-circle]="!cfg.autoSend"></i> {{ cfg.autoSend ? 'Activado' : 'Desactivado' }}</span>
          @if (canEdit) { <p-button label="Guardar Configuración" icon="pi pi-save" [loading]="saving()" (onClick)="save()" /> }
        </div>
      </header>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        <!-- General -->
        <div class="card">
          <h3>Configuración General</h3>
          <p class="desc">Activa o desactiva el envío automático de mensajes de bienvenida.</p>
          <div class="sw"><p-toggleswitch [(ngModel)]="cfg.autoSend" [disabled]="!canEdit" /><div><strong>Envío Automático de Mensajes</strong><small>Los mensajes se enviarán automáticamente al crear reservas.</small></div></div>
          <div class="sw ai"><p-toggleswitch [(ngModel)]="cfg.aiAgent" [disabled]="!canEdit" /><div><strong>Agente IA de Reservas <span class="beta">Beta</span></strong><small>Responde a números sin reserva activa usando IA para entender solicitudes.</small></div></div>
        </div>

        <!-- WiFi en el mensaje -->
        <div class="card">
          <h3>WiFi en el mensaje</h3>
          <p class="desc">El WiFi es la fuente de la credencial; aquí solo decides si se incluye en el mensaje de bienvenida.</p>
          <div class="sw"><p-toggleswitch [(ngModel)]="cfg.showWifi" [disabled]="!canEdit" /><div><strong>Mostrar WiFi en Mensaje</strong><small>Incluir las credenciales WiFi (variable <code>{{ '{wifi_info}' }}</code>) en el mensaje.</small></div></div>
          <p class="hint"><i class="pi pi-wifi"></i> Modo de WiFi actual: <strong>{{ wifiModeLabel() }}</strong>. Se configura en <a routerLink="/wifi/configuracion">WiFi → Configuración WiFi</a>.</p>
        </div>

        <!-- Plantilla -->
        <div class="card">
          <h3>Plantilla de Mensaje</h3>
          <p class="desc">Personaliza el contenido usando las variables disponibles.</p>
          <div class="vars">
            @for (v of cfg.variables; track v) {
              <button type="button" class="chip" [disabled]="!canEdit" (click)="insertVar(v)">{{ '{' + v + '}' }}</button>
            }
          </div>
          <small class="tiny">Haz clic en una variable para insertarla en el mensaje.</small>
          <textarea #ta class="editor" rows="12" [(ngModel)]="cfg.welcomeTemplate" [disabled]="!canEdit"></textarea>
          <p class="note"><i class="pi pi-info-circle"></i> El sistema agregará automáticamente el <strong>Código de Verificación</strong> al final aunque no lo incluyas. <code>{{ '{wifi_info}' }}</code> se reemplaza con las credenciales del modo WiFi seleccionado.</p>
          @if (canEdit) { <button class="lnk" (click)="restoreTemplate()"><i class="pi pi-refresh"></i> Restaurar Plantilla por Defecto</button> }
        </div>

        <!-- Prueba -->
        <div class="card">
          <h3>Enviar Mensaje de Prueba</h3>
          <p class="desc">Prueba cómo se ve el mensaje enviándolo a tu WhatsApp.</p>
          <div class="test">
            <input pInputText [(ngModel)]="testNumber" placeholder="Ej: 51987654321 (con código de país, sin +)" />
            <p-button label="Enviar Prueba" icon="pi pi-send" severity="secondary" (onClick)="sendTest()" />
          </div>
        </div>

        <!-- Notificaciones internas -->
        @for (s of notifSections; track s.key) {
          <div class="card">
            <h3>{{ s.title }}</h3>
            <p class="desc">{{ s.desc }}</p>
            <div class="sw"><p-toggleswitch [(ngModel)]="cfg.notifications[s.key].enabled" [disabled]="!canEdit" /><div><strong>{{ s.toggleLabel }}</strong><small>{{ cfg.notifications[s.key].enabled ? s.onText : s.offText }}</small></div></div>
            @if (cfg.notifications[s.key].enabled) {
              <div class="numbers">
                <label>Números Autorizados <small>(con código de país)</small></label>
                @for (n of cfg.notifications[s.key].numbers; track $index; let i = $index) {
                  <div class="num-row">
                    <input pInputText [ngModel]="cfg.notifications[s.key].numbers[i]" (ngModelChange)="setNumber(s.key, i, $event)" placeholder="51999999999" [disabled]="!canEdit" />
                    @if (canEdit) { <button class="del" (click)="removeNumber(s.key, i)"><i class="pi pi-trash"></i></button> }
                  </div>
                }
                @if (canEdit) { <button class="add-num" (click)="addNumber(s.key)"><i class="pi pi-plus"></i> Agregar Número</button> }
                @if (!cfg.notifications[s.key].numbers.length) { <p class="tiny">Aún no hay números. Agrega al menos uno para recibir esta notificación.</p> }
              </div>
            }
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.5rem; max-width: 920px; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      .head h1 { margin: 0; font-size: 1.5rem; }
      .head-actions { display: flex; align-items: center; gap: 0.6rem; }
      .muted { color: var(--p-text-muted-color, #64748b); margin: 0.3rem 0 0; }
      .badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.8rem; border-radius: 999px; font-weight: 700; font-size: 0.82rem; background: rgba(148,163,184,0.18); color: #64748b; }
      .badge.on { background: rgba(16,185,129,0.16); color: #059669; }
      .card { background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; padding: 1.15rem 1.25rem; margin-bottom: 1rem; }
      h3 { margin: 0; font-size: 1.02rem; }
      .desc { color: var(--p-text-muted-color, #64748b); font-size: 0.85rem; margin: 0.25rem 0 0.8rem; }
      .sw { display: flex; align-items: flex-start; gap: 0.8rem; padding: 0.7rem 0; }
      .sw strong { display: block; } .sw small { color: var(--p-text-muted-color, #64748b); font-size: 0.83rem; }
      .sw.ai { margin-top: 0.4rem; padding-top: 0.9rem; border-top: 1px dashed var(--p-content-border-color, #e2e8f0); }
      .beta { font-size: 0.66rem; font-weight: 700; background: #7c3aed; color: #fff; padding: 0.05rem 0.4rem; border-radius: 999px; vertical-align: middle; }
      .hint { display: flex; align-items: center; gap: 0.45rem; margin: 0.6rem 0 0; padding: 0.55rem 0.75rem; border-radius: 8px; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: var(--p-primary-color, #2563eb); font-size: 0.83rem; }
      .hint a, .note a { color: var(--p-primary-color, #3b82f6); font-weight: 600; }
      .vars { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.3rem; }
      .chip { border: 1px solid var(--p-content-border-color, #cbd5e1); background: var(--p-highlight-background, rgba(59,130,246,0.08)); color: var(--p-primary-color, #2563eb); border-radius: 7px; padding: 0.25rem 0.55rem; font-size: 0.78rem; font-family: monospace; cursor: pointer; }
      .chip:hover { background: rgba(59,130,246,0.16); } .chip:disabled { opacity: 0.6; cursor: default; }
      .tiny { color: var(--p-text-muted-color, #94a3b8); font-size: 0.76rem; margin: 0.2rem 0 0; }
      .editor { width: 100%; margin-top: 0.5rem; border: 1px solid var(--p-content-border-color, #cbd5e1); border-radius: 10px; padding: 0.8rem; font-family: 'Segoe UI', monospace; font-size: 0.9rem; line-height: 1.5; resize: vertical; background: var(--p-content-background, #fff); color: inherit; }
      .note { display: flex; align-items: flex-start; gap: 0.45rem; margin: 0.6rem 0 0; padding: 0.55rem 0.75rem; border-radius: 8px; background: rgba(59,130,246,0.08); font-size: 0.8rem; color: #475569; }
      code { background: rgba(148,163,184,0.2); padding: 0.05rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
      .lnk { margin-top: 0.7rem; background: none; border: 0; color: var(--p-primary-color, #3b82f6); font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; }
      .test { display: flex; gap: 0.6rem; flex-wrap: wrap; } .test input { flex: 1; min-width: 240px; }
      .numbers { margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px dashed var(--p-content-border-color, #e2e8f0); }
      .numbers > label { font-size: 0.82rem; font-weight: 600; display: block; margin-bottom: 0.5rem; }
      .num-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; } .num-row input { flex: 1; }
      .del { background: #fee2e2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; width: 2.4rem; cursor: pointer; }
      .add-num { background: none; border: 1px dashed var(--p-content-border-color, #cbd5e1); color: var(--p-text-muted-color, #475569); border-radius: 8px; padding: 0.5rem; width: 100%; cursor: pointer; font-weight: 600; }
      :host ::ng-deep input[pInputText] { width: 100%; }
    `,
  ],
})
export class MessageConfigComponent implements OnInit {
  @ViewChild('ta') ta?: ElementRef<HTMLTextAreaElement>;
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly canEdit = this.auth.can('whatsapp', 'edit');
  readonly wifiMode = signal<string>('GLOBAL');
  wifiModeLabel(): string { return WIFI_MODE_LABEL[this.wifiMode()] ?? this.wifiMode(); }
  testNumber = '';

  readonly notifSections: { key: NotifKey; title: string; desc: string; toggleLabel: string; onText: string; offText: string }[] = [
    { key: 'reception', title: 'Notificaciones de Confirmación de Reservas', desc: 'Números que reciben una notificación cuando un huésped confirma su reserva (recepción de check-in).', toggleLabel: 'Activar Notificaciones de Recepción', onText: 'Se enviará un mensaje cuando un huésped confirme su llegada.', offText: 'No se enviarán notificaciones de recepción.' },
    { key: 'productRequest', title: 'Notificaciones de Solicitud de Productos', desc: 'Números que reciben una notificación cuando se solicite ropa, productos de limpieza o inventario.', toggleLabel: 'Activar Notificaciones de Solicitud', onText: 'Se enviará un mensaje cuando se solicite inventario.', offText: 'No se enviarán notificaciones de solicitudes.' },
    { key: 'productWriteoff', title: 'Notificaciones de Baja de Productos', desc: 'Números que reciben una notificación cuando se dé de baja productos del inventario de recepción.', toggleLabel: 'Activar Notificaciones de Baja', onText: 'Se enviará un mensaje cuando se dé de baja inventario.', offText: 'No se enviarán notificaciones de bajas.' },
    { key: 'maintenance', title: 'Notificaciones de Habitación en Mantenimiento', desc: 'Números que reciben una notificación cuando una habitación entre en estado de mantenimiento.', toggleLabel: 'Activar Notificaciones de Mantenimiento', onText: 'Se enviará un mensaje cuando una habitación entre en mantenimiento.', offText: 'No se enviarán notificaciones de mantenimiento.' },
  ];

  cfg: MsgConfig = {
    autoSend: true, aiAgent: false, showWifi: true, welcomeTemplate: '',
    notifications: {
      reception: { enabled: false, numbers: [] }, productRequest: { enabled: false, numbers: [] },
      productWriteoff: { enabled: false, numbers: [] }, maintenance: { enabled: false, numbers: [] },
    },
    variables: [], defaultTemplate: '',
  };

  ngOnInit(): void {
    this.http.get<ApiResponse<MsgConfig>>(`${this.api}/whatsapp/config`).subscribe({
      next: (r) => { if (r.data) this.cfg = { ...this.cfg, ...r.data, notifications: { ...this.cfg.notifications, ...r.data.notifications } }; this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.http.get<ApiResponse<{ mode: string }>>(`${this.api}/wifi/config`).subscribe({ next: (r) => { if (r.data?.mode) this.wifiMode.set(r.data.mode); }, error: () => {} });
  }

  insertVar(v: string): void {
    const token = `{${v}}`;
    const el = this.ta?.nativeElement;
    if (!el) { this.cfg.welcomeTemplate += token; return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    this.cfg.welcomeTemplate = el.value.slice(0, start) + token + el.value.slice(end);
    setTimeout(() => { el.focus(); const p = start + token.length; el.setSelectionRange(p, p); });
  }

  restoreTemplate(): void { this.cfg.welcomeTemplate = this.cfg.defaultTemplate; }

  addNumber(key: NotifKey): void { this.cfg.notifications[key].numbers = [...this.cfg.notifications[key].numbers, '']; }
  removeNumber(key: NotifKey, i: number): void { this.cfg.notifications[key].numbers = this.cfg.notifications[key].numbers.filter((_, idx) => idx !== i); }
  setNumber(key: NotifKey, i: number, val: string): void { const n = [...this.cfg.notifications[key].numbers]; n[i] = val.replace(/[^0-9]/g, ''); this.cfg.notifications[key].numbers = n; }

  sendTest(): void {
    const to = this.testNumber.replace(/[^0-9]/g, '');
    if (to.length < 8) { this.toast.add({ severity: 'warn', summary: 'Número inválido', detail: 'Ingresa un número con código de país (sin +).' }); return; }
    // Envío real pendiente de Evolution API: por ahora se confirma el destino y el render.
    this.toast.add({ severity: 'info', summary: 'Prueba simulada', detail: `Mensaje de bienvenida listo para ${to}. El envío real se habilitará al conectar Evolution API en Instancias.` });
  }

  save(): void {
    // Limpia números vacíos antes de guardar.
    for (const s of this.notifSections) {
      this.cfg.notifications[s.key].numbers = this.cfg.notifications[s.key].numbers.map((n) => n.trim()).filter(Boolean);
    }
    this.saving.set(true);
    const body = { autoSend: this.cfg.autoSend, aiAgent: this.cfg.aiAgent, showWifi: this.cfg.showWifi, welcomeTemplate: this.cfg.welcomeTemplate, notifications: this.cfg.notifications };
    this.http.put<ApiResponse<MsgConfig>>(`${this.api}/whatsapp/config`, body).subscribe({
      next: (r) => { if (r.data) this.cfg = { ...this.cfg, ...r.data, notifications: { ...this.cfg.notifications, ...r.data.notifications } }; this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuración de mensajes actualizada.' }); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
}
