import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { RoomType } from '../catalogs/catalog.models';

interface Dotacion {
  id: string;
  roomTypeId: string;
  category?: string | null;
  articleKind: string;
  name: string;
  linenItemId?: string | null;
  baseQty: number;
  required: boolean;
  allowExtra: boolean;
  status: string;
}
interface LinenItem { id: string; type: string; name: string; }
interface Form {
  id?: string;
  category: string;
  articleKind: string;
  name: string;
  linenItemId: string | null;
  baseQty: number;
  required: boolean;
  allowExtra: boolean;
  status: 'active' | 'inactive';
}
const KINDS = [
  { label: 'Ropa reutilizable', value: 'LINEN_REUSABLE' },
  { label: 'Amenity consumible', value: 'AMENITY' },
  { label: 'Producto de venta', value: 'SALE' },
  { label: 'Inventario / activo', value: 'ASSET' },
];
function emptyForm(): Form {
  return { category: '', articleKind: 'LINEN_REUSABLE', name: '', linenItemId: null, baseQty: 1, required: false, allowExtra: false, status: 'active' };
}

@Component({
  selector: 'app-dotacion',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule],
  template: `
    <section class="dt">
      <header class="top">
        <div><h1>Dotación Base por Tipo de Habitación</h1><p class="muted">Define el estándar de ropa, amenities y artículos que debe tener cada habitación según su tipo. Sirve para la carga inicial, la reposición en limpieza y para comparar el stock esperado vs el actual.</p></div>
      </header>

      <div class="bar">
        <div class="fld"><label>Tipo de habitación</label>
          <p-select [options]="roomTypes()" optionLabel="name" optionValue="id" [(ngModel)]="roomTypeId" (onChange)="reload()" placeholder="Selecciona un tipo" styleClass="dk" />
        </div>
        <span class="spacer"></span>
        @if (canEdit && roomTypeId) { <button class="new-btn" (click)="openNew()"><i class="pi pi-plus"></i> Agregar artículo</button> }
      </div>

      @if (!roomTypeId) {
        <p class="muted empty">Selecciona un tipo de habitación para ver y configurar su dotación base.</p>
      } @else {
        <div class="tablewrap">
          <table class="tbl">
            <thead><tr>
              <th>Categoría</th><th>Artículo</th><th>Tipo</th><th class="cn">Cant. BASE</th>
              <th class="cn">Obligatorio</th><th class="cn">Permite adicional</th><th class="cn">Estado</th><th class="ac"></th>
            </tr></thead>
            <tbody>
              @for (d of items(); track d.id) {
                <tr>
                  <td class="muted">{{ d.category || '—' }}</td>
                  <td class="nm">{{ d.name }}</td>
                  <td><span class="kind" [class]="kindClass(d.articleKind)">{{ kindLabel(d.articleKind) }}</span></td>
                  <td class="cn"><strong>{{ d.baseQty }}</strong></td>
                  <td class="cn"><span class="pill" [class.yes]="d.required">{{ d.required ? 'Sí' : 'No' }}</span></td>
                  <td class="cn"><span class="pill" [class.yes]="d.allowExtra">{{ d.allowExtra ? 'Sí' : 'No' }}</span></td>
                  <td class="cn"><span class="pill" [class.on]="d.status === 'active'" [class.off]="d.status !== 'active'">{{ d.status === 'active' ? 'Activo' : 'Inactivo' }}</span></td>
                  <td class="ac">
                    @if (canEdit) { <button class="ia" (click)="openEdit(d)" title="Editar"><i class="pi pi-pencil"></i></button> }
                    @if (canDelete) { <button class="ia del" (click)="confirmDelete(d)" title="Eliminar"><i class="pi pi-trash"></i></button> }
                  </td>
                </tr>
              } @empty { <tr><td colspan="8" class="muted center">Sin dotación configurada para este tipo. Agrega los artículos base.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '32rem', maxWidth: '95vw' }" [header]="form.id ? 'Editar artículo de dotación' : 'Nuevo artículo de dotación'" styleClass="dk-dialog">
      <div class="form">
        <div class="fld"><label>Categoría</label><input pInputText [(ngModel)]="form.category" placeholder="Ropa, Amenities, etc." /></div>
        <div class="fld"><label>Tipo de artículo</label>
          <p-select [options]="kinds" optionLabel="label" optionValue="value" [(ngModel)]="form.articleKind" styleClass="w" appendTo="body" />
        </div>
        <div class="fld"><label>Artículo *</label><input pInputText [(ngModel)]="form.name" placeholder="Sábana, Jabón Premium, Toalla…" /></div>
        @if (form.articleKind === 'LINEN_REUSABLE' || form.articleKind === 'AMENITY') {
          <div class="fld"><label>Vínculo con ropa/almacén (opcional)</label>
            <p-select [options]="linenItems()" optionLabel="name" optionValue="id" [(ngModel)]="form.linenItemId" [showClear]="true" [filter]="true" filterBy="name" placeholder="Sin vínculo" styleClass="w" appendTo="body">
              <ng-template let-l pTemplate="item">{{ l.type }} · {{ l.name }}</ng-template>
            </p-select>
            <small>Si lo vinculas, la reposición en limpieza descontará del Almacén de Limpieza del piso (stock real).</small>
          </div>
        }
        <div class="fld"><label>Cantidad BASE</label><p-inputNumber [(ngModel)]="form.baseQty" [min]="0" styleClass="w" /></div>
        <label class="chk"><input type="checkbox" [(ngModel)]="form.required" /> <span>Obligatorio para dejar la habitación disponible</span></label>
        <label class="chk"><input type="checkbox" [(ngModel)]="form.allowExtra" /> <span>Permite cantidad adicional</span></label>
        <div class="fld"><label>Estado</label>
          <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w" appendTo="body" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button [label]="form.id ? 'Guardar' : 'Agregar'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .dt { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; font-size: 1.6rem; } .muted { color: #8b97a8; } .center { text-align: center; } .empty { padding: 2rem 0; text-align: center; }
      .bar { display: flex; align-items: flex-end; gap: 1rem; margin: 1rem 0; }
      .bar .fld { display: flex; flex-direction: column; gap: 0.35rem; } .bar label { font-size: 0.8rem; color: #9fb0c3; }
      .spacer { flex: 1; }
      :host ::ng-deep .dk { min-width: 260px; }
      .new-btn { background: #10b981; color: #04130d; border: 0; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; }
      .tablewrap { background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.88rem; min-width: 820px; }
      .tbl th { text-align: left; padding: 0.8rem 1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; font-size: 0.78rem; }
      .tbl td { padding: 0.75rem 1rem; border-bottom: 1px solid #16202e; } .tbl tr:last-child td { border-bottom: 0; }
      th.cn, td.cn { text-align: center; } th.ac, td.ac { text-align: right; white-space: nowrap; }
      .nm { font-weight: 600; color: #fff; }
      .kind { font-size: 0.72rem; font-weight: 700; padding: 0.16rem 0.6rem; border-radius: 999px; }
      .kind.linen { background: rgba(20,184,166,0.2); color: #5eead4; }
      .kind.amenity { background: rgba(168,85,247,0.2); color: #d8b4fe; }
      .kind.sale { background: rgba(245,158,11,0.2); color: #fcd34d; }
      .kind.asset { background: rgba(59,130,246,0.2); color: #93c5fd; }
      .pill { display: inline-block; border-radius: 999px; padding: 0.16rem 0.65rem; font-size: 0.72rem; font-weight: 700; background: #1a2333; color: #9fb0c3; }
      .pill.yes { background: rgba(37,99,235,0.22); color: #60a5fa; }
      .pill.on { background: rgba(16,185,129,0.2); color: #6ee7b7; } .pill.off { background: rgba(239,68,68,0.18); color: #fca5a5; }
      .ia { background: transparent; border: 0; color: #93b3d1; cursor: pointer; padding: 0.35rem; } .ia.del { color: #f87171; } .ia:hover { color: #fff; }
      .form { display: flex; flex-direction: column; gap: 0.9rem; }
      .form .fld { display: flex; flex-direction: column; gap: 0.35rem; }
      .form label { font-size: 0.82rem; color: #9fb0c3; font-weight: 600; }
      .form input[pInputText] { width: 100%; }
      :host ::ng-deep .form .w, :host ::ng-deep .bar .w { width: 100%; }
      .chk { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; }
      .chk input { width: 18px; height: 18px; accent-color: #10b981; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class DotacionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly catalog = inject(CatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly roomTypes = signal<RoomType[]>([]);
  readonly items = signal<Dotacion[]>([]);
  readonly linenItems = signal<LinenItem[]>([]);
  readonly saving = signal(false);
  readonly kinds = KINDS;
  readonly statusOptions = [{ label: 'Activo', value: 'active' }, { label: 'Inactivo', value: 'inactive' }];

  roomTypeId: string | null = null;
  dialogVisible = false;
  form: Form = emptyForm();

  readonly canEdit = this.auth.can('settings', 'edit') || this.auth.can('settings', 'create');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.catalog.roomTypes.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => {
      this.roomTypes.set(res.data ?? []);
      if (!this.roomTypeId && res.data?.length) { this.roomTypeId = res.data[0].id; this.reload(); }
    });
    this.http.get<ApiResponse<LinenItem[]>>(`${this.api}/cleaning/linen-items`).subscribe((r) => this.linenItems.set(r.data ?? []));
  }

  kindLabel(v: string): string { return KINDS.find((k) => k.value === v)?.label ?? v; }
  kindClass(v: string): string { return { LINEN_REUSABLE: 'linen', AMENITY: 'amenity', SALE: 'sale', ASSET: 'asset' }[v] ?? 'linen'; }

  reload(): void {
    if (!this.roomTypeId) { this.items.set([]); return; }
    this.http.get<ApiResponse<Dotacion[]>>(`${this.api}/dotacion`, { params: { roomTypeId: this.roomTypeId } })
      .subscribe({ next: (r) => this.items.set(r.data ?? []), error: () => this.items.set([]) });
  }

  openNew(): void { this.form = emptyForm(); this.dialogVisible = true; }
  openEdit(d: Dotacion): void {
    this.form = { id: d.id, category: d.category ?? '', articleKind: d.articleKind, name: d.name, linenItemId: d.linenItemId ?? null, baseQty: d.baseQty, required: d.required, allowExtra: d.allowExtra, status: d.status as 'active' | 'inactive' };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.roomTypeId) return;
    if (!this.form.name.trim()) { this.messages.add({ severity: 'warn', summary: 'Falta el artículo', detail: 'Indica el nombre del artículo.' }); return; }
    const linked = this.form.articleKind === 'LINEN_REUSABLE' || this.form.articleKind === 'AMENITY';
    const dto = {
      roomTypeId: this.roomTypeId, category: this.form.category, articleKind: this.form.articleKind,
      name: this.form.name.trim(), linenItemId: linked ? (this.form.linenItemId || '') : '',
      baseQty: this.form.baseQty, required: this.form.required,
      allowExtra: this.form.allowExtra, status: this.form.status,
    };
    this.saving.set(true);
    const req$ = this.form.id
      ? this.http.put<ApiResponse<Dotacion>>(`${this.api}/dotacion/${this.form.id}`, dto)
      : this.http.post<ApiResponse<Dotacion>>(`${this.api}/dotacion`, dto);
    req$.subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Dotación guardada.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  confirmDelete(d: Dotacion): void {
    this.confirm.confirm({
      header: 'Eliminar artículo', message: `¿Eliminar "${d.name}" de la dotación?`, icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.http.delete<ApiResponse<unknown>>(`${this.api}/dotacion/${d.id}`).subscribe({
        next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Artículo eliminado.' }); this.reload(); },
        error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
      }),
    });
  }
}
