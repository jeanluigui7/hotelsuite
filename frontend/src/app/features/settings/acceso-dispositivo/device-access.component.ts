import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';

type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'other';

interface DeviceTypeOpt { value: DeviceType; label: string }
interface RoleRow { id: string; name: string; isSuperAdmin: boolean; allowed: DeviceType[] }
interface DeviceAccessDto { deviceTypes: DeviceTypeOpt[]; roles: RoleRow[] }

interface EditRow { id: string; name: string; isSuperAdmin: boolean; sel: Record<string, boolean> }

@Component({
  selector: 'app-device-access',
  standalone: true,
  imports: [FormsModule, ButtonModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Acceso por Dispositivo</h1>
          <p class="muted">
            Controla desde qué tipos de dispositivo puede iniciar sesión cada perfil. Por defecto, todos los
            perfiles pueden ingresar desde todos los dispositivos. El <strong>Super Admin</strong> nunca se restringe.
          </p>
        </div>
        @if (canEdit) {
          <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
        }
      </header>

      @if (loading()) {
        <p class="muted"><i class="pi pi-spin pi-spinner"></i> Cargando…</p>
      } @else {
        <div class="table-wrap">
          <table class="da">
            <thead>
              <tr>
                <th class="role-col">Perfil</th>
                @for (d of deviceTypes(); track d.value) { <th>{{ d.label }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr [class.sa]="r.isSuperAdmin">
                  <td class="role-col">
                    <strong>{{ r.name }}</strong>
                    @if (r.isSuperAdmin) { <span class="badge">Siempre permitido</span> }
                    @else if (noneSelected(r)) { <span class="warn">Selecciona al menos uno</span> }
                  </td>
                  @for (d of deviceTypes(); track d.value) {
                    <td class="cell">
                      <input
                        type="checkbox"
                        [checked]="r.isSuperAdmin ? true : r.sel[d.value]"
                        [disabled]="r.isSuperAdmin || !canEdit"
                        (change)="toggle(r, d.value, $event)"
                      />
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="note">
          <i class="pi pi-info-circle"></i>
          Nota: un iPad con Safari puede reportarse como «Escritorio» (limitación del propio dispositivo).
          «Otro» cubre consolas, smart TV y dispositivos no reconocidos.
        </p>
      }
    </section>
  `,
  styles: [
    `
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
      h1 { margin: 0; font-size: 1.4rem; }
      .muted { color: var(--p-text-muted-color, #71717a); font-size: 0.9rem; margin: 0.25rem 0 0; max-width: 640px; }
      .table-wrap { overflow-x: auto; }
      table.da { border-collapse: collapse; width: 100%; min-width: 520px; }
      table.da th, table.da td { border: 1px solid var(--p-content-border-color, #e5e7eb); padding: 0.6rem 0.8rem; text-align: center; }
      table.da th { background: var(--p-content-hover-background, #f3f4f6); font-size: 0.85rem; }
      .role-col { text-align: left; }
      table.da td.cell input { width: 1.15rem; height: 1.15rem; cursor: pointer; }
      tr.sa { background: var(--p-content-hover-background, #f8fafc); }
      .badge { margin-left: 0.5rem; font-size: 0.7rem; font-weight: 700; color: #15803d; background: #dcfce7; border-radius: 999px; padding: 0.1rem 0.5rem; }
      .warn { margin-left: 0.5rem; font-size: 0.72rem; font-weight: 700; color: #b91c1c; }
      .note { color: var(--p-text-muted-color, #71717a); font-size: 0.82rem; margin-top: 1rem; }
    `,
  ],
})
export class DeviceAccessComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deviceTypes = signal<DeviceTypeOpt[]>([]);
  readonly rows = signal<EditRow[]>([]);

  readonly canEdit = this.auth.can('settings', 'edit');

  ngOnInit(): void {
    this.http.get<ApiResponse<DeviceAccessDto>>(`${this.api}/device-access`).subscribe({
      next: (res) => {
        const data = res.data;
        this.deviceTypes.set(data?.deviceTypes ?? []);
        this.rows.set(
          (data?.roles ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            isSuperAdmin: r.isSuperAdmin,
            sel: Object.fromEntries((data?.deviceTypes ?? []).map((d) => [d.value, r.allowed.includes(d.value)])),
          })),
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggle(row: EditRow, device: DeviceType, ev: Event): void {
    if (row.isSuperAdmin || !this.canEdit) return;
    row.sel[device] = (ev.target as HTMLInputElement).checked;
    this.rows.update((l) => [...l]); // refresca la señal
  }

  noneSelected(row: EditRow): boolean {
    return !row.isSuperAdmin && this.deviceTypes().every((d) => !row.sel[d.value]);
  }

  save(): void {
    const invalid = this.rows().find((r) => this.noneSelected(r));
    if (invalid) {
      this.messages.add({ severity: 'warn', summary: 'Falta configurar', detail: `El perfil "${invalid.name}" debe permitir al menos un dispositivo.` });
      return;
    }
    const byRole: Record<string, DeviceType[]> = {};
    for (const r of this.rows()) {
      if (r.isSuperAdmin) continue;
      byRole[r.id] = this.deviceTypes().filter((d) => r.sel[d.value]).map((d) => d.value);
    }
    this.saving.set(true);
    this.http.put<ApiResponse<DeviceAccessDto>>(`${this.api}/device-access`, { byRole }).subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Configuración de acceso por dispositivo actualizada.' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }
}
