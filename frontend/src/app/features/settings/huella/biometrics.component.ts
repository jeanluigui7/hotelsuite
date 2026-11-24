import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { BiometricsApiService, type AdmsStatus, type BiometricDevice, type DeviceEnrollment, type LoginConfig } from '../services/biometrics-api.service';
import { UsersApiService, type UserRow } from '../../hr/services/users-api.service';

interface DeviceForm {
  id?: string;
  name: string;
  ip: string;
  port: number;
  notes: string;
}

const STATUS_META: Record<string, { label: string; severity: 'success' | 'secondary' | 'danger' }> = {
  online: { label: 'En línea', severity: 'success' },
  offline: { label: 'Desconectado', severity: 'secondary' },
  error: { label: 'Error', severity: 'danger' },
};

@Component({
  selector: 'app-biometrics',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule, TooltipModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Huella Digital</h1>
          <p class="muted">Lectores ZKTeco. El sistema está en la nube: enlaza el huellero por <b>Conexión a la nube (ADMS)</b> (botón <i class="pi pi-cloud"></i>). En equipos por nube, "Probar/Conectar" no aplican (ese método es local).</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo dispositivo" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>IP : Puerto</th><th style="width:9rem">Estado</th><th style="width:8rem">Tiempo real</th><th style="width:22rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.ip }}:{{ row.port }}</td>
            <td>
              @if (row.adms?.bound) {
                <p-tag [value]="row.adms!.online ? 'En línea · nube' : 'Nube · sin señal'" [severity]="row.adms!.online ? 'success' : 'secondary'" />
              } @else {
                <p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" />
              }
            </td>
            <td>
              @if (row.adms?.bound) { <span class="muted">ADMS (nube)</span> }
              @else { <p-tag [value]="row.realtimeActive ? 'Escuchando' : 'Inactivo'" [severity]="row.realtimeActive ? 'success' : 'secondary'" /> }
            </td>
            <td class="cat-actions">
              <!-- "Probar/Conectar" = método local (servidor→equipo): no aplica a equipos por nube (ADMS). -->
              @if (canEdit && !row.adms?.bound) { <p-button label="Probar" icon="pi pi-wifi" size="small" severity="secondary" (onClick)="test(row)" [loading]="busyId() === row.id" /> }
              @if (canEdit && !row.adms?.bound && !row.realtimeActive) { <p-button label="Conectar" icon="pi pi-play" size="small" (onClick)="connect(row)" /> }
              @if (canEdit && !row.adms?.bound && row.realtimeActive) { <p-button label="Detener" icon="pi pi-stop" size="small" severity="warn" (onClick)="disconnect(row)" /> }
              @if (canEdit) { <p-button icon="pi pi-cloud" [text]="true" (onClick)="openAdms(row)" pTooltip="Conexión a la nube (ADMS)" /> }
              @if (canEdit) { <p-button icon="pi pi-server" [text]="true" (onClick)="openAgent(row)" pTooltip="Agente local (alternativa)" /> }
              @if (canEdit) { <p-button icon="pi pi-users" [text]="true" (onClick)="openEnroll(row)" pTooltip="Enrolamiento" /> }
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin dispositivos.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- Login por huella (modo obligatorio por rol) -->
    <section class="login-cfg">
      <header class="cat-head">
        <div>
          <h2>Ingreso por huella (modo obligatorio)</h2>
          <p class="muted">Los roles marcados <b>ingresan y finalizan turno con huella</b> en lugar de contraseña. El Super Admin nunca se exige por huella.</p>
        </div>
      </header>
      <div class="roles-grid">
        @for (r of loginRoles(); track r.id) {
          <label class="role-chip" [class.on]="r.required" [class.disabled]="r.isSuperAdmin || !canEdit">
            <input type="checkbox" [checked]="r.required" [disabled]="r.isSuperAdmin || !canEdit" (change)="toggleRole(r, $any($event.target).checked)" />
            <span>{{ r.name }}</span>
            @if (r.isSuperAdmin) { <small>(no aplica)</small> }
          </label>
        }
        @if (loginRoles().length === 0) { <span class="muted">Sin roles.</span> }
      </div>
      @if (canEdit) { <p-button label="Guardar roles" icon="pi pi-check" [loading]="savingLogin()" (onClick)="saveLoginConfig()" styleClass="save-roles" /> }
    </section>

    <!-- Dispositivo -->
    <p-dialog [(visible)]="deviceVisible" [modal]="true" [style]="{ width: '440px' }" [header]="deviceForm.id ? 'Editar dispositivo' : 'Nuevo dispositivo'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="deviceForm.name" />
        <div class="row">
          <div class="col"><label>IP</label><input pInputText [(ngModel)]="deviceForm.ip" placeholder="192.168.1.201" /></div>
          <div class="col"><label>Puerto</label><p-inputNumber [(ngModel)]="deviceForm.port" [useGrouping]="false" styleClass="w-full" /></div>
        </div>
        <label>Notas</label>
        <input pInputText [(ngModel)]="deviceForm.notes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="deviceVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="saveDevice()" />
      </ng-template>
    </p-dialog>

    <!-- Enrolamiento -->
    <p-dialog [(visible)]="enrollVisible" [modal]="true" [style]="{ width: '560px' }" header="Enrolamiento de usuarios">
      <div class="cat-form">
        <p class="muted">Mapea el ID de usuario del huellero con un usuario del sistema.</p>
        <div class="add-row">
          <p-select [options]="users()" optionLabel="name" optionValue="id" [(ngModel)]="enrollForm.userId" placeholder="Usuario" styleClass="grow" />
          <input pInputText [(ngModel)]="enrollForm.deviceUserId" placeholder="ID en huellero" class="duid" />
          <p-button icon="pi pi-plus" label="Enrolar" (onClick)="enroll()" [loading]="saving()" />
        </div>
        <table class="lines">
          <thead><tr><th>ID huellero</th><th>Usuario</th><th></th></tr></thead>
          <tbody>
            @for (e of enrollments(); track e.id) {
              <tr>
                <td>{{ e.deviceUserId }}</td>
                <td>{{ e.name }}</td>
                <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeEnroll(e)" /></td>
              </tr>
            }
            @if (enrollments().length === 0) { <tr><td colspan="3" class="muted center">Sin enrolamientos.</td></tr> }
          </tbody>
        </table>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="enrollVisible = false" />
      </ng-template>
    </p-dialog>

    <!-- Conexión a la nube (ADMS) -->
    <p-dialog [(visible)]="admsVisible" [modal]="true" [style]="{ width: '640px' }" header="Conexión a la nube (ADMS)">
      <div class="cat-form agent">
        <p class="muted">El huellero <b>empuja</b> las marcas directo a este servidor por HTTPS. Funciona detrás de NAT/DHCP en <b>cualquier red</b> (tu red o la del hotel) sin agente ni PC encendida. Configúralo una sola vez en el equipo.</p>

        <div class="steps">
          <b>En el huellero → Red → Conf. Srvr de Nube:</b>
          <ol>
            <li>Modo de Servidor: <b>ADMS</b></li>
            <li>Habilitar Nombre de Dominio: <b>ON</b></li>
            <li>Dirección del Servidor: <b>{{ adms()?.serverAddress || 'rizzoshospedaje.com/api' }}</b></li>
            <li>HTTPS: <b>ON</b></li>
            <li>Red → Ethernet → DHCP: <b>ON</b> (toma IP sola en cualquier red)</li>
          </ol>
        </div>

        <label>Dirección del Servidor (cópiala al equipo)</label>
        <div class="copyrow"><input pInputText [value]="adms()?.serverAddress || 'rizzoshospedaje.com/api'" readonly /><p-button icon="pi pi-copy" [text]="true" (onClick)="copy(adms()?.serverAddress || 'rizzoshospedaje.com/api')" pTooltip="Copiar" /></div>

        <div class="kv"><span>Estado</span>
          <b>
            @if (adms()?.serial) {
              @if (admsOnline()) { <p-tag value="En línea" severity="success" /> } @else { <p-tag value="Vinculado · sin señal reciente" severity="secondary" /> }
            } @else { <p-tag value="Sin vincular" severity="warn" /> }
          </b>
        </div>
        @if (adms()?.serial) { <div class="kv"><span>Serie vinculada</span><b>{{ adms()!.serial }}</b></div> }
        @if (adms()?.lastSeen) { <div class="kv"><span>Última señal</span><b>{{ adms()!.lastSeen | date: 'dd/MM/yyyy HH:mm:ss' }}</b></div> }

        <!-- Vinculación del número de serie -->
        @if (adms()?.detected && adms()!.detected!.serial !== adms()?.serial) {
          <div class="token-box">
            <div class="token-head"><i class="pi pi-bolt"></i> Equipo detectado conectándose</div>
            <p class="sm">Número de serie <b>{{ adms()!.detected!.serial }}</b> ({{ adms()!.detected!.at | date: 'HH:mm:ss' }}). Vincúlalo a este dispositivo para empezar a registrar sus marcas.</p>
            <p-button label="Vincular este equipo" icon="pi pi-link" size="small" [loading]="admsBusy()" (onClick)="bindDetected()" />
          </div>
        }
        <label>Vincular por número de serie (manual)</label>
        <div class="copyrow">
          <input pInputText [(ngModel)]="admsSerialInput" placeholder="N° de serie del huellero" />
          <p-button icon="pi pi-link" label="Vincular" [loading]="admsBusy()" (onClick)="bindManual()" />
        </div>
        <p class="muted sm">Si no aparece el equipo detectado, carga primero la Dirección del Servidor en el huellero y vuelve a abrir esta ventana (el equipo se anuncia en segundos). El número de serie está en Red → Conexión a PC, o en la etiqueta del equipo.</p>

        <label>Marcas de asistencia</label>
        <label class="chk">
          <input type="checkbox" [checked]="adms()?.useState" [disabled]="admsBusy()" (change)="toggleState($any($event.target).checked)" />
          Usar la tecla <b>ENTRADA/SALIDA</b> del equipo (en vez de alternar automáticamente)
        </label>
        <p class="muted sm">Actívalo solo si verificaste (en los registros) que el equipo envía el estado al marcar. Si no, déjalo desactivado: el sistema alterna Entrada/Salida respecto a la última marca.</p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Refrescar" icon="pi pi-refresh" [text]="true" (onClick)="reloadAdms()" />
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="admsVisible = false" />
      </ng-template>
    </p-dialog>

    <!-- Agente local -->
    <p-dialog [(visible)]="agentVisible" [modal]="true" [style]="{ width: '600px' }" header="Agente local del huellero">
      <div class="cat-form agent">
        <p class="muted">El backend vive en la nube y no alcanza el huellero de la red local. Instala el <b>agente</b> en una PC del hotel (misma red del equipo): lee las marcas y las envía al sistema. Carpeta <code>biometric-agent/</code> del proyecto.</p>

        <div class="kv"><span>Estado del agente</span>
          <b>
            @if (agentStatus()?.configured) {
              @if (agentOnline()) { <p-tag value="En línea" severity="success" /> }
              @else { <p-tag value="Token generado · sin señal" severity="secondary" /> }
            } @else { <p-tag value="Sin configurar" severity="danger" /> }
          </b>
        </div>
        @if (agentStatus()?.lastSeen) { <div class="kv"><span>Última señal</span><b>{{ agentStatus()!.lastSeen | date: 'dd/MM/yyyy HH:mm:ss' }}</b></div> }

        <label>ID del dispositivo (deviceId)</label>
        <div class="copyrow"><input pInputText [value]="agentDevice?.id ?? ''" readonly /><p-button icon="pi pi-copy" [text]="true" (onClick)="copy(agentDevice?.id)" pTooltip="Copiar" /></div>

        <label>URL de ingesta (apiUrl)</label>
        <div class="copyrow"><input pInputText value="https://rizzoshospedaje.com/api" readonly /><p-button icon="pi pi-copy" [text]="true" (onClick)="copy('https://rizzoshospedaje.com/api')" pTooltip="Copiar" /></div>

        <label>IP del huellero</label>
        <div class="copyrow"><input pInputText [value]="agentDevice?.ip ?? ''" readonly /><p-button icon="pi pi-copy" [text]="true" (onClick)="copy(agentDevice?.ip)" pTooltip="Copiar" /></div>

        @if (agentToken()) {
          <div class="token-box">
            <div class="token-head"><i class="pi pi-key"></i> Token del agente (se muestra una sola vez)</div>
            <div class="copyrow"><input pInputText [value]="agentToken()!" readonly /><p-button icon="pi pi-copy" [text]="true" (onClick)="copy(agentToken())" pTooltip="Copiar" /></div>
            <p class="muted sm">Pégalo en <code>config.json</code> del agente (campo <code>agentToken</code>). Guárdalo: no se vuelve a mostrar.</p>
          </div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="agentVisible = false" />
        <p-button [label]="agentStatus()?.configured ? 'Rotar token' : 'Generar token'" icon="pi pi-key" [loading]="agentBusy()" (onClick)="genToken()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .add-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.6rem; }
      :host ::ng-deep .grow { flex: 1; }
      .duid { width: 140px; }
      table.lines { width: 100%; border-collapse: collapse; }
      table.lines th, table.lines td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--p-content-border-color, #2b2b30); text-align: left; font-size: 0.85rem; }
      .agent .kv { display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0; }
      .agent code { background: var(--p-content-hover-background, #f1f3f5); padding: 0.05rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
      .copyrow { display: flex; gap: 0.4rem; align-items: center; }
      .copyrow input { flex: 1; font-family: monospace; }
      .token-box { margin-top: 0.8rem; border: 1px solid var(--p-primary-color, #3b82f6); border-radius: 8px; padding: 0.7rem; background: var(--p-highlight-background, rgba(59,130,246,0.08)); }
      .token-head { font-weight: 700; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
      .sm { font-size: 0.78rem; }
      label.chk { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; }
      label.chk input { width: 18px; height: 18px; }
      .login-cfg { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--p-content-border-color, #e5e7eb); }
      .login-cfg h2 { margin: 0 0 0.2rem; font-size: 1.1rem; }
      .roles-grid { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 0.9rem 0 1rem; }
      .role-chip { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.55rem 0.9rem; cursor: pointer;
        border: 1px solid var(--p-content-border-color, #d1d5db); border-radius: 999px; font-size: 0.9rem; user-select: none; }
      .role-chip.on { border-color: var(--rz-accent, #10b981); background: color-mix(in srgb, var(--rz-accent, #10b981) 12%, transparent); font-weight: 700; }
      .role-chip.disabled { opacity: 0.55; cursor: not-allowed; }
      .role-chip input { width: 17px; height: 17px; }
      .role-chip small { color: var(--p-text-muted-color, #8aa0bd); }
      :host ::ng-deep .save-roles { display: inline-block; }
    `,
  ],
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class BiometricsComponent implements OnInit {
  private readonly api = inject(BiometricsApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<BiometricDevice[]>([]);
  readonly users = signal<UserRow[]>([]);
  readonly enrollments = signal<DeviceEnrollment[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);

  deviceVisible = false;
  deviceForm: DeviceForm = { name: '', ip: '', port: 4370, notes: '' };

  enrollVisible = false;
  enrollDeviceId: string | null = null;
  enrollForm = { userId: null as string | null, deviceUserId: '' };

  // Agente local
  agentVisible = false;
  agentDevice: BiometricDevice | null = null;
  readonly agentStatus = signal<{ configured: boolean; lastSeen: string | null } | null>(null);
  readonly agentToken = signal<string | null>(null);
  readonly agentBusy = signal(false);

  // ADMS / nube
  admsVisible = false;
  admsDevice: BiometricDevice | null = null;
  readonly adms = signal<AdmsStatus | null>(null);
  readonly admsBusy = signal(false);
  admsSerialInput = '';

  // Login por huella (roles)
  readonly loginRoles = signal<LoginConfig['roles']>([]);
  readonly savingLogin = signal(false);

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.usersApi.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.users.set(res.data ?? []));
    this.reload();
    this.api.loginConfig().subscribe({
      next: (res) => this.loginRoles.set(res.data?.roles ?? []),
      error: () => this.loginRoles.set([]),
    });
  }

  meta(s: string) {
    return STATUS_META[s] ?? { label: s, severity: 'secondary' as const };
  }

  reload(): void {
    this.loading.set(true);
    this.api.devices.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.deviceForm = { name: '', ip: '', port: 4370, notes: '' };
    this.deviceVisible = true;
  }

  openEdit(row: BiometricDevice): void {
    this.deviceForm = { id: row.id, name: row.name, ip: row.ip, port: row.port, notes: row.notes ?? '' };
    this.deviceVisible = true;
  }

  saveDevice(): void {
    if (!this.deviceForm.name || !this.deviceForm.ip) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Nombre e IP requeridos.' });
      return;
    }
    const { id, ...dto } = this.deviceForm;
    this.saving.set(true);
    const req$ = id ? this.api.devices.update(id, dto) : this.api.devices.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.deviceVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Dispositivo guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  test(row: BiometricDevice): void {
    this.busyId.set(row.id);
    this.api.test(row.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.messages.add({ severity: 'success', summary: 'Conexión OK', detail: 'El dispositivo respondió.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.messages.add({ severity: 'error', summary: 'Sin conexión', detail: err.error?.error?.message ?? 'No respondió.' });
        this.reload();
      },
    });
  }

  connect(row: BiometricDevice): void {
    this.api.connect(row.id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Conectado', detail: 'Escucha en tiempo real activa.' }); this.reload(); },
      error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo conectar.' }),
    });
  }

  disconnect(row: BiometricDevice): void {
    this.api.disconnect(row.id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Detenido', detail: 'Escucha detenida.' }); this.reload(); },
      error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo detener.' }),
    });
  }

  // ── ADMS / nube ──
  openAdms(row: BiometricDevice): void {
    this.admsDevice = row;
    this.adms.set(null);
    this.admsSerialInput = '';
    this.admsVisible = true;
    this.reloadAdms();
  }
  reloadAdms(): void {
    if (!this.admsDevice) return;
    this.api.admsStatus(this.admsDevice.id).subscribe({
      next: (res) => this.adms.set(res.data ?? null),
      error: () => this.adms.set(null),
    });
  }
  admsOnline(): boolean {
    const seen = this.adms()?.lastSeen;
    return !!seen && Date.now() - new Date(seen).getTime() < 180_000;
  }
  bindDetected(): void {
    const sn = this.adms()?.detected?.serial;
    if (sn) this.doBind(sn);
  }
  bindManual(): void {
    const sn = this.admsSerialInput.trim();
    if (!sn) { this.messages.add({ severity: 'warn', summary: 'Falta la serie', detail: 'Ingresa el número de serie.' }); return; }
    this.doBind(sn);
  }
  private doBind(serial: string): void {
    if (!this.admsDevice) return;
    this.admsBusy.set(true);
    this.api.bindSerial(this.admsDevice.id, serial).subscribe({
      next: () => {
        this.admsBusy.set(false);
        this.admsSerialInput = '';
        this.messages.add({ severity: 'success', summary: 'Vinculado', detail: `Serie ${serial} vinculada. Las marcas del equipo ya se registrarán.` });
        this.reloadAdms();
      },
      error: (err: HttpErrorResponse) => {
        this.admsBusy.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo vincular.' });
      },
    });
  }

  /** Activa/desactiva el uso de la tecla ENTRADA/SALIDA del equipo. */
  toggleState(on: boolean): void {
    if (!this.admsDevice) return;
    this.admsBusy.set(true);
    this.api.setAdmsState(this.admsDevice.id, on).subscribe({
      next: () => {
        this.admsBusy.set(false);
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: on ? 'Se usará la tecla ENTRADA/SALIDA del equipo.' : 'Se alternará Entrada/Salida automáticamente.' });
        this.reloadAdms();
      },
      error: (err: HttpErrorResponse) => {
        this.admsBusy.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  // ── Login por huella (roles) ──
  toggleRole(role: LoginConfig['roles'][number], on: boolean): void {
    this.loginRoles.update((list) => list.map((r) => (r.id === role.id ? { ...r, required: on } : r)));
  }
  saveLoginConfig(): void {
    const ids = this.loginRoles().filter((r) => r.required && !r.isSuperAdmin).map((r) => r.id);
    this.savingLogin.set(true);
    this.api.saveLoginConfig(ids).subscribe({
      next: (res) => {
        this.savingLogin.set(false);
        this.loginRoles.set(res.data?.roles ?? this.loginRoles());
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Roles de ingreso por huella actualizados.' });
      },
      error: (err: HttpErrorResponse) => {
        this.savingLogin.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  // ── Agente local ──
  openAgent(row: BiometricDevice): void {
    this.agentDevice = row;
    this.agentToken.set(null);
    this.agentStatus.set(null);
    this.agentVisible = true;
    this.api.agentStatus(row.id).subscribe({
      next: (res) => this.agentStatus.set(res.data ?? { configured: false, lastSeen: null }),
      error: () => this.agentStatus.set({ configured: false, lastSeen: null }),
    });
  }

  /** "En línea" = última señal del agente dentro de los últimos ~2 minutos. */
  agentOnline(): boolean {
    const seen = this.agentStatus()?.lastSeen;
    if (!seen) return false;
    return Date.now() - new Date(seen).getTime() < 120_000;
  }

  genToken(): void {
    if (!this.agentDevice) return;
    this.agentBusy.set(true);
    this.api.generateAgentToken(this.agentDevice.id).subscribe({
      next: (res) => {
        this.agentBusy.set(false);
        this.agentToken.set(res.data?.token ?? null);
        this.agentStatus.update((s) => ({ configured: true, lastSeen: s?.lastSeen ?? null }));
        this.messages.add({ severity: 'success', summary: 'Token generado', detail: 'Cópialo al config.json del agente. No se vuelve a mostrar.' });
      },
      error: (err: HttpErrorResponse) => {
        this.agentBusy.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo generar el token.' });
      },
    });
  }

  copy(text?: string | null): void {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => this.messages.add({ severity: 'success', summary: 'Copiado', detail: '', life: 1200 }),
      () => { /* clipboard no disponible */ },
    );
  }

  openEnroll(row: BiometricDevice): void {
    this.enrollDeviceId = row.id;
    this.enrollForm = { userId: null, deviceUserId: '' };
    this.loadEnrollments();
    this.enrollVisible = true;
  }

  private loadEnrollments(): void {
    if (!this.enrollDeviceId) return;
    this.api.enrollments(this.enrollDeviceId).subscribe((res) => this.enrollments.set(res.data ?? []));
  }

  enroll(): void {
    if (!this.enrollDeviceId || !this.enrollForm.userId || !this.enrollForm.deviceUserId) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Usuario e ID del huellero.' });
      return;
    }
    this.saving.set(true);
    this.api.enroll(this.enrollDeviceId, { userId: this.enrollForm.userId, deviceUserId: this.enrollForm.deviceUserId }).subscribe({
      next: () => {
        this.saving.set(false);
        this.enrollForm = { userId: null, deviceUserId: '' };
        this.messages.add({ severity: 'success', summary: 'Enrolado', detail: 'Usuario mapeado.' });
        this.loadEnrollments();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo enrolar.' });
      },
    });
  }

  removeEnroll(e: DeviceEnrollment): void {
    if (!this.enrollDeviceId) return;
    this.api.removeEnrollment(this.enrollDeviceId, e.id).subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Enrolamiento eliminado.' }); this.loadEnrollments(); },
      error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
    });
  }

  confirmDelete(row: BiometricDevice): void {
    this.confirm.confirm({
      header: 'Eliminar dispositivo',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.devices.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Dispositivo eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
