import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { CrudApi } from '../../../core/http/crud-api';
import { AuthService } from '../../../core/auth/auth.service';
import type { Branch } from '../../../core/auth/auth.models';

interface Form {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  landline: string;
  mobile: string;
  whatsapp: string;
  whatsappSameAsMobile: boolean;
  email: string;
  website: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  mapsUrl: string;
  logoUrl: string;
  currency: string;
}

@Component({
  selector: 'app-hotel',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, RouterLink],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Hotel</h1>
          <p class="muted">Identidad y contacto de la sucursal activa: {{ auth.activeBranch()?.name }}. Es la fuente única que consumen los demás módulos (Tickets, comprobantes, WhatsApp…).</p>
        </div>
      </header>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else {
        <div class="cat-form panel">
          <!-- Identidad -->
          <h3 class="sec"><i class="pi pi-id-card"></i> Identidad</h3>
          <div class="row">
            <div class="col"><label>Nombre comercial</label><input pInputText [(ngModel)]="form.name" [disabled]="!canEdit" /></div>
            <div class="col"><label>Razón social</label><input pInputText [(ngModel)]="form.legalName" [disabled]="!canEdit" /></div>
          </div>
          <div class="row">
            <div class="col"><label>RUC / Identificación fiscal</label><input pInputText [(ngModel)]="form.taxId" [disabled]="!canEdit" /></div>
            <div class="col"><label>Moneda (ISO)</label><input pInputText maxlength="3" style="text-transform:uppercase" [(ngModel)]="form.currency" [disabled]="!canEdit" /></div>
          </div>

          <!-- Logo -->
          <h3 class="sec"><i class="pi pi-image"></i> Logo</h3>
          <div class="logo-block">
            <div class="logo-prev">
              @if (form.logoUrl) { <img [src]="form.logoUrl" alt="Logo" /> }
              @else { <div class="logo-empty"><i class="pi pi-image"></i><span>Sin logo</span></div> }
            </div>
            @if (canEdit) {
              <div class="logo-actions">
                <input #logoInput type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="onLogo($event)" />
                <p-button label="Subir logo" icon="pi pi-upload" severity="secondary" (onClick)="logoInput.click()" />
                @if (form.logoUrl) { <p-button label="Quitar" icon="pi pi-times" severity="danger" [text]="true" (onClick)="form.logoUrl = ''" /> }
                <p class="hint">PNG/JPG/WebP. Se reduce automáticamente a ~256px y se guarda en el sistema.</p>
              </div>
            }
          </div>

          <!-- Contacto -->
          <h3 class="sec"><i class="pi pi-phone"></i> Contacto</h3>
          <div class="row">
            <div class="col"><label>Teléfono fijo</label><input pInputText [(ngModel)]="form.landline" [disabled]="!canEdit" /></div>
            <div class="col"><label>Celular</label><input pInputText [(ngModel)]="form.mobile" (ngModelChange)="onMobileChange()" [disabled]="!canEdit" /></div>
          </div>
          <div class="row">
            <div class="col">
              <label>WhatsApp</label>
              <input pInputText [(ngModel)]="form.whatsapp" [disabled]="!canEdit || form.whatsappSameAsMobile" />
              <label class="chk"><input type="checkbox" [(ngModel)]="form.whatsappSameAsMobile" (ngModelChange)="onSameWhats()" [disabled]="!canEdit" /> WhatsApp usa el mismo número del celular</label>
            </div>
            <div class="col"><label>Email</label><input pInputText type="email" [(ngModel)]="form.email" [disabled]="!canEdit" /></div>
          </div>
          <div class="row">
            <div class="col"><label>Sitio web</label><input pInputText placeholder="https://…" [(ngModel)]="form.website" [disabled]="!canEdit" /></div>
            <div class="col"></div>
          </div>

          <!-- Redes y ubicación -->
          <h3 class="sec"><i class="pi pi-map-marker"></i> Redes y ubicación</h3>
          <div class="row">
            <div class="col"><label>Facebook</label><input pInputText placeholder="URL o usuario" [(ngModel)]="form.facebook" [disabled]="!canEdit" /></div>
            <div class="col"><label>Instagram</label><input pInputText placeholder="URL o usuario" [(ngModel)]="form.instagram" [disabled]="!canEdit" /></div>
          </div>
          <div class="row">
            <div class="col"><label>TikTok</label><input pInputText placeholder="URL o usuario" [(ngModel)]="form.tiktok" [disabled]="!canEdit" /></div>
            <div class="col"><label>Enlace de Google Maps</label><input pInputText placeholder="https://maps.google.com/…" [(ngModel)]="form.mapsUrl" [disabled]="!canEdit" /></div>
          </div>
          <label>Dirección</label>
          <input pInputText [(ngModel)]="form.address" [disabled]="!canEdit" />

          <p class="hint-op"><i class="pi pi-info-circle"></i> Los parámetros de funcionamiento (hora de corte, caja ciega, comisiones, permisos, etc.) se configuran en <a routerLink="/settings/configuracion-operativa">Configuración Operativa</a>. Qué datos se muestran en cada ticket se decide en <b>Configuración → Tickets → Visualización</b>.</p>

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
      .panel { max-width: 820px; background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; padding: 1.5rem; }
      .sec { display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; margin: 1.4rem 0 0.6rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--p-content-border-color, #2b2b30); color: var(--p-primary-color, #3b82f6); }
      .sec:first-child { margin-top: 0; }
      .chk { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; font-size: 0.82rem; color: var(--p-text-muted-color, #94a3b8); font-weight: 500; cursor: pointer; }
      .chk input { width: auto; }
      .logo-block { display: flex; gap: 1.2rem; align-items: center; flex-wrap: wrap; }
      .logo-prev { width: 128px; height: 128px; border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; background: #0f172a; display: flex; align-items: center; justify-content: center; overflow: hidden; flex: 0 0 auto; }
      .logo-prev img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .logo-empty { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; color: #64748b; font-size: 0.78rem; } .logo-empty i { font-size: 1.6rem; }
      .logo-actions { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
      .logo-actions .hint, .hint { font-size: 0.78rem; color: var(--p-text-muted-color, #64748b); margin: 0; }
      .actions-row { margin-top: 1.5rem; }
      .hint-op { margin-top: 1rem; font-size: 0.85rem; color: var(--p-text-muted-color, #64748b); }
      .hint-op a { color: var(--p-primary-color, #3b82f6); font-weight: 600; }
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
    name: '', legalName: '', taxId: '', address: '',
    landline: '', mobile: '', whatsapp: '', whatsappSameAsMobile: false,
    email: '', website: '', facebook: '', instagram: '', tiktok: '', mapsUrl: '',
    logoUrl: '', currency: 'PEN',
  };

  ngOnInit(): void {
    const id = this.auth.activeBranchId();
    if (!id) { this.loading.set(false); return; }
    this.api.get(id).subscribe({
      next: (res) => {
        const b = res.data as Branch;
        this.form = {
          name: b.name ?? '',
          legalName: b.legalName ?? '',
          taxId: b.taxId ?? '',
          address: b.address ?? '',
          // Fallback al teléfono legado si aún no se separó.
          landline: b.landline ?? b.phone ?? '',
          mobile: b.mobile ?? '',
          whatsapp: b.whatsapp ?? '',
          whatsappSameAsMobile: b.whatsappSameAsMobile ?? false,
          email: b.email ?? '',
          website: b.website ?? '',
          facebook: b.facebook ?? '',
          instagram: b.instagram ?? '',
          tiktok: b.tiktok ?? '',
          mapsUrl: b.mapsUrl ?? '',
          logoUrl: b.logoUrl ?? '',
          currency: b.currency ?? 'PEN',
        };
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** WhatsApp = celular: copia y sincroniza. */
  onSameWhats(): void { if (this.form.whatsappSameAsMobile) this.form.whatsapp = this.form.mobile; }
  onMobileChange(): void { if (this.form.whatsappSameAsMobile) this.form.whatsapp = this.form.mobile; }

  /** Sube el logo, lo reduce a ~256px en el cliente y lo guarda como data URL. */
  onLogo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { this.messages.add({ severity: 'warn', summary: 'Formato', detail: 'Usa una imagen PNG, JPG o WebP.' }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { this.form.logoUrl = String(reader.result); return; }
        ctx.drawImage(img, 0, 0, w, h);
        // PNG conserva transparencia (logos suelen tenerla).
        this.form.logoUrl = canvas.toDataURL('image/png');
      };
      img.onerror = () => this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo leer la imagen.' });
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  save(): void {
    const id = this.auth.activeBranchId();
    if (!id) return;
    if (this.form.whatsappSameAsMobile) this.form.whatsapp = this.form.mobile;
    this.saving.set(true);
    // phone (legado) se mantiene sincronizado con el fijo para compatibilidad.
    const payload = { ...this.form, currency: (this.form.currency || 'PEN').toUpperCase(), phone: this.form.landline };
    this.api.update(id, payload).subscribe({
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
