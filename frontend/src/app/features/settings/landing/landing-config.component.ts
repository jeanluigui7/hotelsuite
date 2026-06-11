import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextarea } from 'primeng/inputtextarea';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LandingApiService } from '../services/landing-api.service';

@Component({
  selector: 'app-landing-config',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextarea, TooltipModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Landing Page</h1>
          <p class="muted">Texto de bienvenida y enlaces públicos de la sucursal.</p>
        </div>
      </header>

      <div class="panel">
        <h3>URLs públicas</h3>
        <div class="url">
          <span>{{ landingUrl() }}</span>
          <p-button icon="pi pi-copy" [text]="true" (onClick)="copy(landingUrl())" pTooltip="Copiar" />
          <a [href]="landingUrl()" target="_blank"><p-button icon="pi pi-external-link" [text]="true" /></a>
        </div>
        <div class="url">
          <span>{{ roomsUrl() }}</span>
          <p-button icon="pi pi-copy" [text]="true" (onClick)="copy(roomsUrl())" pTooltip="Copiar" />
          <a [href]="roomsUrl()" target="_blank"><p-button icon="pi pi-external-link" [text]="true" /></a>
        </div>

        <h3 class="mt">Texto de bienvenida</h3>
        <textarea pInputTextarea [(ngModel)]="welcome" rows="4" [disabled]="!canEdit"></textarea>
        @if (canEdit) {
          <div class="actions"><p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" /></div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .panel { max-width: 720px; background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; padding: 1.5rem; }
      h3 { margin: 0 0 0.6rem; font-size: 1rem; }
      .mt { margin-top: 1.5rem; }
      .url { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; font-size: 0.85rem; }
      .url span { font-family: monospace; color: var(--p-text-muted-color, #a1a1aa); }
      textarea { width: 100%; }
      .actions { margin-top: 1rem; }
    `,
  ],
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class LandingConfigComponent implements OnInit {
  private readonly api = inject(LandingApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly saving = signal(false);
  welcome = '';

  readonly canEdit = this.auth.can('settings', 'edit');

  private origin = window.location.origin;
  landingUrl(): string {
    return `${this.origin}/landing/${this.auth.activeBranchId() ?? ''}`;
  }
  roomsUrl(): string {
    return `${this.landingUrl()}/habitaciones`;
  }

  ngOnInit(): void {
    this.api.get().subscribe((res) => (this.welcome = res.data.welcome));
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text);
    this.messages.add({ severity: 'info', summary: 'Copiado', detail: 'Enlace copiado.' });
  }

  save(): void {
    this.saving.set(true);
    this.api.update(this.welcome).subscribe({
      next: () => { this.saving.set(false); this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Landing actualizado.' }); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
}
