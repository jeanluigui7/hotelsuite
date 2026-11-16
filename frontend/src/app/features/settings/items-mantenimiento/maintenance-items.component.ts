import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';

type Severity = 'LEVE' | 'INTERMEDIA' | 'CRITICA';
type Tab = 'FALLA' | 'TAREA';

interface FaultType {
  id: string;
  category: string;
  categoryLabel: string;
  label: string;
  severity: Severity;
  status: 'active' | 'inactive';
  sortOrder: number;
}

interface CatGroup { category: string; categoryLabel: string; fallas: FaultType[] }

interface FaultForm {
  id: string | null;
  category: string;
  categoryLabel: string;
  label: string;
  severity: Severity;
  status: 'active' | 'inactive';
  newCategory: boolean;
  newKey: string;
  newLabel: string;
}

@Component({
  selector: 'app-maintenance-items',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, ConfirmDialogModule],
  providers: [ConfirmationService],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Ítems de Mantenimiento</h1>
          <p class="muted">
            Catálogo único de <strong>fallas</strong> que usan Recepción y Limpieza al reportar. La
            <strong>gravedad</strong> la define aquí la administración (no quien reporta): las
            <strong>Críticas</strong> bloquean el alquiler de la habitación hasta resolverse.
          </p>
        </div>
        @if (canEdit && tab() === 'FALLA') {
          <p-button label="Nueva falla" icon="pi pi-plus" (onClick)="openNew()" />
        }
      </header>

      <div class="tabs">
        <button class="tab" [class.on]="tab() === 'FALLA'" (click)="tab.set('FALLA')">FALLA</button>
        <button class="tab" [class.on]="tab() === 'TAREA'" (click)="tab.set('TAREA')">TAREAS</button>
      </div>

      @if (tab() === 'TAREA') {
        <div class="empty">
          <i class="pi pi-wrench"></i>
          <p>La configuración de <strong>Tareas de mantenimiento</strong> llegará más adelante.</p>
        </div>
      } @else {
        @if (loading()) {
          <p class="muted"><i class="pi pi-spin pi-spinner"></i> Cargando…</p>
        } @else if (groups().length === 0) {
          <p class="muted">No hay fallas configuradas todavía.</p>
        } @else {
          <div class="legend">
            <span class="sev leve">Leve</span>
            <span class="sev inter">Intermedia</span>
            <span class="sev crit">Crítica · bloquea alquiler</span>
          </div>
          @for (g of groups(); track g.category) {
            <div class="cat">
              <div class="cat-head">
                <strong>{{ g.categoryLabel }}</strong>
                <span class="count">{{ g.fallas.length }}</span>
              </div>
              <div class="table-wrap">
                <table class="ft">
                  <thead>
                    <tr><th>Falla</th><th>Gravedad</th><th>Estado</th><th class="ac">Acciones</th></tr>
                  </thead>
                  <tbody>
                    @for (f of g.fallas; track f.id) {
                      <tr [class.off]="f.status === 'inactive'">
                        <td>{{ f.label }}</td>
                        <td>
                          @if (canEdit) {
                            <p-select [options]="sevOpts" optionLabel="label" optionValue="value"
                              [ngModel]="f.severity" (onChange)="changeSeverity(f, $event.value)"
                              appendTo="body" styleClass="sevsel" />
                          } @else {
                            <span class="sev" [class.leve]="f.severity==='LEVE'" [class.inter]="f.severity==='INTERMEDIA'" [class.crit]="f.severity==='CRITICA'">{{ sevLabel(f.severity) }}</span>
                          }
                        </td>
                        <td>
                          @if (f.status === 'active') { <span class="pill on">Activa</span> }
                          @else { <span class="pill no">Inactiva</span> }
                        </td>
                        <td class="ac">
                          @if (canEdit) {
                            <button class="ic" title="Editar" (click)="openEdit(f)"><i class="pi pi-pencil"></i></button>
                            <button class="ic" [title]="f.status==='active' ? 'Desactivar' : 'Activar'" (click)="toggleStatus(f)">
                              <i class="pi" [class.pi-eye-slash]="f.status==='active'" [class.pi-eye]="f.status==='inactive'"></i>
                            </button>
                            @if (canDelete) {
                              <button class="ic danger" title="Eliminar" (click)="remove(f)"><i class="pi pi-trash"></i></button>
                            }
                          } @else { <span class="muted">—</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        }
      }
    </section>

    <p-dialog [(visible)]="dialog" [modal]="true" [style]="{ width: '34rem', maxWidth: '96vw' }"
      [header]="form().id ? 'Editar falla' : 'Nueva falla'">
      <div class="form">
        <div class="field">
          <label>Categoría</label>
          @if (!form().newCategory) {
            <p-select [options]="catOpts()" optionLabel="label" optionValue="value"
              [ngModel]="form().category" (onChange)="pickCategory($event.value)"
              appendTo="body" styleClass="w" placeholder="Elegir categoría" />
            <button class="link" (click)="startNewCategory()">➕ Nueva categoría</button>
          } @else {
            <div class="row2">
              <input pInputText placeholder="Clave (ej. BANO)" [ngModel]="form().newKey" (ngModelChange)="patch({ newKey: $event })" />
              <input pInputText placeholder="Nombre visible (ej. BAÑO)" [ngModel]="form().newLabel" (ngModelChange)="patch({ newLabel: $event })" />
            </div>
            <button class="link" (click)="patch({ newCategory: false })">Usar una categoría existente</button>
          }
        </div>
        <div class="field">
          <label>Falla</label>
          <input pInputText [ngModel]="form().label" (ngModelChange)="patch({ label: $event })" placeholder="Nombre de la falla" />
        </div>
        <div class="field">
          <label>Gravedad</label>
          <p-select [options]="sevOpts" optionLabel="label" optionValue="value" [ngModel]="form().severity" (onChange)="patch({ severity: $event.value })" appendTo="body" styleClass="w" />
          @if (form().severity === 'CRITICA') { <small class="hint crit-hint">Las fallas críticas bloquean el alquiler de la habitación.</small> }
        </div>
        <div class="field">
          <label>Estado</label>
          <p-select [options]="statusOpts" optionLabel="label" optionValue="value" [ngModel]="form().status" (onChange)="patch({ status: $event.value })" appendTo="body" styleClass="w" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialog.set(false)" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <p-confirmDialog />
  `,
  styles: [
    `
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
      h1 { margin: 0; font-size: 1.4rem; }
      .muted { color: var(--p-text-muted-color, #71717a); font-size: 0.9rem; margin: 0.25rem 0 0; max-width: 680px; }
      .tabs { display: flex; gap: 0.25rem; border-bottom: 2px solid var(--p-content-border-color, #e5e7eb); margin-bottom: 1rem; }
      .tab { border: 0; background: transparent; padding: 0.6rem 1.1rem; font-weight: 700; color: var(--p-text-muted-color, #71717a); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; }
      .tab.on { color: var(--p-primary-color, #4f46e5); border-bottom-color: var(--p-primary-color, #4f46e5); }
      .empty { text-align: center; color: var(--p-text-muted-color, #71717a); padding: 3rem 1rem; }
      .empty .pi { font-size: 2rem; display: block; margin-bottom: 0.5rem; }
      .legend { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
      .sev { font-size: 0.72rem; font-weight: 800; border-radius: 999px; padding: 0.12rem 0.6rem; display: inline-block; }
      .sev.leve { color: #374151; background: #e5e7eb; }
      .sev.inter { color: #92400e; background: #fde68a; }
      .sev.crit { color: #991b1b; background: #fecaca; }
      .cat { margin-bottom: 1.25rem; }
      .cat-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
      .cat-head .count { font-size: 0.72rem; font-weight: 800; color: #4b5563; background: #f3f4f6; border-radius: 999px; padding: 0.1rem 0.55rem; }
      .table-wrap { overflow-x: auto; }
      table.ft { border-collapse: collapse; width: 100%; min-width: 520px; }
      table.ft th, table.ft td { border: 1px solid var(--p-content-border-color, #e5e7eb); padding: 0.45rem 0.7rem; text-align: left; font-size: 0.9rem; }
      table.ft th { background: var(--p-content-hover-background, #f3f4f6); font-size: 0.8rem; }
      table.ft th.ac, table.ft td.ac { text-align: right; white-space: nowrap; }
      tr.off td { opacity: 0.55; }
      .pill { font-size: 0.72rem; font-weight: 800; border-radius: 999px; padding: 0.1rem 0.55rem; }
      .pill.on { color: #15803d; background: #dcfce7; }
      .pill.no { color: #6b7280; background: #e5e7eb; }
      .ic { border: 0; background: transparent; cursor: pointer; color: #4b5563; padding: 0.25rem 0.4rem; border-radius: 6px; }
      .ic:hover { background: var(--p-content-hover-background, #f3f4f6); }
      .ic.danger { color: #b91c1c; }
      .form { display: flex; flex-direction: column; gap: 0.9rem; padding-top: 0.5rem; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      .field label { font-size: 0.8rem; font-weight: 700; }
      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
      .link { border: 0; background: transparent; color: var(--p-primary-color, #4f46e5); cursor: pointer; font-size: 0.8rem; text-align: left; padding: 0.2rem 0; }
      .hint { font-size: 0.78rem; }
      .crit-hint { color: #b91c1c; font-weight: 600; }
      :host ::ng-deep .w { width: 100%; }
      :host ::ng-deep input[pInputText] { width: 100%; }
      :host ::ng-deep .sevsel { min-width: 10rem; }
    `,
  ],
})
export class MaintenanceItemsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  readonly tab = signal<Tab>('FALLA');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dialog = signal(false);
  readonly items = signal<FaultType[]>([]);
  readonly form = signal<FaultForm>(this.blank());

  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  readonly sevOpts = [
    { label: 'Leve', value: 'LEVE' },
    { label: 'Intermedia', value: 'INTERMEDIA' },
    { label: 'Crítica', value: 'CRITICA' },
  ];
  readonly statusOpts = [
    { label: 'Activa', value: 'active' },
    { label: 'Inactiva', value: 'inactive' },
  ];

  readonly groups = computed<CatGroup[]>(() => {
    const byCat = new Map<string, CatGroup>();
    for (const f of this.items()) {
      let g = byCat.get(f.category);
      if (!g) { g = { category: f.category, categoryLabel: f.categoryLabel, fallas: [] }; byCat.set(f.category, g); }
      g.fallas.push(f);
    }
    return Array.from(byCat.values()).sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel));
  });

  readonly catOpts = computed(() =>
    this.groups().map((g) => ({ label: g.categoryLabel, value: g.category })));

  ngOnInit(): void { this.load(); }

  private blank(): FaultForm {
    return { id: null, category: '', categoryLabel: '', label: '', severity: 'LEVE', status: 'active', newCategory: false, newKey: '', newLabel: '' };
  }

  sevLabel(s: Severity): string { return this.sevOpts.find((o) => o.value === s)?.label ?? s; }

  patch(p: Partial<FaultForm>): void { this.form.update((f) => ({ ...f, ...p })); }

  load(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<FaultType[]>>(`${this.api}/fault-types?pageSize=500`).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toastErr('No se pudo cargar el catálogo.'); },
    });
  }

  openNew(): void { this.form.set(this.blank()); this.dialog.set(true); }

  openEdit(f: FaultType): void {
    this.form.set({ id: f.id, category: f.category, categoryLabel: f.categoryLabel, label: f.label, severity: f.severity, status: f.status, newCategory: false, newKey: '', newLabel: '' });
    this.dialog.set(true);
  }

  startNewCategory(): void { this.patch({ newCategory: true, category: '', categoryLabel: '' }); }

  pickCategory(key: string): void {
    const g = this.groups().find((x) => x.category === key);
    this.patch({ category: key, categoryLabel: g?.categoryLabel ?? key });
  }

  changeSeverity(f: FaultType, severity: Severity): void {
    if (f.severity === severity) return;
    this.http.put<ApiResponse<FaultType>>(`${this.api}/fault-types/${f.id}`, { severity }).subscribe({
      next: () => { this.items.update((l) => l.map((x) => x.id === f.id ? { ...x, severity } : x)); this.toastOk('Gravedad actualizada.'); },
      error: (e: HttpErrorResponse) => this.toastErr(e.error?.error?.message ?? 'No se pudo actualizar.'),
    });
  }

  toggleStatus(f: FaultType): void {
    const status = f.status === 'active' ? 'inactive' : 'active';
    this.http.put<ApiResponse<FaultType>>(`${this.api}/fault-types/${f.id}`, { status }).subscribe({
      next: () => { this.items.update((l) => l.map((x) => x.id === f.id ? { ...x, status } : x)); this.toastOk(status === 'active' ? 'Falla activada.' : 'Falla desactivada.'); },
      error: (e: HttpErrorResponse) => this.toastErr(e.error?.error?.message ?? 'No se pudo actualizar.'),
    });
  }

  save(): void {
    const f = this.form();
    let category = f.category;
    let categoryLabel = f.categoryLabel;
    if (f.newCategory) {
      category = (f.newKey || '').trim().toUpperCase().replace(/\s+/g, '_');
      categoryLabel = (f.newLabel || '').trim() || category;
      if (!category) { this.toastWarn('Indica la clave de la nueva categoría.'); return; }
    }
    if (!category) { this.toastWarn('Elige una categoría.'); return; }
    if (!f.label.trim()) { this.toastWarn('Indica el nombre de la falla.'); return; }
    const body = { category, categoryLabel, label: f.label.trim(), severity: f.severity, status: f.status };
    this.saving.set(true);
    const req = f.id
      ? this.http.put<ApiResponse<FaultType>>(`${this.api}/fault-types/${f.id}`, body)
      : this.http.post<ApiResponse<FaultType>>(`${this.api}/fault-types`, body);
    req.subscribe({
      next: () => { this.saving.set(false); this.dialog.set(false); this.toastOk(f.id ? 'Falla actualizada.' : 'Falla creada.'); this.load(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.toastErr(e.error?.error?.message ?? 'No se pudo guardar.'); },
    });
  }

  remove(f: FaultType): void {
    this.confirm.confirm({
      header: 'Eliminar falla',
      message: `¿Eliminar "${f.label}" (${f.categoryLabel}) del catálogo? Los reportes ya registrados conservan su falla.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete<ApiResponse<unknown>>(`${this.api}/fault-types/${f.id}`).subscribe({
          next: () => { this.items.update((l) => l.filter((x) => x.id !== f.id)); this.toastOk('Falla eliminada.'); },
          error: (e: HttpErrorResponse) => this.toastErr(e.error?.error?.message ?? 'No se pudo eliminar.'),
        });
      },
    });
  }

  private toastOk(detail: string): void { this.messages.add({ severity: 'success', summary: 'Listo', detail }); }
  private toastWarn(detail: string): void { this.messages.add({ severity: 'warn', summary: 'Falta un dato', detail }); }
  private toastErr(detail: string): void { this.messages.add({ severity: 'error', summary: 'Error', detail }); }
}
