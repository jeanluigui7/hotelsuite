import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, PasswordModule, SelectModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand">
          <i class="pi pi-bookmark-fill"></i>
          <span>HotelSuite</span>
        </div>

        @if (step() === 'credentials') {
          <h2>Iniciar sesión</h2>
          <p class="muted">Ingresa tus credenciales para continuar.</p>

          <form (ngSubmit)="submit()">
            <label for="email">Correo</label>
            <input
              pInputText
              id="email"
              name="email"
              type="email"
              [(ngModel)]="email"
              autocomplete="username"
              required
            />

            <label for="password">Contraseña</label>
            <p-password
              inputId="password"
              name="password"
              [(ngModel)]="password"
              [feedback]="false"
              [toggleMask]="true"
              styleClass="w-full"
              [inputStyle]="{ width: '100%' }"
              autocomplete="current-password"
            />

            @if (error()) {
              <div class="error">{{ error() }}</div>
            }

            <p-button
              type="submit"
              label="Entrar"
              [loading]="loading()"
              styleClass="w-full submit"
            />
          </form>
        } @else {
          <h2>Selecciona la sucursal</h2>
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
            [disabled]="!selectedBranchId"
            (onClick)="confirmBranch()"
            styleClass="w-full submit"
          />
        }
      </div>
    </div>
  `,
  styles: [
    `
      .login-wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
      }
      .login-card {
        width: 100%;
        max-width: 380px;
        background: var(--p-content-background, #1f1f23);
        border: 1px solid var(--p-content-border-color, #2b2b30);
        border-radius: 14px;
        padding: 2rem;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-size: 1.3rem;
        font-weight: 700;
        color: var(--p-primary-color, #34d399);
        margin-bottom: 1.5rem;
      }
      h2 {
        margin: 0 0 0.25rem;
        font-size: 1.25rem;
      }
      .muted {
        margin: 0 0 1.5rem;
        color: var(--p-text-muted-color, #a1a1aa);
        font-size: 0.9rem;
      }
      label {
        display: block;
        margin: 0.85rem 0 0.35rem;
        font-size: 0.85rem;
        color: var(--p-text-muted-color, #a1a1aa);
      }
      input[pInputText] {
        width: 100%;
      }
      .error {
        margin-top: 1rem;
        padding: 0.6rem 0.8rem;
        border-radius: 8px;
        background: rgba(239, 68, 68, 0.12);
        color: #f87171;
        font-size: 0.85rem;
      }
      .submit {
        margin-top: 1.5rem;
      }
      :host ::ng-deep .w-full {
        width: 100%;
      }
    `,
  ],
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  selectedBranchId: string | null = null;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly step = signal<'credentials' | 'branch'>('credentials');

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
