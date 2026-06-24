import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService, type ThemeMode } from '../../core/theme/theme.service';

type Tab = 'perfil' | 'password' | 'audio' | 'apariencia';
const AUDIO_KEY = 'hs_audio';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule],
  template: `
    <section class="ps">
      <div class="grid">
        <!-- Nav lateral -->
        <aside class="nav">
          <div class="nav-head"><span class="ico"><i class="pi pi-cog"></i></span><div><strong>Configuración</strong><small>Gestiona tu cuenta y preferencias</small></div></div>
          <button class="nav-item" [class.on]="tab() === 'perfil'" (click)="tab.set('perfil')"><i class="pi pi-user"></i> Perfil</button>
          <button class="nav-item" [class.on]="tab() === 'password'" (click)="tab.set('password')"><i class="pi pi-key"></i> Contraseña</button>
          <button class="nav-item" [class.on]="tab() === 'audio'" (click)="tab.set('audio')"><i class="pi pi-volume-up"></i> Audio</button>
          <button class="nav-item" [class.on]="tab() === 'apariencia'" (click)="tab.set('apariencia')"><i class="pi pi-eye"></i> Apariencia</button>
        </aside>

        <!-- Contenido -->
        <div class="content">
          <h1>Configuración</h1>
          <p class="muted">Configura tu perfil y tus preferencias</p>

          @if (tab() === 'perfil') {
            <h3>Información de perfil</h3>
            <p class="muted">Actualiza tu información personal y de contacto</p>
            <div class="form-grid">
              <div class="fld"><label>Nombre</label><input pInputText [(ngModel)]="name" /></div>
              <div class="fld"><label>Correo electrónico</label><input pInputText [(ngModel)]="email" type="email" /></div>
            </div>
            <div class="fld"><label>Teléfono</label><input pInputText [(ngModel)]="phone" placeholder="Ej: +51 987654321" /><small class="hint">Incluye el código de país (Ej: +51 para Perú)</small></div>
            <p-button label="Guardar" icon="pi pi-check" severity="success" [loading]="busy()" (onClick)="saveProfile()" />
          }

          @if (tab() === 'password') {
            <h3>Cambiar contraseña</h3>
            <p class="muted">Actualiza tu contraseña de acceso</p>
            <div class="fld"><label>Contraseña actual</label><input pInputText type="password" [(ngModel)]="curPass" /></div>
            <div class="form-grid">
              <div class="fld"><label>Nueva contraseña</label><input pInputText type="password" [(ngModel)]="newPass" /><small class="hint">Mínimo 6 caracteres</small></div>
              <div class="fld"><label>Confirmar nueva contraseña</label><input pInputText type="password" [(ngModel)]="newPass2" /></div>
            </div>
            <p-button label="Cambiar contraseña" icon="pi pi-key" severity="success" [loading]="busy()" (onClick)="savePassword()" />
          }

          @if (tab() === 'audio') {
            <h3>Configuración de audio</h3>
            <p class="muted">Sonidos de notificación del sistema</p>
            <label class="switch"><input type="checkbox" [(ngModel)]="audioEnabled" (change)="saveAudio()" /> <span>Activar sonidos de notificación</span></label>
            <div class="fld" [class.dim]="!audioEnabled">
              <label>Volumen ({{ audioVolume }}%)</label>
              <input type="range" min="0" max="100" step="5" [(ngModel)]="audioVolume" (change)="saveAudio()" [disabled]="!audioEnabled" />
            </div>
            <p-button label="Probar sonido" icon="pi pi-play" [outlined]="true" [disabled]="!audioEnabled" (onClick)="testSound()" />
          }

          @if (tab() === 'apariencia') {
            <h3>Configuración de apariencia</h3>
            <p class="muted">Actualiza la configuración de apariencia de tu cuenta</p>
            <div class="seg">
              <button [class.on]="theme.mode() === 'claro'" (click)="theme.setMode('claro')"><i class="pi pi-sun"></i> Claro</button>
              <button [class.on]="theme.mode() === 'oscuro'" (click)="theme.setMode('oscuro')"><i class="pi pi-moon"></i> Oscuro</button>
              <button [class.on]="theme.mode() === 'sistema'" (click)="theme.setMode('sistema')"><i class="pi pi-desktop"></i> Sistema</button>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .ps { padding: 1.5rem; }
      .grid { display: grid; grid-template-columns: 260px 1fr; gap: 1.5rem; max-width: 1000px; margin: 0 auto; }
      .nav { background: var(--p-content-background, #0e1622); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 14px; padding: 1rem; height: fit-content; }
      .nav-head { display: flex; gap: 0.6rem; align-items: flex-start; margin-bottom: 1rem; }
      .nav-head .ico { width: 38px; height: 38px; border-radius: 10px; background: rgba(59,130,246,0.15); color: #60a5fa; display: grid; place-items: center; flex: 0 0 auto; }
      .nav-head strong { display: block; } .nav-head small { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.78rem; }
      .nav-item { width: 100%; text-align: left; background: transparent; border: 0; border-radius: 10px; padding: 0.7rem 0.8rem; cursor: pointer; color: var(--p-text-color, #e6eef7); display: flex; align-items: center; gap: 0.6rem; font-size: 0.92rem; }
      .nav-item:hover { background: var(--p-content-hover-background, rgba(255,255,255,0.04)); }
      .nav-item.on { background: rgba(16,185,129,0.14); color: #10b981; font-weight: 700; box-shadow: inset 3px 0 0 #10b981; }
      .content { background: var(--p-content-background, #0e1622); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 14px; padding: 1.5rem 1.8rem; }
      .content h1 { margin: 0; font-size: 1.5rem; } .content h3 { margin: 1.4rem 0 0.2rem; }
      .muted { color: var(--p-text-muted-color, #8aa0bd); margin: 0.2rem 0 1rem; font-size: 0.9rem; }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .fld { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; } .fld.dim { opacity: 0.5; }
      .fld label { font-size: 0.85rem; font-weight: 600; }
      .fld input[pInputText], .fld input[type=range] { width: 100%; }
      .hint { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.78rem; }
      .switch { display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; margin-bottom: 1rem; }
      .seg { display: inline-flex; background: var(--p-content-hover-background, rgba(255,255,255,0.04)); border: 1px solid var(--p-content-border-color, #1c2c44); border-radius: 12px; padding: 4px; gap: 4px; }
      .seg button { background: transparent; border: 0; color: var(--p-text-color, #e6eef7); padding: 0.6rem 1.1rem; border-radius: 9px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; }
      .seg button.on { background: var(--p-content-background, #fff); box-shadow: 0 1px 4px rgba(0,0,0,0.15); font-weight: 700; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .form-grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class ProfileSettingsComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  readonly theme = inject(ThemeService);

  readonly tab = signal<Tab>('perfil');
  readonly busy = signal(false);

  private readonly u = computed(() => this.auth.user());
  name = this.u()?.name ?? this.u()?.email?.split('@')[0] ?? '';
  email = this.u()?.email ?? '';
  phone = this.u()?.phone ?? '';
  curPass = '';
  newPass = '';
  newPass2 = '';

  audioEnabled = this.readAudio().enabled;
  audioVolume = this.readAudio().volume;

  private readAudio(): { enabled: boolean; volume: number } {
    try { return { enabled: true, volume: 70, ...JSON.parse(localStorage.getItem(AUDIO_KEY) || '{}') }; }
    catch { return { enabled: true, volume: 70 }; }
  }
  saveAudio(): void {
    localStorage.setItem(AUDIO_KEY, JSON.stringify({ enabled: this.audioEnabled, volume: this.audioVolume }));
    this.toast.add({ severity: 'success', summary: 'Audio', detail: 'Preferencias guardadas.' });
  }
  testSound(): void {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = 880; gain.gain.value = (this.audioVolume / 100) * 0.2;
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.25);
    } catch { /* ignora si el navegador bloquea audio */ }
  }

  saveProfile(): void {
    if (!this.name.trim() || !this.email.trim()) { this.toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Nombre y correo son obligatorios.' }); return; }
    this.busy.set(true);
    this.auth.updateProfile({ name: this.name.trim(), email: this.email.trim(), phone: this.phone.trim() }).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Perfil actualizado', detail: 'Tus datos se guardaron.' }); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  savePassword(): void {
    if (this.newPass.length < 6) { this.toast.add({ severity: 'warn', summary: 'Contraseña corta', detail: 'Mínimo 6 caracteres.' }); return; }
    if (this.newPass !== this.newPass2) { this.toast.add({ severity: 'warn', summary: 'No coincide', detail: 'La confirmación no coincide.' }); return; }
    this.busy.set(true);
    this.auth.changePassword({ currentPassword: this.curPass, newPassword: this.newPass }).subscribe({
      next: () => { this.busy.set(false); this.curPass = this.newPass = this.newPass2 = ''; this.toast.add({ severity: 'success', summary: 'Contraseña cambiada', detail: 'Usa la nueva contraseña la próxima vez.' }); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cambiar.' }); },
    });
  }
}
