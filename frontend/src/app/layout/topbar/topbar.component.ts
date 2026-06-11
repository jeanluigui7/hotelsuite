import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [FormsModule, ButtonModule, SelectModule, TooltipModule],
  template: `
    <header class="topbar">
      <div class="left">
        @if (auth.branches().length > 0) {
          <p-select
            [options]="auth.branches()"
            optionLabel="name"
            optionValue="id"
            [ngModel]="auth.activeBranchId()"
            (ngModelChange)="onBranchChange($event)"
            [disabled]="auth.branches().length < 2"
            placeholder="Sucursal"
            styleClass="branch-select"
          />
        }
      </div>
      <div class="right">
        <i class="pi pi-bell"></i>
        <span class="user">
          <i class="pi pi-user"></i>
          <span class="meta">
            <strong>{{ auth.user()?.email }}</strong>
            <small>{{ auth.user()?.roleName }}</small>
          </span>
        </span>
        <p-button
          icon="pi pi-sign-out"
          severity="secondary"
          [text]="true"
          (onClick)="logout()"
          pTooltip="Cerrar sesión"
        />
      </div>
    </header>
  `,
  styles: [
    `
      .topbar {
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 1.25rem;
        background: var(--p-content-background, #1f1f23);
        border-bottom: 1px solid var(--p-content-border-color, #2b2b30);
      }
      .right {
        display: flex;
        align-items: center;
        gap: 1.1rem;
      }
      .right .pi-bell {
        cursor: pointer;
      }
      .user {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
      }
      .user .meta {
        display: flex;
        flex-direction: column;
        line-height: 1.1;
      }
      .user .meta small {
        color: var(--p-text-muted-color, #a1a1aa);
        font-size: 0.72rem;
      }
    `,
  ],
})
export class TopbarComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  onBranchChange(branchId: string): void {
    if (!branchId || branchId === this.auth.activeBranchId()) return;
    this.auth.setActiveBranch(branchId);
    // Reinstancia la vista actual (sin recargar la página ni desmontar el layout)
    // pasando por una ruta vacía y volviendo: así su ngOnInit vuelve a pedir los
    // datos con la nueva sucursal (el interceptor adjunta el branchId activo).
    const url = this.router.url;
    this.router.navigateByUrl('/_reload', { skipLocationChange: true }).then(() => {
      void this.router.navigateByUrl(url);
    });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
