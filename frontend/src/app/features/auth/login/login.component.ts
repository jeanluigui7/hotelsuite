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
    <div class="login-page">
      <!-- Panel de marca (hero) -->
      <aside class="hero">
        <div class="hero-content">
          <div class="brand">
            <i class="pi pi-bookmark-fill"></i>
            <span>HotelSuite</span>
          </div>
          <h1>Gestión hotelera, simple y bajo control.</h1>
          <p class="tagline">Recepción, ventas, inventario y reportes — todo en un solo lugar, multi-sucursal.</p>
          <ul class="features">
            <li><i class="pi pi-building"></i> Recepción y habitaciones en tiempo real</li>
            <li><i class="pi pi-wallet"></i> Caja, ventas y comprobantes</li>
            <li><i class="pi pi-chart-bar"></i> Inventario, logística y reportes</li>
          </ul>
        </div>
        <div class="hero-foot">© {{ year }} HotelSuite</div>
      </aside>

      <!-- Panel del formulario -->
      <main class="panel">
        <div class="login-card">
          <div class="brand brand-mobile">
            <i class="pi pi-bookmark-fill"></i>
            <span>HotelSuite</span>
          </div>

          @if (step() === 'credentials') {
            <h2>Bienvenido de nuevo</h2>
            <p class="muted">Ingresa tus credenciales para continuar.</p>

            <form (ngSubmit)="submit()">
              <label for="email">Correo</label>
              <span class="field-icon">
                <i class="pi pi-envelope"></i>
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
              </span>

              <label for="password">Contraseña</label>
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

              <p-button
                type="submit"
                label="Entrar"
                icon="pi pi-sign-in"
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
              icon="pi pi-arrow-right"
              iconPos="right"
              [disabled]="!selectedBranchId"
              (onClick)="confirmBranch()"
              styleClass="w-full submit"
            />
          }
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      .login-page {
        min-height: 100vh;
        display: flex;
        background: #f1f5f9;
      }

      /* ── Hero (panel izquierdo) ── */
      .hero {
        position: relative;
        flex: 1 1 46%;
        max-width: 560px;
        background: linear-gradient(150deg, #0f766e 0%, #10b981 55%, #34d399 100%);
        color: #fff;
        padding: 3rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
      }
      .hero::after {
        content: '';
        position: absolute;
        right: -120px;
        bottom: -120px;
        width: 380px;
        height: 380px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
      }
      .hero-content {
        position: relative;
        z-index: 1;
        max-width: 420px;
        margin-top: 2rem;
      }
      .hero h1 {
        font-size: 2.1rem;
        line-height: 1.2;
        margin: 2rem 0 1rem;
        font-weight: 700;
      }
      .hero .tagline {
        font-size: 1.05rem;
        opacity: 0.9;
        margin: 0 0 2rem;
      }
      .features {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }
      .features li {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.98rem;
      }
      .features i {
        background: rgba(255, 255, 255, 0.18);
        width: 2.1rem;
        height: 2.1rem;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .hero-foot {
        position: relative;
        z-index: 1;
        font-size: 0.8rem;
        opacity: 0.8;
      }

      /* ── Panel del formulario (derecha) ── */
      .panel {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
      }
      .login-card {
        width: 100%;
        max-width: 400px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(2, 6, 23, 0.06);
        padding: 2.5rem;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-size: 1.4rem;
        font-weight: 700;
      }
      .hero .brand {
        color: #fff;
      }
      .brand-mobile {
        display: none;
        color: var(--p-primary-color, #10b981);
        margin-bottom: 1.5rem;
      }
      h2 {
        margin: 0 0 0.35rem;
        font-size: 1.5rem;
        color: #0f172a;
      }
      .muted {
        margin: 0 0 1.75rem;
        color: #64748b;
        font-size: 0.92rem;
      }
      label {
        display: block;
        margin: 1rem 0 0.4rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: #334155;
      }
      input[pInputText] {
        width: 100%;
      }
      /* input con icono a la izquierda */
      .field-icon {
        position: relative;
        display: block;
      }
      .field-icon i {
        position: absolute;
        left: 0.85rem;
        top: 50%;
        transform: translateY(-50%);
        color: #94a3b8;
        font-size: 0.9rem;
      }
      .field-icon input[pInputText] {
        padding-left: 2.4rem;
      }
      .error {
        margin-top: 1rem;
        padding: 0.65rem 0.85rem;
        border-radius: 8px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .submit {
        margin-top: 1.75rem;
      }
      :host ::ng-deep .w-full {
        width: 100%;
      }
      :host ::ng-deep .submit .p-button {
        width: 100%;
        justify-content: center;
      }

      @media (max-width: 880px) {
        .hero {
          display: none;
        }
        .brand-mobile {
          display: flex;
        }
      }
    `,
  ],
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly year = new Date().getFullYear();
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
