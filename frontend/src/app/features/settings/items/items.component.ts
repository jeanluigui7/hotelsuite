import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { ServiceCatalogApiService } from './service-catalog-api.service';
import {
  ATTENTION_LABEL, UNIT_LABEL,
  type AttentionMode, type CatalogStatus, type ConceptUnit, type LinenArticle, type SCCategory, type SCConcept, type SCGroup, type ServiceTipo,
} from './service-catalog.models';

interface CatForm { id?: string; name: string; description: string; sortOrder: number; status: CatalogStatus; }
interface GroupForm { id?: string; categoryId: string; name: string; description: string; sortOrder: number; status: CatalogStatus; }
interface ConceptForm {
  id?: string; groupId: string; code: string; name: string; description: string; price: number | null;
  unit: ConceptUnit; sortOrder: number; status: CatalogStatus; allowCourtesy: boolean; allowFreeAmount: boolean;
  attentionMode: AttentionMode; productId: string | null;
}

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule],
  template: `
    <section class="sc">
      <header class="sc-head">
        <div>
          <h1>SERVICIOS/PENALIDADES</h1>
          <p class="muted">Configura categorías, grupos, conceptos, precios y condiciones de atención</p>
        </div>
      </header>

      <!-- Pestañas Tipo (fijas) -->
      <div class="tabs">
        <button class="tab" [class.on]="tipo() === 'SERVICIO'" (click)="setTipo('SERVICIO')"><i class="pi pi-box"></i> Servicios</button>
        <button class="tab" [class.on]="tipo() === 'PENALIDAD'" (click)="setTipo('PENALIDAD')"><i class="pi pi-exclamation-triangle"></i> Penalidades</button>
      </div>

      <!-- Toolbar -->
      <div class="toolbar">
        <div class="search"><i class="pi pi-search"></i><input pInputText [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Buscar categoría, grupo, concepto o código…" /></div>
        <p-select [options]="statusOpts" optionLabel="label" optionValue="value" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)" styleClass="flt" />
        <span class="count">{{ filteredTree().length }} categoría(s)</span>
        @if (canCreate) { <button class="btn primary" (click)="openNewCategory()"><i class="pi pi-plus"></i> Nueva categoría</button> }
      </div>

      @if (loading()) { <p class="muted center pad">Cargando…</p> }
      @else if (!filteredTree().length) {
        <div class="empty-box">
          @if (search()) { <p>No hay resultados para “{{ search() }}”.</p> }
          @else { <p>Aún no hay categorías de {{ tipo() === 'SERVICIO' ? 'servicios' : 'penalidades' }}. Crea la primera con “Nueva categoría”.</p> }
        </div>
      } @else {
        @for (cat of filteredTree(); track cat.id) {
          <div class="cat" [class.off]="cat.status === 'inactive'">
            <div class="cat-row" (click)="toggleCat(cat.id)">
              <i class="pi chev" [class.pi-chevron-down]="isCatOpen(cat.id)" [class.pi-chevron-right]="!isCatOpen(cat.id)"></i>
              <i class="pi pi-folder fold"></i>
              <div class="cat-main">
                <div class="cat-name">{{ cat.name }} @if (cat.status === 'inactive') { <span class="pill off">Inactiva</span> }</div>
                @if (cat.description) { <div class="cat-desc">{{ cat.description }}</div> }
              </div>
              <span class="counts">{{ cat.groups.length }} grupo(s) · {{ conceptCount(cat) }} concepto(s)</span>
              <div class="acts" (click)="$event.stopPropagation()">
                @if (canEdit) { <button class="ic" title="{{ cat.status === 'active' ? 'Desactivar' : 'Activar' }}" (click)="toggleCatStatus(cat)"><i class="pi" [class.pi-eye]="cat.status === 'active'" [class.pi-eye-slash]="cat.status !== 'active'"></i></button> }
                @if (canEdit) { <button class="ic" title="Editar" (click)="openEditCategory(cat)"><i class="pi pi-pencil"></i></button> }
                @if (canDelete) { <button class="ic danger" title="Eliminar" (click)="deleteCategory(cat)"><i class="pi pi-trash"></i></button> }
              </div>
            </div>

            @if (isCatOpen(cat.id)) {
              <div class="cat-body">
                <div class="sub-toolbar">
                  @if (canCreate) { <button class="btn ghost sm" (click)="openNewGroup(cat)"><i class="pi pi-plus"></i> Agregar grupo</button> }
                </div>
                @if (!cat.groups.length) { <p class="muted sm pad">Esta categoría no tiene grupos. Agrega el primero.</p> }
                @for (g of cat.groups; track g.id) {
                  <div class="grp" [class.off]="g.status === 'inactive'">
                    <div class="grp-row" (click)="toggleGroup(g.id)">
                      <i class="pi chev" [class.pi-chevron-down]="isGroupOpen(g.id)" [class.pi-chevron-right]="!isGroupOpen(g.id)"></i>
                      <i class="pi pi-file fold-g"></i>
                      <div class="grp-main">
                        <div class="grp-name">{{ g.name }} @if (g.status === 'inactive') { <span class="pill off">Inactivo</span> }</div>
                        @if (g.description) { <div class="grp-desc">{{ g.description }}</div> }
                      </div>
                      <span class="counts">{{ g.concepts.length }} concepto(s)</span>
                      <div class="acts" (click)="$event.stopPropagation()">
                        @if (canEdit) { <button class="ic" title="{{ g.status === 'active' ? 'Desactivar' : 'Activar' }}" (click)="toggleGroupStatus(g)"><i class="pi" [class.pi-eye]="g.status === 'active'" [class.pi-eye-slash]="g.status !== 'active'"></i></button> }
                        @if (canEdit) { <button class="ic" title="Editar" (click)="openEditGroup(cat, g)"><i class="pi pi-pencil"></i></button> }
                        @if (canDelete) { <button class="ic danger" title="Eliminar" (click)="deleteGroup(g)"><i class="pi pi-trash"></i></button> }
                      </div>
                    </div>

                    @if (isGroupOpen(g.id)) {
                      <div class="grp-body">
                        <div class="sub-toolbar">
                          @if (canCreate) { <button class="btn ghost sm" (click)="openNewConcept(cat, g)"><i class="pi pi-plus"></i> Agregar concepto</button> }
                        </div>
                        @if (!g.concepts.length) { <p class="muted sm pad">Sin conceptos. Agrega el primero con su código y precio.</p> }
                        @else {
                          <table class="ctbl">
                            <thead><tr><th>Código</th><th>Nombre</th><th class="r">Precio</th><th>Modalidad</th><th>Artículo</th><th class="c">Estado</th><th class="c">Acciones</th></tr></thead>
                            <tbody>
                              @for (c of g.concepts; track c.id) {
                                <tr [class.off]="c.status === 'inactive'">
                                  <td class="code">{{ c.code }}</td>
                                  <td>{{ c.name }}</td>
                                  <td class="r price">S/ {{ asNum(c.price) | number: '1.2-2' }}</td>
                                  <td>@if (c.attentionMode === 'LINEN_EXTRA') { <span class="mtag linen"><i class="pi pi-inbox"></i> Ropa adicional</span> } @else { <span class="mtag">Directo</span> }</td>
                                  <td>{{ c.product?.name || '—' }}</td>
                                  <td class="c"><span class="pill" [class.on]="c.status === 'active'" [class.off]="c.status !== 'active'">{{ c.status === 'active' ? 'Activo' : 'Inactivo' }}</span></td>
                                  <td class="c nowrap">
                                    @if (canEdit) { <button class="lnk" (click)="toggleConceptStatus(c)">{{ c.status === 'active' ? 'Desactivar' : 'Activar' }}</button> }
                                    @if (canEdit) { <button class="lnk" (click)="openEditConcept(cat, g, c)">Editar</button> }
                                    @if (canDelete) { <button class="lnk red" (click)="deleteConcept(c)">Eliminar</button> }
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </section>

    <!-- Dialog Categoría -->
    <p-dialog [(visible)]="catDialog" [modal]="true" [style]="{ width: '34rem', maxWidth: '96vw' }" [header]="catForm.id ? 'Editar categoría' : 'Nueva categoría'">
      <div class="form">
        <div class="ctx">Tipo: <b>{{ tipo() === 'SERVICIO' ? 'Servicios' : 'Penalidades' }}</b></div>
        <label>Nombre *</label>
        <input pInputText [(ngModel)]="catForm.name" maxlength="120" placeholder="Ej: Cafetería / Restaurante" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="catForm.description" maxlength="300" placeholder="Descripción opcional de la categoría" />
        <div class="row2">
          <div><label>Orden</label><p-inputNumber [(ngModel)]="catForm.sortOrder" [min]="0" styleClass="w" /></div>
          <div><label>Estado</label><p-select [options]="statusEditOpts" optionLabel="label" optionValue="value" [(ngModel)]="catForm.status" styleClass="w" /></div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="catDialog = false" />
        <p-button [label]="catForm.id ? 'Guardar' : 'Crear categoría'" icon="pi pi-check" [loading]="saving()" (onClick)="saveCategory()" />
      </ng-template>
    </p-dialog>

    <!-- Dialog Grupo -->
    <p-dialog [(visible)]="groupDialog" [modal]="true" [style]="{ width: '34rem', maxWidth: '96vw' }" [header]="groupForm.id ? 'Editar grupo' : 'Nuevo grupo'">
      <div class="form">
        <div class="ctx">Tipo: <b>{{ tipo() === 'SERVICIO' ? 'Servicios' : 'Penalidades' }}</b></div>
        <label>Categoría *</label>
        <p-select [options]="categoryOpts()" optionLabel="label" optionValue="value" [(ngModel)]="groupForm.categoryId" appendTo="body" styleClass="w" placeholder="Elegir categoría" />
        @if (groupForm.id) { <p class="hint"><i class="pi pi-info-circle"></i> Si cambias la categoría, los conceptos del grupo se trasladan con él.</p> }
        <label>Nombre *</label>
        <input pInputText [(ngModel)]="groupForm.name" maxlength="120" placeholder="Ej: Desayunos" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="groupForm.description" maxlength="300" placeholder="Descripción opcional del grupo" />
        <div class="row2">
          <div><label>Orden</label><p-inputNumber [(ngModel)]="groupForm.sortOrder" [min]="0" styleClass="w" /></div>
          <div><label>Estado</label><p-select [options]="statusEditOpts" optionLabel="label" optionValue="value" [(ngModel)]="groupForm.status" styleClass="w" /></div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="groupDialog = false" />
        <p-button [label]="groupForm.id ? 'Guardar' : 'Crear grupo'" icon="pi pi-check" [loading]="saving()" (onClick)="saveGroup()" />
      </ng-template>
    </p-dialog>

    <!-- Dialog Concepto -->
    <p-dialog [(visible)]="conceptDialog" [modal]="true" [style]="{ width: '46rem', maxWidth: '97vw' }" [header]="conceptForm.id ? 'Editar concepto' : 'Nuevo concepto'">
      <div class="form">
        <div class="ctx">{{ tipo() === 'SERVICIO' ? 'Servicios' : 'Penalidades' }} › {{ ctxCategoryName() }} › <b>{{ ctxGroupName() }}</b></div>

        <div class="sec">Datos generales</div>
        @if (conceptForm.id) {
          <label>Grupo</label>
          <p-select [options]="groupOpts()" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.groupId" appendTo="body" styleClass="w" />
          <p class="hint"><i class="pi pi-info-circle"></i> Puedes mover el concepto a otro grupo del mismo tipo; conserva su código y vínculos.</p>
        }
        <div class="row2">
          <div><label>Código *</label><input pInputText [(ngModel)]="conceptForm.code" maxlength="40" placeholder="Ej: DES-001" /></div>
          <div><label>Precio (S/) *</label><p-inputNumber [(ngModel)]="conceptForm.price" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w" /></div>
        </div>
        <label>Nombre *</label>
        <input pInputText [(ngModel)]="conceptForm.name" maxlength="160" placeholder="Ej: Desayuno Americano" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="conceptForm.description" maxlength="300" placeholder="Descripción opcional del concepto" />
        <div class="row3">
          <div><label>Unidad de cobro</label><p-select [options]="unitOpts" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.unit" appendTo="body" styleClass="w" /></div>
          <div><label>Orden</label><p-inputNumber [(ngModel)]="conceptForm.sortOrder" [min]="0" styleClass="w" /></div>
          <div><label>Estado</label><p-select [options]="statusEditOpts" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.status" styleClass="w" /></div>
        </div>

        <div class="sec">Funcionamiento</div>
        <div class="flags">
          @if (tipo() === 'SERVICIO') {
            <label class="chk"><input type="checkbox" [(ngModel)]="conceptForm.allowCourtesy" /> Permitir cortesía</label>
          }
          <label class="chk"><input type="checkbox" [(ngModel)]="conceptForm.allowFreeAmount" /> Permitir monto libre</label>
        </div>

        <label>Modalidad de atención</label>
        <p-select [options]="attentionOpts()" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.attentionMode" appendTo="body" styleClass="w" />

        @if (conceptForm.attentionMode === 'LINEN_EXTRA') {
          <div class="linen-box">
            <label>Artículo vinculado *</label>
            <p-select [options]="linenOpts()" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.productId" [filter]="true" filterBy="label" appendTo="body" styleClass="w" placeholder="Elegir artículo (toalla, sábana, frazada…)" />
            @if (selectedArticle(); as a) {
              <div class="art-info"><span>{{ a.name }}</span>@if (a.category?.name) { <em>{{ a.category!.name }}</em> }</div>
            }
            <ul class="linen-rules">
              <li>Unidad de cobro: <b>unidad</b>.</li>
              <li>Origen del stock: <b>almacén vinculado a la habitación</b> (se resuelve en recepción al elegir la habitación).</li>
              <li>Requiere confirmación de entrega por cleaning: <b>sí</b>.</li>
              <li>Requiere control de devolución: <b>sí</b>.</li>
              <li>El precio de alquiler se administra aquí (en el concepto): es la fuente única.</li>
            </ul>
          </div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="conceptDialog = false" />
        <p-button [label]="conceptForm.id ? 'Guardar' : 'Crear concepto'" icon="pi pi-check" [loading]="saving()" (onClick)="saveConcept()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .sc { padding: 1.25rem; color: #e6edf6; }
    .muted { color: #8aa0bd; } .center { text-align: center; } .pad { padding: 1rem; } .sm { font-size: .82rem; }
    .sc-head h1 { margin: 0; font-size: 1.3rem; letter-spacing: .5px; } .sc-head .muted { margin: .2rem 0 0; }
    .tabs { display: flex; gap: .4rem; margin: 1rem 0 .8rem; }
    .tab { background: #11203a; border: 1px solid #243a5c; color: #a9bcd6; border-radius: 9px; padding: .5rem 1rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: .4rem; }
    .tab.on { background: #0f2a22; border-color: #10b981; color: #6ee7b7; }
    .toolbar { display: flex; align-items: center; gap: .6rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .search { position: relative; flex: 1; min-width: 220px; } .search i { position: absolute; left: .6rem; top: 50%; transform: translateY(-50%); color: #6b84a6; } .search input { width: 100%; padding-left: 2rem; }
    .count { color: #8aa0bd; font-size: .8rem; }
    .btn { border: none; border-radius: 8px; padding: .5rem .9rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: .4rem; font-size: .85rem; }
    .btn.primary { background: #10b981; color: #052e22; } .btn.ghost { background: #16263f; color: #cfe0f5; border: 1px solid #284a73; } .btn.sm { padding: .35rem .7rem; font-size: .8rem; }
    .empty-box { border: 1px dashed #2b4a73; border-radius: 10px; padding: 1.4rem; text-align: center; color: #8aa0bd; }
    .cat { border: 1px solid #22334e; border-radius: 12px; margin-bottom: .7rem; background: #0e1a2d; overflow: hidden; }
    .cat.off { opacity: .68; }
    .cat-row { display: flex; align-items: center; gap: .6rem; padding: .85rem 1rem; cursor: pointer; }
    .cat-row:hover { background: #11203a; }
    .chev { color: #6b84a6; width: 1rem; } .fold { color: #3b82f6; font-size: 1.1rem; } .fold-g { color: #60a5fa; }
    .cat-main { flex: 1; min-width: 0; } .cat-name { font-weight: 700; } .cat-desc { color: #8aa0bd; font-size: .8rem; margin-top: .15rem; }
    .counts { color: #8aa0bd; font-size: .78rem; white-space: nowrap; }
    .acts { display: flex; gap: .2rem; } .ic { background: transparent; border: none; color: #9fb4d2; cursor: pointer; padding: .35rem; border-radius: 6px; } .ic:hover { background: #1b2d49; } .ic.danger:hover { color: #f87171; }
    .cat-body { padding: .3rem .8rem 1rem 1.6rem; border-top: 1px solid #1b2a42; }
    .sub-toolbar { padding: .5rem 0; }
    .grp { border: 1px solid #1f2f49; border-radius: 10px; margin-bottom: .5rem; background: #0c1626; }
    .grp.off { opacity: .68; }
    .grp-row { display: flex; align-items: center; gap: .6rem; padding: .6rem .8rem; cursor: pointer; } .grp-row:hover { background: #101e34; }
    .grp-main { flex: 1; min-width: 0; } .grp-name { font-weight: 600; } .grp-desc { color: #8aa0bd; font-size: .76rem; }
    .grp-body { padding: .2rem .6rem .7rem 1.4rem; border-top: 1px solid #16263f; }
    .ctbl { width: 100%; border-collapse: collapse; font-size: .84rem; }
    .ctbl th { text-align: left; color: #7f97b8; font-weight: 600; font-size: .72rem; text-transform: uppercase; letter-spacing: .4px; padding: .4rem .5rem; border-bottom: 1px solid #1d2d47; }
    .ctbl td { padding: .45rem .5rem; border-bottom: 1px solid #16233a; } .ctbl tr.off td { opacity: .6; }
    .ctbl .r { text-align: right; } .ctbl .c { text-align: center; } .nowrap { white-space: nowrap; }
    .code { font-family: ui-monospace, monospace; color: #9fb4d2; } .price { color: #34d399; font-weight: 600; }
    .mtag { background: #16263f; color: #a9bcd6; border-radius: 6px; padding: .12rem .5rem; font-size: .74rem; } .mtag.linen { background: #0f2a22; color: #6ee7b7; }
    .pill { font-size: .7rem; font-weight: 700; border-radius: 999px; padding: .1rem .5rem; } .pill.on { background: rgba(16,185,129,.2); color: #34d399; } .pill.off { background: rgba(148,163,184,.2); color: #cbd5e1; }
    .lnk { background: none; border: none; color: #60a5fa; cursor: pointer; font-size: .8rem; padding: .1rem .35rem; } .lnk:hover { text-decoration: underline; } .lnk.red { color: #f87171; }
    .form { display: flex; flex-direction: column; gap: .4rem; } .form label { font-size: .78rem; color: #a9bcd6; margin-top: .3rem; }
    .form input, .form :global(.w) { width: 100%; }
    .ctx { background: #11203a; border: 1px solid #243a5c; border-radius: 8px; padding: .45rem .7rem; font-size: .8rem; color: #a9bcd6; }
    .sec { margin-top: .6rem; font-weight: 700; color: #cfe0f5; border-bottom: 1px solid #22334e; padding-bottom: .25rem; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; } .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: .6rem; }
    .flags { display: flex; gap: 1.2rem; flex-wrap: wrap; padding: .2rem 0; } .chk { display: flex; align-items: center; gap: .4rem; font-size: .85rem; color: #cfe0f5; cursor: pointer; } .chk input { width: auto; }
    .hint { color: #8aa0bd; font-size: .76rem; margin: .1rem 0; }
    .linen-box { border: 1px solid #214a3c; background: #0c1f19; border-radius: 10px; padding: .7rem; margin-top: .4rem; }
    .art-info { display: flex; justify-content: space-between; align-items: center; background: #0f2a22; border-radius: 6px; padding: .35rem .6rem; margin-top: .3rem; font-size: .82rem; } .art-info em { color: #8aa0bd; font-style: normal; }
    .linen-rules { margin: .5rem 0 0; padding-left: 1.1rem; color: #9fb4d2; font-size: .78rem; } .linen-rules b { color: #cfe0f5; }
  `],
})
export class ItemsComponent implements OnInit {
  private readonly api = inject(ServiceCatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly tipo = signal<ServiceTipo>('SERVICIO');
  readonly tree = signal<SCCategory[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly search = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly expandedCats = signal<Set<string>>(new Set());
  readonly expandedGroups = signal<Set<string>>(new Set());
  readonly linenArticles = signal<LinenArticle[]>([]);

  readonly statusOpts = [{ label: 'Todos', value: 'all' }, { label: 'Activos', value: 'active' }, { label: 'Inactivos', value: 'inactive' }];
  readonly statusEditOpts = [{ label: 'Activo', value: 'active' }, { label: 'Inactivo', value: 'inactive' }];
  readonly unitOpts = (Object.keys(UNIT_LABEL) as ConceptUnit[]).map((k) => ({ label: UNIT_LABEL[k], value: k }));

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  // Diálogos
  catDialog = false; groupDialog = false; conceptDialog = false;
  catForm: CatForm = this.emptyCat();
  groupForm: GroupForm = this.emptyGroup();
  conceptForm: ConceptForm = this.emptyConcept();
  private ctxCat = signal<SCCategory | null>(null);
  private ctxGroup = signal<SCGroup | null>(null);

  ngOnInit(): void {
    this.reload();
    this.api.linenArticles().subscribe({ next: (r) => this.linenArticles.set(r.data ?? []), error: () => undefined });
  }

  // ── Carga / filtro ──
  reload(): void {
    this.loading.set(true);
    this.api.tree(this.tipo()).subscribe({
      next: (r) => { this.tree.set(r.data ?? []); this.loading.set(false); },
      error: () => { this.tree.set([]); this.loading.set(false); },
    });
  }
  setTipo(t: ServiceTipo): void { if (t === this.tipo()) return; this.tipo.set(t); this.search.set(''); this.reload(); }

  private norm(s: string | null | undefined): string { return (s ?? '').trim().toLowerCase(); }
  asNum(v: string | number): number { return Number(v); }
  conceptCount(cat: SCCategory): number { return cat.groups.reduce((a, g) => a + g.concepts.length, 0); }

  readonly filteredTree = computed<SCCategory[]>(() => {
    const q = this.norm(this.search());
    const sf = this.statusFilter();
    const stOk = (st: CatalogStatus) => sf === 'all' || st === sf;
    const txt = (...vals: (string | null | undefined)[]) => !q || vals.some((v) => this.norm(v).includes(q));
    const out: SCCategory[] = [];
    for (const cat of this.tree()) {
      const catText = txt(cat.name);
      const groups: SCGroup[] = [];
      for (const g of cat.groups) {
        const gText = txt(g.name) || catText;
        const concepts = g.concepts.filter((c) => stOk(c.status) && (txt(c.name, c.code) || gText));
        if (concepts.length || (stOk(g.status) && (txt(g.name) || catText))) groups.push({ ...g, concepts });
      }
      if (groups.length || (stOk(cat.status) && catText)) out.push({ ...cat, groups });
    }
    return out;
  });

  // ── Expand/collapse (en búsqueda, todo expandido) ──
  isCatOpen(id: string): boolean { return !!this.search() || this.expandedCats().has(id); }
  isGroupOpen(id: string): boolean { return !!this.search() || this.expandedGroups().has(id); }
  toggleCat(id: string): void { const s = new Set(this.expandedCats()); s.has(id) ? s.delete(id) : s.add(id); this.expandedCats.set(s); }
  toggleGroup(id: string): void { const s = new Set(this.expandedGroups()); s.has(id) ? s.delete(id) : s.add(id); this.expandedGroups.set(s); }

  // ── Opciones de selección para los diálogos ──
  readonly categoryOpts = computed(() => this.tree().map((c) => ({ label: c.name, value: c.id })));
  readonly groupOpts = computed(() => this.tree().flatMap((c) => c.groups.map((g) => ({ label: `${c.name} › ${g.name}`, value: g.id }))));
  readonly attentionOpts = computed(() => {
    const opts = [{ label: ATTENTION_LABEL.NONE, value: 'NONE' as AttentionMode }];
    if (this.tipo() === 'SERVICIO') opts.push({ label: ATTENTION_LABEL.LINEN_EXTRA, value: 'LINEN_EXTRA' });
    return opts;
  });
  readonly linenOpts = computed(() => this.linenArticles().map((a) => ({ label: a.category?.name ? `${a.name} — ${a.category.name}` : a.name, value: a.id })));
  selectedArticle(): LinenArticle | null { return this.linenArticles().find((a) => a.id === this.conceptForm.productId) ?? null; }
  ctxCategoryName(): string { return this.ctxCat()?.name ?? '—'; }
  ctxGroupName(): string { return this.ctxGroup()?.name ?? '—'; }

  // ── Empty forms ──
  private emptyCat(): CatForm { return { name: '', description: '', sortOrder: 0, status: 'active' }; }
  private emptyGroup(): GroupForm { return { categoryId: '', name: '', description: '', sortOrder: 0, status: 'active' }; }
  private emptyConcept(): ConceptForm {
    return { groupId: '', code: '', name: '', description: '', price: null, unit: 'UNIDAD', sortOrder: 0, status: 'active', allowCourtesy: false, allowFreeAmount: false, attentionMode: 'NONE', productId: null };
  }

  // ── Categorías ──
  openNewCategory(): void { this.catForm = this.emptyCat(); this.catDialog = true; }
  openEditCategory(cat: SCCategory): void { this.catForm = { id: cat.id, name: cat.name, description: cat.description ?? '', sortOrder: cat.sortOrder, status: cat.status }; this.catDialog = true; }
  saveCategory(): void {
    if (!this.catForm.name.trim()) { this.toastWarn('El nombre es obligatorio.'); return; }
    const body = { tipo: this.tipo(), name: this.catForm.name, description: this.catForm.description, sortOrder: this.catForm.sortOrder, status: this.catForm.status };
    this.run(this.catForm.id ? this.api.updateCategory(this.catForm.id, body) : this.api.createCategory(body), () => { this.catDialog = false; });
  }
  toggleCatStatus(cat: SCCategory): void { this.run(this.api.updateCategory(cat.id, { status: cat.status === 'active' ? 'inactive' : 'active' })); }
  deleteCategory(cat: SCCategory): void {
    this.confirm.confirm({ header: 'Eliminar categoría', message: `¿Eliminar "${cat.name}"?`, icon: 'pi pi-exclamation-triangle', acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger', accept: () => this.run(this.api.deleteCategory(cat.id)) });
  }

  // ── Grupos ──
  openNewGroup(cat: SCCategory): void { this.ctxCat.set(cat); this.groupForm = { ...this.emptyGroup(), categoryId: cat.id }; this.groupDialog = true; }
  openEditGroup(cat: SCCategory, g: SCGroup): void { this.ctxCat.set(cat); this.groupForm = { id: g.id, categoryId: g.categoryId, name: g.name, description: g.description ?? '', sortOrder: g.sortOrder, status: g.status }; this.groupDialog = true; }
  saveGroup(): void {
    if (!this.groupForm.categoryId) { this.toastWarn('Elige una categoría.'); return; }
    if (!this.groupForm.name.trim()) { this.toastWarn('El nombre es obligatorio.'); return; }
    const body = { categoryId: this.groupForm.categoryId, name: this.groupForm.name, description: this.groupForm.description, sortOrder: this.groupForm.sortOrder, status: this.groupForm.status };
    this.run(this.groupForm.id ? this.api.updateGroup(this.groupForm.id, body) : this.api.createGroup(body), () => { this.groupDialog = false; });
  }
  toggleGroupStatus(g: SCGroup): void { this.run(this.api.updateGroup(g.id, { status: g.status === 'active' ? 'inactive' : 'active' })); }
  deleteGroup(g: SCGroup): void {
    this.confirm.confirm({ header: 'Eliminar grupo', message: `¿Eliminar "${g.name}"?`, icon: 'pi pi-exclamation-triangle', acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger', accept: () => this.run(this.api.deleteGroup(g.id)) });
  }

  // ── Conceptos ──
  openNewConcept(cat: SCCategory, g: SCGroup): void { this.ctxCat.set(cat); this.ctxGroup.set(g); this.conceptForm = { ...this.emptyConcept(), groupId: g.id }; this.conceptDialog = true; }
  openEditConcept(cat: SCCategory, g: SCGroup, c: SCConcept): void {
    this.ctxCat.set(cat); this.ctxGroup.set(g);
    this.conceptForm = { id: c.id, groupId: c.groupId, code: c.code, name: c.name, description: c.description ?? '', price: Number(c.price), unit: c.unit, sortOrder: c.sortOrder, status: c.status, allowCourtesy: c.allowCourtesy, allowFreeAmount: c.allowFreeAmount, attentionMode: c.attentionMode, productId: c.productId ?? null };
    this.conceptDialog = true;
  }
  saveConcept(): void {
    const f = this.conceptForm;
    if (!f.code.trim()) { this.toastWarn('El código es obligatorio.'); return; }
    if (!f.name.trim()) { this.toastWarn('El nombre es obligatorio.'); return; }
    if (f.price == null || f.price < 0) { this.toastWarn('Ingresa un precio válido (puede ser 0).'); return; }
    if (f.attentionMode === 'LINEN_EXTRA' && !f.productId) { this.toastWarn('Vincula un artículo para la entrega de ropa adicional.'); return; }
    const body = {
      groupId: f.groupId, code: f.code, name: f.name, description: f.description, price: f.price, unit: f.unit, sortOrder: f.sortOrder, status: f.status,
      allowCourtesy: this.tipo() === 'SERVICIO' ? f.allowCourtesy : false, allowFreeAmount: f.allowFreeAmount,
      attentionMode: f.attentionMode, productId: f.attentionMode === 'LINEN_EXTRA' ? f.productId : null,
    };
    this.run(f.id ? this.api.updateConcept(f.id, body) : this.api.createConcept(body), () => { this.conceptDialog = false; });
  }
  toggleConceptStatus(c: SCConcept): void { this.run(this.api.updateConcept(c.id, { status: c.status === 'active' ? 'inactive' : 'active' })); }
  deleteConcept(c: SCConcept): void {
    this.confirm.confirm({ header: 'Eliminar concepto', message: `¿Eliminar "${c.name}"?`, icon: 'pi pi-exclamation-triangle', acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger', accept: () => this.run(this.api.deleteConcept(c.id)) });
  }

  // ── Helpers de ejecución ──
  private run(obs: ReturnType<ServiceCatalogApiService['createCategory']>, onOk?: () => void): void {
    this.saving.set(true);
    obs.subscribe({
      next: () => { this.saving.set(false); onOk?.(); this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Cambios guardados.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
  private toastWarn(detail: string): void { this.messages.add({ severity: 'warn', summary: 'Revisa', detail }); }
}
