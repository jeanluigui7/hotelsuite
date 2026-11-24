import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../models/api-response.model';
import type {
  AuthSession,
  AuthUser,
  Branch,
  FingerprintPoll,
  FingerprintRequest,
  LoginMode,
  LoginRequest,
} from './auth.models';

const ACTIVE_BRANCH_KEY = 'hs_active_branch';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  private readonly session = signal<AuthSession | null>(null);
  private readonly _branches = signal<Branch[]>([]);
  private readonly _activeBranchId = signal<string | null>(
    localStorage.getItem(ACTIVE_BRANCH_KEY),
  );

  readonly user = computed<AuthUser | null>(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly branches = this._branches.asReadonly();
  readonly activeBranchId = this._activeBranchId.asReadonly();
  readonly activeBranch = computed(
    () => this._branches().find((b) => b.id === this._activeBranchId()) ?? null,
  );

  get accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  /** True if the current user can perform `action` on `module` (Super Admin bypasses). */
  can(module: string, action: string): boolean {
    const user = this.user();
    if (!user) return false;
    return user.isSuperAdmin || user.permissions.includes(`${module}:${action}`);
  }

  login(req: LoginRequest): Observable<ApiResponse<AuthSession>> {
    return this.http
      .post<ApiResponse<AuthSession>>(`${this.api}/auth/login`, req, { withCredentials: true })
      .pipe(tap((res) => this.applySession(res.data)));
  }

  /** Attempts to restore a session from the refresh cookie. */
  refresh(): Observable<ApiResponse<AuthSession>> {
    return this.http
      .post<ApiResponse<AuthSession>>(`${this.api}/auth/refresh`, {}, { withCredentials: true })
      .pipe(tap((res) => this.applySession(res.data)));
  }

  logout(): Observable<unknown> {
    return this.http
      .post(`${this.api}/auth/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.clearSession()));
  }

  /** True si el usuario actual debe finalizar turno / cerrar sesión con huella. */
  requiresFingerprint(): boolean {
    return !!this.user()?.requiresFingerprint;
  }

  // ── Ingreso/salida por huella ──
  /** (Pre-sesión) ¿Este correo ingresa con contraseña o con huella? */
  fpLoginMode(email: string): Observable<ApiResponse<LoginMode>> {
    return this.http.post<ApiResponse<LoginMode>>(`${this.api}/auth/fingerprint/login-mode`, { email }, { withCredentials: true });
  }
  /** (Pre-sesión) Abre una solicitud de login por huella. */
  fpLoginRequest(email: string): Observable<ApiResponse<FingerprintRequest>> {
    return this.http.post<ApiResponse<FingerprintRequest>>(`${this.api}/auth/fingerprint/login-request`, { email }, { withCredentials: true });
  }
  /** (Pre-sesión) Sondea el estado del login; al autenticar aplica la sesión. */
  fpLoginPoll(requestId: string): Observable<ApiResponse<FingerprintPoll>> {
    return this.http
      .get<ApiResponse<FingerprintPoll>>(`${this.api}/auth/fingerprint/login/${requestId}`, { withCredentials: true })
      .pipe(tap((res) => {
        if (res.data?.status === 'authenticated' && res.data.user && res.data.accessToken) {
          this.applySession({ user: res.data.user, accessToken: res.data.accessToken });
        }
      }));
  }
  /** Abre una solicitud de logout/fin de turno por huella (sesión activa). */
  fpLogoutRequest(): Observable<ApiResponse<FingerprintRequest>> {
    return this.http.post<ApiResponse<FingerprintRequest>>(`${this.api}/auth/fingerprint/logout-request`, {}, { withCredentials: true });
  }
  /** Sondea el estado del logout; al autenticar limpia la sesión. */
  fpLogoutPoll(requestId: string): Observable<ApiResponse<FingerprintPoll>> {
    return this.http
      .get<ApiResponse<FingerprintPoll>>(`${this.api}/auth/fingerprint/logout/${requestId}`, { withCredentials: true })
      .pipe(tap((res) => {
        if (res.data?.status === 'authenticated') this.clearSession();
      }));
  }
  /** Cancela una solicitud de huella en curso. */
  fpCancel(requestId: string): Observable<unknown> {
    return this.http.post(`${this.api}/auth/fingerprint/cancel/${requestId}`, {}, { withCredentials: true });
  }

  /** Actualiza el perfil propio (nombre, correo, teléfono) y refresca la sesión. */
  updateProfile(dto: { name: string; email: string; phone?: string }): Observable<ApiResponse<{ user: AuthUser }>> {
    return this.http
      .patch<ApiResponse<{ user: AuthUser }>>(`${this.api}/auth/profile`, dto)
      .pipe(tap((res) => {
        const current = this.session();
        if (current && res.data?.user) this.session.set({ ...current, user: res.data.user });
      }));
  }

  /** Cambia la contraseña del propio usuario. */
  changePassword(dto: { currentPassword: string; newPassword: string }): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.post<ApiResponse<{ success: boolean }>>(`${this.api}/auth/change-password`, dto);
  }

  loadBranches(): Observable<ApiResponse<Branch[]>> {
    return this.http
      .get<ApiResponse<Branch[]>>(`${this.api}/branches`, { params: { pageSize: 100 } })
      .pipe(
        tap((res) => {
          const branches = res.data ?? [];
          this._branches.set(branches);
          // Default the active branch if unset or no longer accessible.
          const current = this._activeBranchId();
          if (!current || !branches.some((b) => b.id === current)) {
            this.setActiveBranch(branches[0]?.id ?? null);
          }
        }),
      );
  }

  setActiveBranch(branchId: string | null): void {
    this._activeBranchId.set(branchId);
    if (branchId) {
      localStorage.setItem(ACTIVE_BRANCH_KEY, branchId);
    } else {
      localStorage.removeItem(ACTIVE_BRANCH_KEY);
    }
  }

  private applySession(session: AuthSession | null): void {
    this.session.set(session);
  }

  private clearSession(): void {
    this.session.set(null);
    this._branches.set([]);
    this.setActiveBranch(null);
  }
}
