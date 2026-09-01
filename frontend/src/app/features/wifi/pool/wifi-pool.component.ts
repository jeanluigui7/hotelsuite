import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';

type Cat = 'PERNOCTACION' | 'ESTADIA_CORTA' | 'PERSONALIZADA' | 'GRATIS';
interface WifiCred {
  id: string; ssid: string; password: string; code: string | null; category: Cat;
  used: boolean; state: 'DISPONIBLE' | 'EN_USO' | 'USADA'; room: string | null; guest: string | null;
  validMinutes: number | null; message: string | null;
}
interface CatSummary { total: number; available: number; inUse: number; used: number; }
interface RoomOpt { stayId: string; label: string; }

@Component({
  selector: 'app-wifi-pool',
  standalone: true,
  imports: [FormsModule, ButtonModule, TagModule, DialogModule, InputTextModule, InputNumberModule, SelectModule],
  template: `
    <section class="wrap">
      <!-- Header -->
      <header class="hero">
        <div class="hl"><span class="hicon"><i class="pi pi-wifi"></i></span>
          <div><h1>Pool de Credenciales WiFi</h1><p>Gestiona las credenciales WiFi que se asignan a las estancias.</p></div>
        </div>
        <div class="hr">
          <label class="tgl"><input type="checkbox" [(ngModel)]="showUsed" (ngModelChange)="reload()" /> Mostrar usadas</label>
          @if (canEdit) {
            <input #imp type="file" accept=".csv,.txt" hidden (change)="onImport($event)" />
            <p-button label="Importar CSV" icon="pi pi-upload" severity="secondary" (onClick)="imp.click()" />
            <p-button label="Crear Credenciales" icon="pi pi-plus" (onClick)="openCreate()" />
          }
        </div>
      </header>

      <!-- Tabs por categoría -->
      <div class="tabs">
        @for (c of cats; track c.key) {
          <button class="tab" [class.active]="category() === c.key" (click)="setCategory(c.key)">
            <i class="pi" [class]="c.icon"></i> {{ c.label }}
            <span class="badge">{{ sum()[c.key]?.available ?? 0 }}/{{ sum()[c.key]?.total ?? 0 }}</span>
          </button>
        }
      </div>

      <!-- Cards resumen -->
      <div class="cards">
        @for (c of cats; track c.key) {
          <button class="card" [class.on]="category() === c.key" (click)="setCategory(c.key)">
            <div class="ct"><i class="pi" [class]="c.icon"></i> {{ c.label }}</div>
            <div class="cn">{{ sum()[c.key]?.available ?? 0 }}<small>/{{ sum()[c.key]?.total ?? 0 }}</small></div>
            <div class="cs">disponibles</div>
            @if ((sum()[c.key]?.inUse ?? 0) > 0) { <div class="cu">{{ sum()[c.key]?.inUse }} en uso</div> }
          </button>
        }
      </div>

      <!-- Barra de selección -->
      @if (selected().size > 0 && canEdit) {
        <div class="selbar"><span>{{ selected().size }} seleccionada(s)</span>
          <p-button label="Eliminar seleccionadas" icon="pi pi-trash" severity="danger" size="small" (onClick)="deleteSelected()" />
        </div>
      }

      <!-- Tabla -->
      <div class="panel">
        @if (loading()) { <p class="muted">Cargando…</p> }
        @else {
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                @if (canEdit) { <th class="ck"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" /></th> }
                <th>Red WiFi</th><th>Contraseña</th><th>Código</th><th class="c">Estado</th><th>En Uso Por</th><th class="c">Hab.</th><th class="c">Acciones</th>
              </tr></thead>
              <tbody>
                @for (w of creds(); track w.id) {
                  <tr>
                    @if (canEdit) { <td class="ck"><input type="checkbox" [checked]="selected().has(w.id)" (change)="toggle(w.id)" /></td> }
                    <td><span class="ssid"><i class="pi pi-wifi"></i> {{ w.ssid }}</span></td>
                    <td><span class="pw">{{ shown().has(w.id) ? w.password : '••••••••' }}</span> <button class="eye" (click)="toggleShow(w.id)"><i class="pi" [class.pi-eye]="!shown().has(w.id)" [class.pi-eye-slash]="shown().has(w.id)"></i></button></td>
                    <td class="mono">{{ w.code || '—' }}</td>
                    <td class="c"><p-tag [value]="stateLabel(w.state)" [severity]="w.state === 'DISPONIBLE' ? 'success' : w.state === 'EN_USO' ? 'info' : 'secondary'" /></td>
                    <td>{{ w.guest || '—' }}</td>
                    <td class="c">{{ w.room || '—' }}</td>
                    <td class="c nowrap">
                      @if (w.state === 'EN_USO') { <button class="ic prt" (click)="printTicket(w)" title="Imprimir ticket"><i class="pi pi-print"></i></button> }
                      @if (canEdit) {
                        @if (w.state === 'DISPONIBLE') { <button class="ic link" (click)="openAssign(w)" title="Asignar a habitación"><i class="pi pi-link"></i></button> }
                        <button class="ic" (click)="openEdit(w)" title="Editar"><i class="pi pi-pencil"></i></button>
                        <button class="ic del" (click)="askDelete(w)" title="Eliminar"><i class="pi pi-trash"></i></button>
                      }
                    </td>
                  </tr>
                } @empty { <tr><td [attr.colspan]="canEdit ? 8 : 7" class="empty">Sin credenciales en esta categoría.</td></tr> }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>

    <!-- Crear credenciales -->
    <p-dialog [(visible)]="createVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '96vw' }" [header]="'Crear Credenciales · ' + catLabel(createCat)">
      <div class="form">
        @if (createCat === 'GRATIS') { <p class="hint gr"><i class="pi pi-gift"></i> WiFi Gratis: uso promocional/cortesía. Se entrega con ticket impreso.</p> }
        <label>Red WiFi (SSID)</label><input pInputText [(ngModel)]="cSsid" placeholder="Ej. RIZZOS HOSPEDAJE" />
        <label>Categoría</label><p-select [options]="catOpts" optionLabel="label" optionValue="value" [(ngModel)]="createCat" (onChange)="onCreateCatChange()" appendTo="body" styleClass="w" />
        <label>Cantidad de credenciales</label><p-select [options]="countOpts" [(ngModel)]="cCount" (onChange)="syncPw()" appendTo="body" styleClass="w" />
        @if (createCat === 'GRATIS') {
          <label>Tiempo de validez (minutos)</label><p-inputNumber [(ngModel)]="cValid" [min]="1" [showButtons]="true" styleClass="w" />
          <label>Mensaje del ticket</label><input pInputText [(ngModel)]="cMessage" placeholder="Ej. WIFI CORTESÍA" />
        }
        <label>Contraseñas</label>
        <div class="pwgrid">
          @for (i of pwIdx(); track i) {
            <div class="pwf"><span>#{{ i + 1 }}</span><input pInputText [(ngModel)]="cPasswords[i]" placeholder="Contraseña" /></div>
          }
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="createVisible = false" />
        <p-button [label]="'Crear ' + cCount + ' Credenciales'" icon="pi pi-plus" [loading]="busy()" (onClick)="doCreate()" />
      </ng-template>
    </p-dialog>

    <!-- Editar -->
    <p-dialog [(visible)]="editVisible" [modal]="true" [style]="{ width: '26rem' }" header="Editar Credencial">
      <div class="form">
        <label>Red WiFi (SSID)</label><input pInputText [(ngModel)]="eSsid" />
        <label>Contraseña</label><input pInputText [(ngModel)]="ePassword" />
        <label>Código</label><input pInputText [(ngModel)]="eCode" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="editVisible = false" />
        <p-button label="Guardar Cambios" icon="pi pi-check" [loading]="busy()" (onClick)="doEdit()" />
      </ng-template>
    </p-dialog>

    <!-- Asignar a habitación -->
    <p-dialog [(visible)]="assignVisible" [modal]="true" [style]="{ width: '30rem', maxWidth: '96vw' }" header="Asignar Credencial a Habitación">
      <p class="muted sm">Selecciona una habitación ocupada con cliente activo. Si ya tiene WiFi, se reemplazará por esta credencial.</p>
      <div class="form">
        <p-select [options]="rooms()" optionLabel="label" optionValue="stayId" [(ngModel)]="assignStayId" [filter]="true" filterBy="label" placeholder="Seleccionar habitación…" appendTo="body" styleClass="w" [loading]="roomsLoading()" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="assignVisible = false" />
        <p-button label="Asignar" icon="pi pi-link" [loading]="busy()" [disabled]="!assignStayId" (onClick)="doAssign()" />
      </ng-template>
    </p-dialog>

    <!-- Eliminar -->
    <p-dialog [(visible)]="deleteVisible" [modal]="true" [style]="{ width: '24rem' }" header="Eliminar Credencial">
      <p class="muted">¿Eliminar esta credencial WiFi? Esta acción no se puede deshacer.</p>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="deleteVisible = false" />
        <p-button label="Confirmar" icon="pi pi-trash" severity="danger" [loading]="busy()" (onClick)="doDelete()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .wrap { padding: 1.25rem; max-width: 1180px; }
      .muted { color: var(--p-text-muted-color, #64748b); } .muted.sm, .sm { font-size: 0.85rem; }
      .hero { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; background: linear-gradient(135deg, #10b981, #059669); color: #fff; border-radius: 14px; padding: 1.1rem 1.4rem; margin-bottom: 1.1rem; }
      .hl { display: flex; align-items: center; gap: 0.9rem; } .hicon { width: 46px; height: 46px; border-radius: 12px; background: rgba(255,255,255,0.2); display: grid; place-items: center; font-size: 1.4rem; }
      .hero h1 { margin: 0; font-size: 1.35rem; } .hero p { margin: 0.2rem 0 0; font-size: 0.86rem; opacity: 0.9; }
      .hr { display: flex; align-items: center; gap: 0.9rem; } .tgl { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer; } .tgl input { width: auto; }
      .tabs { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
      .tab { display: inline-flex; align-items: center; gap: 0.4rem; background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e2e8f0); color: var(--p-text-muted-color, #64748b); border-radius: 999px; padding: 0.45rem 0.9rem; font-weight: 600; font-size: 0.85rem; cursor: pointer; }
      .tab.active { background: #10b981; border-color: #10b981; color: #fff; } .tab .badge { background: rgba(0,0,0,0.12); border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.72rem; } .tab.active .badge { background: rgba(255,255,255,0.25); }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.7rem; margin-bottom: 1.1rem; }
      .card { text-align: left; border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; padding: 0.9rem 1rem; background: var(--p-content-background, #fff); cursor: pointer; }
      .card.on { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.15); }
      .card .ct { font-size: 0.78rem; color: var(--p-text-muted-color, #64748b); display: flex; align-items: center; gap: 0.35rem; }
      .card .cn { font-size: 1.6rem; font-weight: 800; color: #059669; } .card .cn small { font-size: 0.9rem; color: var(--p-text-muted-color, #94a3b8); font-weight: 600; }
      .card .cs { font-size: 0.74rem; color: var(--p-text-muted-color, #94a3b8); } .card .cu { font-size: 0.74rem; color: #3b82f6; margin-top: 0.15rem; }
      .selbar { display: flex; align-items: center; gap: 0.9rem; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.25); border-radius: 10px; padding: 0.5rem 0.9rem; margin-bottom: 0.8rem; font-size: 0.85rem; }
      .panel { border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; background: var(--p-content-background, #fff); padding: 0.5rem; }
      .tbl-wrap { overflow-x: auto; } .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.6rem 0.7rem; border-bottom: 1px solid var(--p-content-border-color, #eef2f7); text-align: left; font-size: 0.85rem; } .tbl .c { text-align: center; } .tbl .ck { width: 2.2rem; text-align: center; } .tbl .nowrap { white-space: nowrap; }
      .tbl th { color: var(--p-text-muted-color, #64748b); font-weight: 600; font-size: 0.74rem; text-transform: uppercase; }
      .ssid { display: inline-flex; align-items: center; gap: 0.45rem; font-weight: 700; } .ssid .pi { color: #10b981; }
      .pw { font-family: monospace; letter-spacing: 1px; } .mono { font-family: monospace; }
      .eye { background: none; border: 0; color: var(--p-text-muted-color, #94a3b8); cursor: pointer; }
      .ic { background: none; border: 0; cursor: pointer; color: var(--p-text-muted-color, #64748b); padding: 0 0.3rem; font-size: 0.95rem; } .ic.link { color: #f59e0b; } .ic.del { color: #ef4444; } .ic.prt { color: #10b981; }
      .empty { text-align: center; padding: 1.5rem; color: var(--p-text-muted-color, #94a3b8); }
      .form { display: flex; flex-direction: column; gap: 0.35rem; } .form label { font-size: 0.82rem; color: var(--p-text-muted-color, #64748b); margin-top: 0.5rem; }
      .hint { font-size: 0.82rem; margin: 0 0 0.3rem; } .hint.gr { color: #d97706; }
      .pwgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.3rem; } .pwf { display: flex; align-items: center; gap: 0.4rem; } .pwf span { font-size: 0.78rem; color: var(--p-text-muted-color, #94a3b8); width: 1.8rem; }
      :host ::ng-deep .w, :host ::ng-deep .form input[pInputText], :host ::ng-deep .form .p-select, :host ::ng-deep .form .p-inputnumber { width: 100%; }
      @media (max-width: 640px) { .pwgrid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class WifiPoolComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

  readonly canEdit = this.auth.can('settings', 'edit');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly category = signal<Cat>('PERNOCTACION');
  showUsed = false;
  readonly creds = signal<WifiCred[]>([]);
  readonly sum = signal<Record<string, CatSummary>>({});
  readonly selected = signal<Set<string>>(new Set());
  readonly shown = signal<Set<string>>(new Set());

  readonly cats: { key: Cat; label: string; icon: string }[] = [
    { key: 'PERNOCTACION', label: 'Pernoctación', icon: 'pi-moon' },
    { key: 'ESTADIA_CORTA', label: 'Estadías cortas', icon: 'pi-clock' },
    { key: 'PERSONALIZADA', label: 'Personalizada', icon: 'pi-cog' },
    { key: 'GRATIS', label: 'Gratis', icon: 'pi-gift' },
  ];
  readonly catOpts = this.cats.map((c) => ({ label: c.label, value: c.key }));
  readonly countOpts = [1, 5, 10, 15, 20, 25, 30, 50].map((n) => ({ label: `${n} credencial${n > 1 ? 'es' : ''}`, value: n }));

  // Crear
  createVisible = false; createCat: Cat = 'PERNOCTACION';
  cSsid = ''; cCount = 10; cPasswords: string[] = []; cValid = 60; cMessage = '';
  readonly pwIdx = () => Array.from({ length: this.cCount }, (_, i) => i);
  // Editar
  editVisible = false; editId = ''; eSsid = ''; ePassword = ''; eCode = '';
  // Asignar
  assignVisible = false; assignId = ''; assignStayId: string | null = null;
  readonly rooms = signal<RoomOpt[]>([]); readonly roomsLoading = signal(false);
  // Eliminar
  deleteVisible = false; deleteId = '';

  readonly allSelected = computed(() => { const c = this.creds(); return c.length > 0 && c.every((w) => this.selected().has(w.id)); });

  ngOnInit(): void { this.reload(); this.loadSummary(); }

  catLabel(c: string): string { return this.cats.find((x) => x.key === c)?.label ?? c; }
  stateLabel(s: string): string { return ({ DISPONIBLE: 'Disponible', EN_USO: 'En Uso', USADA: 'Usada' } as Record<string, string>)[s] ?? s; }
  setCategory(c: Cat): void { this.category.set(c); this.selected.set(new Set()); this.reload(); }

  reload(): void {
    this.loading.set(true);
    const params: Record<string, string> = { category: this.category() };
    if (this.showUsed) params['showUsed'] = 'true';
    this.http.get<ApiResponse<WifiCred[]>>(`${this.api}/wifi-credentials`, { params }).subscribe({
      next: (r) => { this.creds.set(r.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  loadSummary(): void {
    this.http.get<ApiResponse<Record<string, CatSummary>>>(`${this.api}/wifi-credentials/summary`).subscribe((r) => this.sum.set(r.data ?? {}));
  }

  toggleShow(id: string): void { const s = new Set(this.shown()); s.has(id) ? s.delete(id) : s.add(id); this.shown.set(s); }
  toggle(id: string): void { const s = new Set(this.selected()); s.has(id) ? s.delete(id) : s.add(id); this.selected.set(s); }
  toggleAll(): void { const c = this.creds(); this.selected.set(this.allSelected() ? new Set() : new Set(c.map((w) => w.id))); }

  // ── Crear ──
  openCreate(): void {
    this.createCat = this.category() === 'GRATIS' ? 'GRATIS' : this.category();
    this.cSsid = this.auth.activeBranch()?.name ?? '';
    this.cCount = 10; this.cValid = 60; this.cMessage = '';
    this.syncPw();
    this.createVisible = true;
  }
  onCreateCatChange(): void { /* mantiene contraseñas */ }
  syncPw(): void { const n = this.cCount; const a = [...this.cPasswords]; a.length = n; this.cPasswords = Array.from({ length: n }, (_, i) => a[i] ?? ''); }
  doCreate(): void {
    if (!this.cSsid.trim()) { this.toast.add({ severity: 'warn', summary: 'SSID', detail: 'Ingresa la red WiFi.' }); return; }
    const passwords = this.cPasswords.map((p) => (p || '').trim()).filter(Boolean);
    if (!passwords.length) { this.toast.add({ severity: 'warn', summary: 'Contraseñas', detail: 'Ingresa al menos una contraseña.' }); return; }
    this.busy.set(true);
    const body: Record<string, unknown> = { ssid: this.cSsid.trim(), category: this.createCat, passwords };
    if (this.createCat === 'GRATIS') { body['validMinutes'] = this.cValid; body['message'] = this.cMessage || undefined; }
    this.http.post<ApiResponse<{ created: number }>>(`${this.api}/wifi-credentials/bulk`, body).subscribe({
      next: (r) => { this.busy.set(false); this.createVisible = false; this.toast.add({ severity: 'success', summary: 'Creadas', detail: `${r.data?.created ?? passwords.length} credenciales.` }); this.afterChange(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo crear.' }); },
    });
  }

  // ── Editar ──
  openEdit(w: WifiCred): void { this.editId = w.id; this.eSsid = w.ssid; this.ePassword = w.password; this.eCode = w.code ?? ''; this.editVisible = true; }
  doEdit(): void {
    this.busy.set(true);
    this.http.put<ApiResponse<unknown>>(`${this.api}/wifi-credentials/${this.editId}`, { ssid: this.eSsid.trim(), password: this.ePassword.trim(), code: this.eCode.trim() }).subscribe({
      next: () => { this.busy.set(false); this.editVisible = false; this.toast.add({ severity: 'success', summary: 'Guardado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  // ── Asignar ──
  openAssign(w: WifiCred): void {
    this.assignId = w.id; this.assignStayId = null; this.assignVisible = true;
    if (!this.rooms().length) {
      this.roomsLoading.set(true);
      this.http.get<ApiResponse<{ activeStay?: { id: string; guestName: string } | null; number: string }[]>>(`${this.api}/rooms/map`).subscribe({
        next: (r) => {
          const occ = (r.data ?? []).filter((x) => x.activeStay).map((x) => ({ stayId: x.activeStay!.id, label: `Hab. ${x.number} — ${x.activeStay!.guestName}` }));
          this.rooms.set(occ); this.roomsLoading.set(false);
        },
        error: () => this.roomsLoading.set(false),
      });
    }
  }
  doAssign(): void {
    if (!this.assignStayId) return;
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/wifi-credentials/${this.assignId}/assign`, { stayId: this.assignStayId }).subscribe({
      next: () => { this.busy.set(false); this.assignVisible = false; this.toast.add({ severity: 'success', summary: 'Asignada', detail: '' }); this.afterChange(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo asignar.' }); },
    });
  }

  // ── Eliminar ──
  askDelete(w: WifiCred): void { this.deleteId = w.id; this.deleteVisible = true; }
  doDelete(): void {
    this.busy.set(true);
    this.http.delete<ApiResponse<unknown>>(`${this.api}/wifi-credentials/${this.deleteId}`).subscribe({
      next: () => { this.busy.set(false); this.deleteVisible = false; this.toast.add({ severity: 'success', summary: 'Eliminada', detail: '' }); this.afterChange(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo eliminar.' }); },
    });
  }
  deleteSelected(): void {
    const ids = [...this.selected()];
    if (!ids.length || !confirm(`¿Eliminar ${ids.length} credencial(es) seleccionada(s)?`)) return;
    this.busy.set(true);
    this.http.post<ApiResponse<{ deleted: number }>>(`${this.api}/wifi-credentials/bulk-delete`, { ids }).subscribe({
      next: (r) => { this.busy.set(false); this.selected.set(new Set()); this.toast.add({ severity: 'success', summary: 'Eliminadas', detail: `${r.data?.deleted ?? ids.length}` }); this.afterChange(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo eliminar.' }); },
    });
  }

  private afterChange(): void { this.selected.set(new Set()); this.reload(); this.loadSummary(); }

  // ── Imprimir ticket ──
  printTicket(w: WifiCred): void {
    this.http.get<ApiResponse<WifiTicketData>>(`${this.api}/wifi-credentials/${w.id}/ticket`).subscribe({
      next: (r) => {
        if (!r.data) return;
        const win = window.open('', '_blank', 'width=380,height=640');
        if (!win) { this.toast.add({ severity: 'warn', summary: 'Ventana bloqueada', detail: 'Permite ventanas emergentes para imprimir.' }); return; }
        win.document.open(); win.document.write(buildWifiTicket(r.data)); win.document.close();
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el ticket.' }),
    });
  }

  // ── Importar CSV ──
  onImport(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result));
      if (!rows.length) { this.toast.add({ severity: 'warn', summary: 'CSV', detail: 'No se encontraron filas válidas (ssid, password).' }); return; }
      this.busy.set(true);
      this.http.post<ApiResponse<{ created: number }>>(`${this.api}/wifi-credentials/import`, { rows }).subscribe({
        next: (r) => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Importadas', detail: `${r.data?.created ?? rows.length} credenciales.` }); this.afterChange(); },
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo importar.' }); },
      });
    };
    reader.readAsText(file);
  }
}

interface WifiTicketData {
  branch: { name: string; address: string; phone: string; logoUrl: string | null };
  credential: { ssid: string; code: string | null; category: string; message: string | null; validMinutes: number | null };
  stay: { room: string | null; rateLabel: string | null; adults: number; checkOutAt: string | null };
}

/** Parsea un CSV (coma o punto y coma). Cabecera con ssid,password,code,category o posicional. */
function parseCsv(text: string): { ssid: string; password: string; code?: string; category?: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const cells = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => ['ssid', 'red', 'password', 'contraseña', 'contrasena', 'code', 'codigo', 'category', 'categoria'].includes(h));
  const idx = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iS = hasHeader ? idx(['ssid', 'red']) : 0;
  const iP = hasHeader ? idx(['password', 'contraseña', 'contrasena']) : 1;
  const iC = hasHeader ? idx(['code', 'codigo']) : 2;
  const iG = hasHeader ? idx(['category', 'categoria']) : 3;
  const out: { ssid: string; password: string; code?: string; category?: string }[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const c = cells(line);
    const ssid = (iS >= 0 ? c[iS] : '') || '';
    const password = (iP >= 0 ? c[iP] : '') || '';
    if (!ssid || !password) continue;
    out.push({ ssid, password, code: iC >= 0 ? c[iC] : undefined, category: iG >= 0 ? c[iG] : undefined });
  }
  return out;
}

/** Ticket WiFi imprimible (formato térmico ~58mm), con identidad de la sucursal + estancia. */
function buildWifiTicket(d: WifiTicketData): string {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
  const now = new Date();
  const fdt = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const room = d.stay.room ? `HABITACIÓN: ${esc(d.stay.room)}${d.stay.rateLabel ? ' - ' + esc(d.stay.rateLabel) : ''}${d.stay.adults ? ' - ' + d.stay.adults + ' PERSONA' + (d.stay.adults > 1 ? 'S' : '') : ''}` : '';
  const co = d.stay.checkOutAt ? new Date(d.stay.checkOutAt) : null;
  const culmina = co ? `SALIDA: ${String(co.getDate()).padStart(2, '0')}/${String(co.getMonth() + 1).padStart(2, '0')} ${String(co.getHours()).padStart(2, '0')}:${String(co.getMinutes()).padStart(2, '0')}` : '';
  const catLabel = d.credential.category === 'GRATIS' ? 'WIFI GRATIS' : 'ACCESO WIFI';
  const msg = d.credential.message ? esc(d.credential.message) : '';
  const valid = d.credential.validMinutes ? `Válido por ${d.credential.validMinutes} min` : '';
  const logo = d.branch.logoUrl ? `<img src="${d.branch.logoUrl}" style="max-width:120px;max-height:60px;object-fit:contain" alt="logo"/>` : `<div style="font-weight:bold;font-size:16px">${esc(d.branch.name)}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket WiFi</title>
  <style>@page{margin:0} body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:10px;color:#000;font-size:12px;text-align:center}
  .l{border-top:1px dashed #000;margin:8px 0} .h{border-top:2px solid #000} b{font-size:13px}</style></head><body onload="window.print()">
  <div>${logo}</div>
  <div class="h"></div>
  ${room ? `<div style="font-weight:bold;margin-top:6px">${room}</div>` : ''}
  <div>${fdt}</div>
  ${culmina ? `<div style="font-size:11px">${culmina}</div>` : ''}
  <div class="l"></div>
  <div style="font-weight:bold;font-size:15px;margin:6px 0">${catLabel}</div>
  <div>Red: <b>${esc(d.credential.ssid)}</b></div>
  <div>Código: <b>${esc(d.credential.code || '—')}</b></div>
  ${msg ? `<div style="margin-top:4px">${msg}</div>` : ''}
  ${valid ? `<div style="font-size:11px">${valid}</div>` : ''}
  <div style="margin-top:6px">📺 Netflix &nbsp; ▶ Amazon Prime</div>
  <div class="l"></div>
  <div style="font-weight:bold">☎ ROOM SERVICE 24 HORAS</div>
  <div style="font-size:11px">Levante el intercomunicador para consultas, productos y ayuda.</div>
  <div style="font-size:11px;margin-top:4px">Servicios y productos no sujetos a devolución.</div>
  <div class="l"></div>
  ${d.branch.address ? `<div style="font-size:11px">${esc(d.branch.address)}</div>` : ''}
  ${d.branch.phone ? `<div style="font-size:11px">☎ ${esc(d.branch.phone)}</div>` : ''}
  <div style="font-size:11px;font-weight:bold;margin-top:6px">ESTE TICKET NO ES BOLETA NI FACTURA</div>
  <div style="font-size:10px">Solicítela en recepción.</div>
  </body></html>`;
}
