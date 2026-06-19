import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, PasswordModule, SelectModule],
  template: `
    <div class="login-bg">
      <!-- destellos decorativos -->
      <span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
      <span class="dot d4"></span><span class="dot d5"></span><span class="dot d6"></span>

      <div class="login-card">
        <div class="brand">
          <div class="logo"><i class="pi pi-bookmark-fill"></i></div>
          <h1>HotelSuite</h1>
          <p class="subtitle">Acceso Staff</p>
        </div>

        @if (step() === 'credentials') {
          <!-- Huella digital (pendiente) -->
          <button type="button" class="fingerprint" (click)="fingerprintPending()">
            <i class="pi pi-cloud"></i> Usar huella digital
          </button>

          <form (ngSubmit)="submit()">
            <label for="email"><i class="pi pi-envelope"></i> Correo electrónico</label>
            <input
              pInputText
              id="email"
              name="email"
              type="email"
              placeholder="tucorreo@hotel.com"
              [(ngModel)]="email"
              autocomplete="username"
              required
            />

            <div class="label-row">
              <label for="password"><i class="pi pi-lock"></i> Contraseña</label>
              <a class="forgot" (click)="forgotPending()">¿Olvidó su contraseña?</a>
            </div>
            <p-password
              inputId="password"
              name="password"
              [(ngModel)]="password"
              [feedback]="false"
              [toggleMask]="true"
              placeholder="••••••••"
              styleClass="w-full"
              [inputStyle]="{ width: '100%' }"
              autocomplete="current-password"
            />

            @if (error()) {
              <div class="error"><i class="pi pi-exclamation-circle"></i> {{ error() }}</div>
            }

            <p-button type="submit" label="Iniciar sesión" [loading]="loading()" styleClass="submit" />
          </form>
        } @else {
          <h2 class="branch-title">Selecciona la sucursal</h2>
          <p class="muted">Tienes acceso a varias sucursales. Elige con cuál operar.</p>
          <label for="branch">Sucursal</label>
          <p-select
            inputId="branch"
            [options]="auth.branches()"
            optionLabel="name"
            optionValue="id"
            [(ngModel)]="selectedBranchId"
            placeholder="Seleccionar"
            styleClass="w-full"
          />
          <p-button
            label="Continuar"
            icon="pi pi-arrow-right"
            iconPos="right"
            [disabled]="!selectedBranchId"
            (onClick)="confirmBranch()"
            styleClass="submit"
          />
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .login-bg {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        position: relative;
        overflow: hidden;
        background:
          radial-gradient(900px circle at 75% 18%, rgba(236, 72, 153, 0.22), transparent 45%),
          radial-gradient(700px circle at 20% 90%, rgba(190, 24, 93, 0.18), transparent 45%),
          linear-gradient(160deg, #1c0f1a 0%, #120a14 55%, #0c0710 100%);
      }
      /* destellos */
      .dot { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #ec4899; opacity: 0.5; box-shadow: 0 0 8px #ec4899; }
      .d1 { top: 12%; left: 18%; } .d2 { top: 24%; right: 14%; width: 3px; height: 3px; }
      .d3 { bottom: 18%; left: 24%; } .d4 { bottom: 30%; right: 20%; width: 5px; height: 5px; opacity: 0.35; }
      .d5 { top: 60%; left: 10%; width: 3px; height: 3px; } .d6 { top: 40%; right: 30%; opacity: 0.3; }

      .login-card {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 440px;
        padding: 2rem 1.5rem;
        text-align: center;
      }

      .brand { margin-bottom: 1.75rem; }
      .logo {
        width: 56px; height: 56px; margin: 0 auto 0.85rem;
        border-radius: 14px;
        background: linear-gradient(135deg, #f43f8e, #be185d);
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 1.5rem;
        box-shadow: 0 8px 24px rgba(236, 72, 153, 0.45);
      }
      .brand h1 { margin: 0; font-size: 1.9rem; font-weight: 700; color: #ec4899; letter-spacing: 0.01em; }
      .subtitle { margin: 0.25rem 0 0; font-size: 1.05rem; font-weight: 700; color: #f5f5f7; }

      /* Botón huella (pendiente) */
      .fingerprint {
        display: inline-flex; align-items: center; gap: 0.5rem;
        background: transparent; color: #f472b6;
        border: 1px solid #9d3b66; border-radius: 999px;
        padding: 0.6rem 1.4rem; font-size: 0.92rem; cursor: pointer;
        margin: 0 auto 1.75rem;
        transition: all 0.15s;
      }
      .fingerprint:hover { background: rgba(236, 72, 153, 0.12); border-color: #ec4899; }

      form { text-align: left; }
      label {
        display: inline-flex; align-items: center; gap: 0.45rem;
        margin: 0 0 0.5rem; font-size: 0.9rem; font-weight: 600; color: #f06ba8;
      }
      label i { font-size: 0.85rem; }
      .label-row { display: flex; align-items: center; justify-content: space-between; margin-top: 1.1rem; }
      .label-row label { margin-bottom: 0.5rem; }
      .forgot { color: #ec4899; font-size: 0.82rem; cursor: pointer; }
      .forgot:hover { text-decoration: underline; }

      /* Inputs blancos redondeados */
      input[pInputText] {
        width: 100%;
        background: #fbeef4;
        border: 0;
        border-radius: 10px;
        padding: 0.9rem 1rem;
        color: #1f2937;
        font-size: 0.98rem;
      }
      input[pInputText]::placeholder { color: #b08; opacity: 0.4; }
      :host ::ng-deep .p-password { display: block; width: 100%; }
      :host ::ng-deep .p-password input {
        width: 100%; background: #fbeef4; border: 0; border-radius: 10px;
        padding: 0.9rem 2.6rem 0.9rem 1rem; color: #1f2937; font-size: 0.98rem;
      }
      :host ::ng-deep .p-password .p-icon,
      :host ::ng-deep .p-password .p-password-toggle-mask-icon { color: #be185d; right: 1rem; }

      .error {
        margin-top: 1rem; padding: 0.65rem 0.85rem; border-radius: 8px;
        background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4);
        color: #fca5a5; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;
      }

      :host ::ng-deep .submit { display: block; margin-top: 1.75rem; }
      :host ::ng-deep .submit .p-button {
        width: 100%; justify-content: center;
        background: linear-gradient(135deg, #f43f8e, #d6246e);
        border: 0; border-radius: 12px; padding: 0.95rem; font-size: 1.02rem; font-weight: 600;
        box-shadow: 0 10px 24px rgba(236, 72, 153, 0.4);
      }
      :host ::ng-deep .submit .p-button:enabled:hover { background: linear-gradient(135deg, #ec2d80, #be185d); }

      .branch-title { color: #f5f5f7; margin: 0 0 0.35rem; font-size: 1.3rem; }
      .muted { color: #b9a3b0; margin: 0 0 1.25rem; font-size: 0.9rem; }
      :host ::ng-deep .w-full { width: 100%; }
    `,
  ],
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  email = '';
  password = '';
  selectedBranchId: string | null = null;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly step = signal<'credentials' | 'branch'>('credentials');

  fingerprintPending(): void {
    this.toast.add({
      severity: 'info',
      summary: 'Huella digital',
      detail: 'El acceso por huella digital estará disponible próximamente.',
    });
  }

  forgotPending(): void {
    this.toast.add({
      severity: 'info',
      summary: 'Recuperar contraseña',
      detail: 'Contacta al administrador para restablecer tu contraseña.',
    });
  }

  submit(): void {
    if (!this.email || !this.password) {
      this.error.set('Ingresa correo y contraseña.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    this.auth
      .login({ email: this.email, password: this.password })
      .pipe(switchMap(() => this.auth.loadBranches()))
      .subscribe({
        next: () => {
          this.loading.set(false);
          const branches = this.auth.branches();
          if (branches.length > 1) {
            this.selectedBranchId = this.auth.activeBranchId();
            this.step.set('branch');
          } else {
            this.router.navigateByUrl('/dashboard');
          }
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(err.error?.error?.message ?? 'No se pudo iniciar sesión.');
        },
      });
  }

  confirmBranch(): void {
    if (!this.selectedBranchId) return;
    this.auth.setActiveBranch(this.selectedBranchId);
    this.router.navigateByUrl('/dashboard');
  }
}
