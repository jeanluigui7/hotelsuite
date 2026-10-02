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
  ATTENTION_LABEL, ORIGIN_LABEL, UNIT_LABEL,
  type ArticleScope, type AttentionMode, type CatalogStatus, type ConceptUnit, type InvArticle, type InvCategory,
  type InventoryOrigin, type SCCategory, type SCConcept, type SCGroup, type ServiceTipo,
} from './service-catalog.models';

interface CatForm { id?: string; name: string; description: string; sortOrder: number; status: CatalogStatus; }
interface GroupForm { id?: string; categoryId: string; name: string; description: string; sortOrder: number; status: CatalogStatus; }
interface ConceptForm {
  id?: string; groupId: string; code: string; name: string; description: string; price: number | null;
  unit: ConceptUnit; sortOrder: number; status: CatalogStatus; allowCourtesy: boolean; allowFreeAmount: boolean;
  attentionMode: AttentionMode;
  inventoryOrigin: InventoryOrigin | null;
  inventoryCategoryId: string | null;
  articleScope: ArticleScope;
  selectedIds: string[];
  prices: Record<string, number | null>;
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
                            <thead><tr><th>Código</th><th>Nombre</th><th class="r">Precio</th><th>Modalidad</th><th>Vinculación</th><th class="c">Estado</th><th class="c">Acciones</th></tr></thead>
                            <tbody>
                              @for (c of g.concepts; track c.id) {
                                <tr [class.off]="c.status === 'inactive'">
                                  <td class="code">{{ c.code }}</td>
                                  <td>{{ c.name }}@if (c.linkNeedsReview) { <span class="pill warn" title="Vínculo heredado por revisar">revisar</span> }</td>
                                  <td class="r price">S/ {{ asNum(c.price) | number: '1.2-2' }}</td>
                                  <td>@if (c.attentionMode === 'LINEN_EXTRA') { <span class="mtag linen"><i class="pi pi-inbox"></i> Adicionales</span> } @else { <span class="mtag">Directo</span> }</td>
                                  <td>{{ linkSummary(c) }}</td>
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
          <div><label>Código *</label><input pInputText [(ngModel)]="conceptForm.code" maxlength="40" placeholder="Ej: TOA-001" /></div>
          <div><label>Precio base (S/) *</label><p-inputNumber [(ngModel)]="conceptForm.price" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w" /></div>
        </div>
        <label>Nombre *</label>
        <input pInputText [(ngModel)]="conceptForm.name" maxlength="160" placeholder="Ej: Toalla adicional" />
        <div class="row2">
          <div><label>Estado</label><p-select [options]="statusEditOpts" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.status" appendTo="body" styleClass="w" /></div>
          <div class="flags-col">
            @if (tipo() === 'SERVICIO') { <label class="chk"><input type="checkbox" [(ngModel)]="conceptForm.allowCourtesy" /> Permitir cortesía</label> }
            <label class="chk"><input type="checkbox" [(ngModel)]="conceptForm.allowFreeAmount" /> Permitir monto libre</label>
          </div>
        </div>

        <label>Modalidad de atención</label>
        <p-select [options]="attentionOpts()" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.attentionMode" (onChange)="onAttentionChange()" appendTo="body" styleClass="w" />

        @if (conceptForm.attentionMode === 'LINEN_EXTRA') {
          <div class="sec">Vinculación con inventario</div>

          <label>Origen del inventario *</label>
          <p-select [options]="originOpts" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.inventoryOrigin" (onChange)="onOriginChange($event.value)" appendTo="body" styleClass="w" placeholder="Elegir origen (Ropa o Amenities)" />

          @if (conceptForm.inventoryOrigin) {
            <label>{{ catLabel() }} *</label>
            <p-select [options]="invCategoryOpts()" optionLabel="label" optionValue="value" [ngModel]="conceptForm.inventoryCategoryId" (onChange)="onCategoryChange($event.value)" appendTo="body" styleClass="w" [loading]="loadingCats()" placeholder="Elegir {{ catLabel().toLowerCase() }}" />
            @if (!invCategoryOpts().length && !loadingCats()) {
              <p class="hint warn"><i class="pi pi-exclamation-triangle"></i> No hay {{ catLabel().toLowerCase() }} en el inventario de {{ originLabel() }}. Configúralo en Inventario › Categorías.</p>
            }
          }

          @if (catReady()) {
            <label>Artículos incluidos</label>
            <div class="scope">
              <label class="rad"><input type="radio" name="scope" value="ALL" [(ngModel)]="conceptForm.articleScope" (ngModelChange)="onScopeChange()" /> Todos los artículos activos</label>
              <label class="rad"><input type="radio" name="scope" value="SPECIFIC" [(ngModel)]="conceptForm.articleScope" (ngModelChange)="onScopeChange()" /> Seleccionar artículos específicos</label>
            </div>

            @if (conceptForm.articleScope === 'SPECIFIC') {
              <div class="art-search"><i class="pi pi-search"></i><input pInputText [ngModel]="articleSearch()" (ngModelChange)="articleSearch.set($event)" placeholder="Buscar artículo…" /></div>
              <div class="art-list">
                @if (loadingArts()) { <p class="muted sm pad">Cargando…</p> }
                @for (a of filteredArticles(); track a.id) {
                  <label class="art-row"><input type="checkbox" [checked]="isSelected(a.id)" (change)="toggleArticle(a.id)" /> <span>{{ a.name }}</span>@if (artCode(a)) { <em>{{ artCode(a) }}</em> }</label>
                } @empty { <p class="muted sm pad">Sin artículos activos en este {{ catLabel().toLowerCase() }}.</p> }
              </div>
            }

            <!-- Vista previa -->
            <div class="preview">
              <div class="pv-h">Vista previa — {{ includedArticles().length }} artículo(s) incluido(s)</div>
              @if (conceptForm.articleScope === 'ALL') { <p class="hint"><i class="pi pi-info-circle"></i> Los nuevos artículos activos de este {{ catLabel().toLowerCase() }} se incluirán automáticamente.</p> }
              <div class="pv-list">
                @for (a of includedArticles(); track a.id) { <span class="pv-chip">{{ a.name }}@if (artCode(a)) { <em>{{ artCode(a) }}</em> }</span> }
                @if (!includedArticles().length) { <span class="muted sm">Aún sin artículos (podrás guardarlo, pero no habrá opciones en recepción).</span> }
              </div>
            </div>

            <!-- Precios por artículo (opcional) -->
            <button type="button" class="more" (click)="pricesOpen = !pricesOpen"><i class="pi" [class.pi-chevron-down]="pricesOpen" [class.pi-chevron-right]="!pricesOpen"></i> Precios por artículo (opcional)</button>
            @if (pricesOpen) {
              <p class="hint">Si un artículo tiene precio específico, se usa ese; si no, el precio base del concepto. No se suman.</p>
              <div class="price-list">
                @for (a of includedArticles(); track a.id) {
                  <div class="price-row"><span>{{ a.name }}</span><p-inputNumber [ngModel]="priceOf(a.id)" (ngModelChange)="setPrice(a.id, $event)" mode="decimal" [minFractionDigits]="2" [min]="0" [placeholder]="basePlaceholder()" styleClass="w sm" /></div>
                }
              </div>
            }

            <!-- Resumen informativo -->
            <div class="summary">
              @if (conceptForm.inventoryOrigin === 'ROPA') {
                <div><b>Ropa</b> · Entrega por cleaning: sí · Control posterior: prenda retornable de la habitación.</div>
                <p class="hint"><i class="pi pi-info-circle"></i> Stock por habitación: se usa el almacén vinculado a la habitación (no el piso). No se exige stock para guardar.</p>
              } @else {
                <div><b>Amenities</b> · Entrega por cleaning: sí · Control posterior: consumible, sin devolución.</div>
                <p class="hint"><i class="pi pi-info-circle"></i> El almacén de amenities se resuelve según su organización real (compartido o por habitación). No se exige stock para guardar.</p>
              }
            </div>
          }
        }

        <!-- Más opciones -->
        <button type="button" class="more" (click)="moreOpen = !moreOpen"><i class="pi" [class.pi-chevron-down]="moreOpen" [class.pi-chevron-right]="!moreOpen"></i> Más opciones</button>
        @if (moreOpen) {
          <label>Descripción</label>
          <input pInputText [(ngModel)]="conceptForm.description" maxlength="300" placeholder="Descripción opcional del concepto" />
          <div class="row2">
            <div><label>Unidad de cobro</label><p-select [options]="unitOpts" optionLabel="label" optionValue="value" [(ngModel)]="conceptForm.unit" appendTo="body" styleClass="w" /></div>
            <div><label>Orden</label><p-inputNumber [(ngModel)]="conceptForm.sortOrder" [min]="0" styleClass="w" /></div>
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
    .flags-col { display: flex; flex-direction: column; gap: .3rem; justify-content: flex-end; }
    .hint { color: #8aa0bd; font-size: .76rem; margin: .1rem 0; } .hint.warn { color: #fbbf24; }
    .pill.warn { background: rgba(245,158,11,.2); color: #fbbf24; margin-left: .35rem; }
    .scope { display: flex; gap: 1.2rem; flex-wrap: wrap; padding: .2rem 0; } .rad { display: flex; align-items: center; gap: .4rem; font-size: .84rem; color: #cfe0f5; cursor: pointer; } .rad input { width: auto; }
    .art-search { position: relative; } .art-search i { position: absolute; left: .55rem; top: 50%; transform: translateY(-50%); color: #6b84a6; } .art-search input { width: 100%; padding-left: 1.9rem; }
    .art-list { max-height: 180px; overflow-y: auto; border: 1px solid #22334e; border-radius: 8px; padding: .3rem; margin-top: .3rem; }
    .art-row { display: flex; align-items: center; gap: .5rem; padding: .25rem .35rem; font-size: .84rem; color: #e6edf6; cursor: pointer; border-radius: 6px; } .art-row:hover { background: #11203a; } .art-row input { width: auto; } .art-row em { color: #8aa0bd; font-style: normal; margin-left: auto; font-size: .76rem; }
    .preview { border: 1px solid #214a3c; background: #0c1f19; border-radius: 8px; padding: .55rem .7rem; margin-top: .4rem; } .pv-h { font-size: .78rem; color: #6ee7b7; font-weight: 700; }
    .pv-list { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .35rem; } .pv-chip { background: #11203a; border: 1px solid #243a5c; border-radius: 999px; padding: .12rem .55rem; font-size: .76rem; color: #cfe0f5; } .pv-chip em { color: #8aa0bd; font-style: normal; margin-left: .3rem; }
    .more { background: none; border: none; color: #60a5fa; cursor: pointer; font-size: .82rem; text-align: left; padding: .35rem 0; display: flex; align-items: center; gap: .4rem; }
    .price-list { display: flex; flex-direction: column; gap: .3rem; } .price-row { display: grid; grid-template-columns: 1fr 10rem; align-items: center; gap: .5rem; font-size: .84rem; }
    .summary { border: 1px solid #22334e; border-radius: 8px; padding: .5rem .7rem; margin-top: .4rem; font-size: .82rem; color: #cfe0f5; } .summary b { color: #fff; }
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
  // Vinculación con inventario (dialog de concepto)
  readonly invCategories = signal<InvCategory[]>([]);
  readonly invArticles = signal<InvArticle[]>([]);
  readonly loadingCats = signal(false);
  readonly loadingArts = signal(false);
  readonly articleSearch = signal('');
  moreOpen = false;
  pricesOpen = false;
  private prevOrigin: InventoryOrigin | null = null;
  private prevCategoryId: string | null = null;

  readonly originOpts = [{ label: 'Ropa', value: 'ROPA' as InventoryOrigin }, { label: 'Amenities', value: 'AMENITY' as InventoryOrigin }];

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
  ctxCategoryName(): string { return this.ctxCat()?.name ?? '—'; }
  ctxGroupName(): string { return this.ctxGroup()?.name ?? '—'; }

  // ── Vinculación con inventario (dialog concepto) ──
  originLabel(): string { return this.conceptForm.inventoryOrigin ? ORIGIN_LABEL[this.conceptForm.inventoryOrigin] : ''; }
  catLabel(): string { return this.conceptForm.inventoryOrigin === 'ROPA' ? 'Tipo de prenda' : 'Grupo de artículos'; }
  readonly invCategoryOpts = computed(() => {
    const opts = this.invCategories().map((c) => ({ label: c.name, value: c.id }));
    // Amenities admite "Todos los amenities" (categoría null, representada como '').
    if (this.conceptForm.inventoryOrigin === 'AMENITY') return [{ label: 'Todos los amenities', value: '' }, ...opts];
    return opts;
  });
  /** Listo para elegir artículos: ropa exige una categoría; amenity admite categoría o "todos" ('' ). */
  catReady(): boolean {
    const f = this.conceptForm;
    if (!f.inventoryOrigin) return false;
    if (f.inventoryOrigin === 'ROPA') return !!f.inventoryCategoryId;
    return f.inventoryCategoryId !== null; // '' (todos) o un id
  }
  readonly filteredArticles = computed<InvArticle[]>(() => {
    const q = this.norm(this.articleSearch());
    return this.invArticles().filter((a) => !q || this.norm(a.name).includes(q) || this.norm(this.artCode(a)).includes(q));
  });
  isSelected(id: string): boolean { return this.conceptForm.selectedIds.includes(id); }
  toggleArticle(id: string): void {
    const sel = this.conceptForm.selectedIds;
    this.conceptForm.selectedIds = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
  }
  includedArticles(): InvArticle[] {
    return this.conceptForm.articleScope === 'ALL' ? this.invArticles() : this.invArticles().filter((a) => this.isSelected(a.id));
  }
  artCode(a: InvArticle): string { return a.code || a.sku || ''; }
  priceOf(id: string): number | null { return this.conceptForm.prices[id] ?? null; }
  setPrice(id: string, v: number | null): void { this.conceptForm.prices = { ...this.conceptForm.prices, [id]: v ?? null }; }
  basePlaceholder(): string { return this.conceptForm.price != null ? `base S/ ${this.conceptForm.price.toFixed(2)}` : 'precio base'; }
  private hasLinkEdits(): boolean { return this.conceptForm.selectedIds.length > 0 || Object.values(this.conceptForm.prices).some((p) => p != null); }

  onAttentionChange(): void {
    if (this.conceptForm.attentionMode !== 'LINEN_EXTRA') {
      this.conceptForm.inventoryOrigin = null; this.conceptForm.inventoryCategoryId = null;
      this.conceptForm.articleScope = 'ALL'; this.conceptForm.selectedIds = []; this.conceptForm.prices = {};
      this.invCategories.set([]); this.invArticles.set([]);
    } else if (this.conceptForm.inventoryOrigin) {
      this.loadInvCategories(this.conceptForm.inventoryOrigin);
      if (this.catReady()) this.loadInvArticles();
    }
  }
  onOriginChange(origin: InventoryOrigin): void {
    const apply = () => {
      this.prevOrigin = origin;
      this.conceptForm.inventoryOrigin = origin;
      this.conceptForm.inventoryCategoryId = null;
      this.conceptForm.articleScope = 'ALL'; this.conceptForm.selectedIds = []; this.conceptForm.prices = {};
      this.invArticles.set([]);
      this.loadInvCategories(origin);
    };
    if (origin !== this.prevOrigin && this.hasLinkEdits()) {
      this.confirmDiscard(apply, () => { this.conceptForm.inventoryOrigin = this.prevOrigin; });
    } else apply();
  }
  onCategoryChange(categoryId: string): void {
    const apply = () => {
      this.prevCategoryId = categoryId;
      this.conceptForm.inventoryCategoryId = categoryId;
      this.conceptForm.selectedIds = []; this.conceptForm.prices = {};
      this.loadInvArticles();
    };
    if (categoryId !== this.prevCategoryId && this.hasLinkEdits()) {
      this.confirmDiscard(apply, () => { this.conceptForm.inventoryCategoryId = this.prevCategoryId; });
    } else apply();
  }
  onScopeChange(): void { /* el alcance no descarta datos; la vista previa se recalcula */ }

  private confirmDiscard(onAccept: () => void, onReject: () => void): void {
    this.confirm.confirm({
      header: 'Descartar selección', message: 'Cambiar esto descartará los artículos y precios que configuraste. ¿Continuar?',
      icon: 'pi pi-exclamation-triangle', acceptLabel: 'Sí, descartar', rejectLabel: 'Cancelar',
      accept: onAccept, reject: onReject,
    });
  }
  private loadInvCategories(origin: InventoryOrigin): void {
    this.loadingCats.set(true);
    this.api.inventoryCategories(origin).subscribe({
      next: (r) => { this.invCategories.set(r.data ?? []); this.loadingCats.set(false); },
      error: () => { this.invCategories.set([]); this.loadingCats.set(false); },
    });
  }
  private loadInvArticles(): void {
    const f = this.conceptForm;
    if (!f.inventoryOrigin) return;
    const catId = f.inventoryCategoryId === '' ? null : f.inventoryCategoryId;
    this.loadingArts.set(true);
    this.api.inventoryArticles(f.inventoryOrigin, catId).subscribe({
      next: (r) => { this.invArticles.set(r.data ?? []); this.loadingArts.set(false); },
      error: () => { this.invArticles.set([]); this.loadingArts.set(false); },
    });
  }
  /** Resumen de vinculación para la tabla. */
  linkSummary(c: SCConcept): string {
    if (c.attentionMode !== 'LINEN_EXTRA') return '—';
    const origin = c.inventoryOrigin === 'AMENITY' ? 'Amenities' : 'Ropa';
    const cat = c.inventoryCategory?.name || (c.inventoryOrigin === 'AMENITY' ? 'Todos' : '—');
    const scope = c.articleScope === 'SPECIFIC' ? `${c.articles.length} específicos` : 'todos';
    return `${origin} · ${cat} · ${scope}`;
  }

  // ── Empty forms ──
  private emptyCat(): CatForm { return { name: '', description: '', sortOrder: 0, status: 'active' }; }
  private emptyGroup(): GroupForm { return { categoryId: '', name: '', description: '', sortOrder: 0, status: 'active' }; }
  private emptyConcept(): ConceptForm {
    return { groupId: '', code: '', name: '', description: '', price: null, unit: 'UNIDAD', sortOrder: 0, status: 'active', allowCourtesy: false, allowFreeAmount: false, attentionMode: 'NONE', inventoryOrigin: null, inventoryCategoryId: null, articleScope: 'ALL', selectedIds: [], prices: {} };
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
  openNewConcept(cat: SCCategory, g: SCGroup): void {
    this.ctxCat.set(cat); this.ctxGroup.set(g);
    this.conceptForm = { ...this.emptyConcept(), groupId: g.id };
    this.prevOrigin = null; this.prevCategoryId = null; this.moreOpen = false; this.pricesOpen = false;
    this.articleSearch.set(''); this.invCategories.set([]); this.invArticles.set([]);
    this.conceptDialog = true;
  }
  openEditConcept(cat: SCCategory, g: SCGroup, c: SCConcept): void {
    this.ctxCat.set(cat); this.ctxGroup.set(g);
    // Amenities "todos" se guarda como null en el backend → en el form es '' (opción "Todos los amenities").
    const catId = c.attentionMode === 'LINEN_EXTRA'
      ? (c.inventoryCategoryId ?? (c.inventoryOrigin === 'AMENITY' ? '' : null))
      : null;
    const prices: Record<string, number | null> = {};
    const selectedIds: string[] = [];
    for (const a of c.articles ?? []) { selectedIds.push(a.articleId); if (a.price != null) prices[a.articleId] = Number(a.price); }
    this.conceptForm = {
      id: c.id, groupId: c.groupId, code: c.code, name: c.name, description: c.description ?? '', price: Number(c.price),
      unit: c.unit, sortOrder: c.sortOrder, status: c.status, allowCourtesy: c.allowCourtesy, allowFreeAmount: c.allowFreeAmount,
      attentionMode: c.attentionMode, inventoryOrigin: c.inventoryOrigin ?? null, inventoryCategoryId: catId,
      articleScope: c.articleScope ?? 'ALL', selectedIds, prices,
    };
    this.prevOrigin = c.inventoryOrigin ?? null; this.prevCategoryId = catId;
    this.moreOpen = !!(c.description || c.sortOrder); this.pricesOpen = Object.keys(prices).length > 0;
    this.articleSearch.set(''); this.invCategories.set([]); this.invArticles.set([]);
    if (c.attentionMode === 'LINEN_EXTRA' && c.inventoryOrigin) {
      this.loadInvCategories(c.inventoryOrigin);
      if (catId !== null) this.loadInvArticles();
    }
    this.conceptDialog = true;
  }
  saveConcept(): void {
    const f = this.conceptForm;
    if (!f.code.trim()) { this.toastWarn('El código es obligatorio.'); return; }
    if (!f.name.trim()) { this.toastWarn('El nombre es obligatorio.'); return; }
    if (f.price == null || f.price < 0) { this.toastWarn('Ingresa un precio válido (puede ser 0).'); return; }
    const base = {
      groupId: f.groupId, code: f.code, name: f.name, description: f.description, price: f.price, unit: f.unit, sortOrder: f.sortOrder, status: f.status,
      allowCourtesy: this.tipo() === 'SERVICIO' ? f.allowCourtesy : false, allowFreeAmount: f.allowFreeAmount,
      attentionMode: f.attentionMode,
    };
    let body: Record<string, unknown> = { ...base };
    if (f.attentionMode === 'LINEN_EXTRA') {
      if (!f.inventoryOrigin) { this.toastWarn('Elige el origen del inventario (Ropa o Amenities).'); return; }
      if (f.inventoryOrigin === 'ROPA' && !f.inventoryCategoryId) { this.toastWarn('Elige el tipo de prenda.'); return; }
      if (f.articleScope === 'SPECIFIC' && f.selectedIds.length === 0) { this.toastWarn('Selecciona al menos un artículo o usa el alcance "Todos".'); return; }
      // Artículos a enviar: en SPECIFIC los seleccionados (con su precio); en ALL solo los que tienen precio override.
      const ids = f.articleScope === 'SPECIFIC' ? f.selectedIds : Object.keys(f.prices).filter((id) => f.prices[id] != null);
      const articles = ids.map((id) => ({ articleId: id, price: f.prices[id] ?? null }));
      body = {
        ...base,
        inventoryOrigin: f.inventoryOrigin,
        inventoryCategoryId: f.inventoryCategoryId === '' ? null : f.inventoryCategoryId,
        articleScope: f.articleScope,
        articles,
      };
    } else {
      body = { ...base, inventoryOrigin: null, inventoryCategoryId: null, articleScope: 'ALL', articles: [] };
    }
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
