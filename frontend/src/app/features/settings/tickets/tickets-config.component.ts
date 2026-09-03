import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { buildComandaTicket, sampleComandaData, SAMPLE_IDENTITY, identityFromBranch, type ComandaKind, type ComandaIdentity } from './comanda-ticket';

type Tab = 'comandas' | 'comprobantes' | 'operaciones' | 'impresion' | 'automatizaciones';
type Channel = 'PRINT' | 'WHATSAPP' | 'NONE';
interface Rule { enabled: boolean; channel: Channel; }
interface TicketsConfig {
  // visual/messages se conservan en backend por compatibilidad, pero ya no se editan aquí:
  // la visualización y los textos pertenecerán a cada documento cuando se hagan configurables.
  visual: Record<string, boolean>;
  messages: Record<string, string>;
  print: { paper: '58' | '80'; copies: number; autocut: boolean; defaultPrinter: string };
  automations: { checkin: Rule; pendingChange: Rule; cashClose: Rule; productTransfer: Rule; cleaningClose: Rule };
}

/** Un documento dentro de una familia. Estructura data-driven: agregar uno nuevo es sumar un objeto. */
interface DocDef { key: string; icon: string; label: string; desc: string; fields: string[]; note?: string; preview?: ComandaKind; }
interface Family { id: Tab; title: string; intro: string; docs: DocDef[]; }

@Component({
  selector: 'app-tickets-config',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, InputNumberModule, SelectModule, TagModule, DialogModule],
  template: `
    <section class="wrap">
      <header class="head">
        <h1><i class="pi pi-receipt"></i> Configuración de Tickets</h1>
        <p class="muted">
          RIZZOS genera tres naturalezas de documento — <b>Comandas</b> (información al huésped),
          <b>Comprobantes</b> (ventas/cobros) y <b>Operaciones</b> (control interno) — más dos capas de ejecución:
          <b>Impresión</b> (cómo/dónde) y <b>Automatizaciones</b> (cuándo). La identidad viene de
          <a routerLink="/settings/hotel">Hotel</a> y las credenciales de <a routerLink="/wifi/configuracion">WiFi</a>.
        </p>
      </header>

      <div class="tabs">
        @for (t of tabs; track t.id) {
          <button class="tab" [class.active]="tab() === t.id" (click)="tab.set(t.id)"><i class="pi" [class]="t.icon"></i> {{ t.label }}</button>
        }
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else { @let c = config();

        <!-- FAMILIAS DE DOCUMENTOS: COMANDAS / COMPROBANTES / OPERACIONES -->
        @for (fam of families; track fam.id) {
          @if (tab() === fam.id) {
            <p class="tab-desc">{{ fam.intro }}</p>
            <div class="doc-list">
              @for (d of fam.docs; track d.key) {
                <article class="doc">
                  <div class="doc-head">
                    <i class="pi" [class]="d.icon"></i>
                    <div class="doc-title"><strong>{{ d.label }}</strong><span>{{ d.desc }}</span></div>
                    <p-tag value="Formato fijo" severity="secondary" />
                  </div>
                  <div class="doc-fields">
                    @for (f of d.fields; track f) { <span class="chip">{{ f }}</span> }
                  </div>
                  @if (d.note) { <p class="doc-note"><i class="pi pi-info-circle"></i> {{ d.note }}</p> }
                  <div class="doc-actions">
                    @if (d.preview) {
                      <p-button label="Ver formato" icon="pi pi-eye" size="small" [outlined]="true" (onClick)="openPreview(d)" />
                    }
                    <p-button label="Configurar" icon="pi pi-sliders-h" size="small" [text]="true" [disabled]="true" />
                    <span class="soon">Configurar: próximamente</span>
                  </div>
                </article>
              }
            </div>
            <p class="fam-foot"><i class="pi pi-plus-circle"></i> Esta familia es extensible: se podrán incorporar nuevos documentos {{ fam.id === 'comandas' ? 'informativos' : fam.id === 'comprobantes' ? 'de venta' : 'internos' }} más adelante.</p>
          }
        }

        <!-- IMPRESIÓN -->
        @if (tab() === 'impresion') {
          <p class="tab-desc">Capa de ejecución: <b>cómo y dónde</b> se imprime, independientemente del documento. Impresión física vía QZ Tray (imprime directo sin el diálogo del navegador). Requiere QZ Tray instalado en la PC de recepción.</p>
          <div class="panel">
            <div class="qzrow">
              <span>Estado QZ Tray:</span>
              <p-tag [value]="qzLabel()" [severity]="printing.status() === 'connected' ? 'success' : printing.status() === 'connecting' ? 'warn' : 'danger'" />
              <p-button label="Conectar" icon="pi pi-link" severity="secondary" size="small" [disabled]="printing.status() === 'connected'" (onClick)="connect()" />
              <p-button label="Detectar impresoras" icon="pi pi-search" size="small" [text]="true" [disabled]="printing.status() !== 'connected'" (onClick)="detect()" />
            </div>
            @if (printing.status() !== 'connected') { <p class="warn"><i class="pi pi-info-circle"></i> Sin QZ conectado, la impresión usará la vista previa del navegador (ticketera 80&nbsp;mm).</p> }

            <div class="prow">
              <div class="pcol"><label>Impresora predeterminada</label>
                @if (printers().length) { <p-select [options]="printers()" [(ngModel)]="c.print.defaultPrinter" [showClear]="true" placeholder="Predeterminada del sistema" [disabled]="!canEdit" styleClass="w" /> }
                @else { <input pInputText [(ngModel)]="c.print.defaultPrinter" placeholder="Nombre exacto (o Detectar impresoras)" [disabled]="!canEdit" /> }
              </div>
              <div class="pcol"><label>Tamaño de papel</label><p-select [options]="paperOpts" optionLabel="label" optionValue="value" [(ngModel)]="c.print.paper" [disabled]="!canEdit" styleClass="w" /></div>
            </div>
            <div class="prow">
              <div class="pcol"><label>Número de copias</label><p-inputNumber [(ngModel)]="c.print.copies" [min]="1" [max]="5" [showButtons]="true" [disabled]="!canEdit" styleClass="w" /></div>
              <div class="pcol"><label>&nbsp;</label><label class="chk"><input type="checkbox" [(ngModel)]="c.print.autocut" [disabled]="!canEdit" /> Corte automático de papel</label></div>
            </div>

            <div class="actions">
              <p-button label="Prueba de impresión" icon="pi pi-print" severity="secondary" [disabled]="printing.status() !== 'connected'" (onClick)="testPrint(c)" />
              @if (canEdit) { <p-button label="Guardar impresión" icon="pi pi-check" [loading]="saving()" (onClick)="save('print', { print: c.print })" /> }
            </div>
          </div>
        }

        <!-- AUTOMATIZACIONES -->
        @if (tab() === 'automatizaciones') {
          <p class="tab-desc">Capa de ejecución: <b>cuándo o bajo qué condición</b> se genera/imprime/envía un documento. Los interruptores quedan listos; el disparo automático (evento → documento → canal) se activará en una etapa posterior.</p>
          <div class="cards">
            @for (a of automationDefs; track a.key) {
              <div class="acard">
                <div class="ahead"><i class="pi" [class]="a.icon"></i><div><strong>{{ a.label }}</strong><span>{{ a.desc }}</span></div></div>
                <div class="arow">
                  <label class="chk"><input type="checkbox" [(ngModel)]="c.automations[a.key].enabled" [disabled]="!canEdit" /> Activar</label>
                  <p-select [options]="channelOpts" optionLabel="label" optionValue="value" [(ngModel)]="c.automations[a.key].channel" [disabled]="!canEdit || !c.automations[a.key].enabled" styleClass="ch" />
                </div>
              </div>
            }
          </div>
          @if (canEdit) { <div class="actions"><p-button label="Guardar automatizaciones" icon="pi pi-check" [loading]="saving()" (onClick)="save('automations', { automations: c.automations })" /></div> }
        }
      }

      <!-- Vista previa de plantilla fija (80 mm) -->
      <p-dialog [(visible)]="previewOpen" [modal]="true" [header]="previewTitle()" [style]="{ width: '360px' }" [dismissableMask]="true">
        <p class="preview-note"><i class="pi pi-info-circle"></i> Formato fijo (80&nbsp;mm). La identidad (logo, dirección, teléfonos) sale de <a routerLink="/settings/hotel">Hotel</a>; los datos de estadía y el voucher WiFi son de muestra (en operación vendrán de la estancia y del módulo WiFi).</p>
        <div class="preview-frame">
          @if (previewUrl()) { <iframe [src]="previewUrl()!" title="Vista previa" class="ticket-iframe"></iframe> }
        </div>
      </p-dialog>
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.5rem; max-width: 1000px; }
      .head h1 { margin: 0; font-size: 1.5rem; display: inline-flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--p-text-muted-color, #64748b); margin: 0.35rem 0 0; line-height: 1.5; } .muted a, .head a { color: var(--p-primary-color, #3b82f6); font-weight: 600; }
      .tabs { display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 1.2rem 0 1rem; border-bottom: 1px solid var(--p-content-border-color, #e2e8f0); }
      .tab { background: none; border: 0; border-bottom: 2px solid transparent; color: var(--p-text-muted-color, #94a3b8); padding: 0.6rem 0.9rem; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
      .tab.active { color: var(--p-primary-color, #3b82f6); border-bottom-color: var(--p-primary-color, #3b82f6); }
      .tab-desc { font-size: 0.88rem; color: var(--p-text-muted-color, #64748b); margin: 0 0 1rem; line-height: 1.5; }
      .panel { background: var(--p-content-background, #fff); border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; padding: 1.25rem; }

      /* Catálogo de documentos por familia */
      .doc-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
      .doc { border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; background: var(--p-content-background, #fff); padding: 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
      .doc-head { display: flex; align-items: flex-start; gap: 0.7rem; }
      .doc-head > .pi { font-size: 1.3rem; color: var(--p-primary-color, #3b82f6); margin-top: 0.15rem; }
      .doc-title { flex: 1; } .doc-title strong { display: block; } .doc-title span { font-size: 0.8rem; color: var(--p-text-muted-color, #64748b); }
      .doc-fields { display: flex; flex-wrap: wrap; gap: 0.35rem; }
      .chip { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: var(--p-surface-100, #f1f5f9); color: var(--p-text-muted-color, #475569); border: 1px solid var(--p-content-border-color, #e2e8f0); }
      .doc-note { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 0.4rem 0.6rem; margin: 0; }
      .doc-actions { display: flex; align-items: center; gap: 0.6rem; border-top: 1px dashed var(--p-content-border-color, #e2e8f0); padding-top: 0.6rem; margin-top: auto; }
      .soon { font-size: 0.75rem; color: var(--p-text-muted-color, #94a3b8); font-style: italic; }
      .fam-foot { display: flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; color: var(--p-text-muted-color, #64748b); margin: 1rem 0 0; }

      .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
      .acard { display: flex; flex-direction: column; align-items: stretch; gap: 0.7rem; padding: 0.9rem; border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; background: var(--p-content-background, #fff); }
      .acard .pi { font-size: 1.25rem; color: var(--p-primary-color, #3b82f6); }
      .acard strong { display: block; } .acard span { font-size: 0.8rem; color: var(--p-text-muted-color, #64748b); }
      .ahead { display: flex; gap: 0.7rem; align-items: flex-start; } .ahead > div { flex: 1; }
      .arow { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; border-top: 1px dashed var(--p-content-border-color, #e2e8f0); padding-top: 0.6rem; }
      .chk { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.87rem; cursor: pointer; }
      .chk input { width: auto; }
      .qzrow { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; } .qzrow span { font-size: 0.9rem; }
      .warn { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #f59e0b; margin: 0.6rem 0 0; }
      .prow { display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; } .pcol { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 0.35rem; } .pcol label { font-size: 0.83rem; color: var(--p-text-muted-color, #94a3b8); }
      .actions { display: flex; gap: 0.6rem; justify-content: flex-end; margin-top: 1.3rem; }
      :host ::ng-deep .w, :host ::ng-deep .ch { width: 100%; } :host ::ng-deep .ch { max-width: 12rem; }
      .preview-note { font-size: 0.78rem; color: var(--p-text-muted-color, #64748b); margin: 0 0 0.7rem; line-height: 1.45; } .preview-note a { color: var(--p-primary-color, #3b82f6); font-weight: 600; }
      .preview-frame { display: flex; justify-content: center; background: #eef2f6; border-radius: 8px; padding: 10px; }
      .ticket-iframe { width: 322px; height: 560px; border: 0; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.12); border-radius: 4px; }
      @media (max-width: 760px) { .cards, .doc-list { grid-template-columns: 1fr; } }
    `,
  ],
})
export class TicketsConfigComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly printing = inject(PrintingService);

  // Vista previa de plantilla fija
  previewOpen = false;
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewTitle = signal('Vista previa');
  readonly identity = signal<ComandaIdentity>(SAMPLE_IDENTITY);

  readonly canEdit = this.auth.can('settings', 'edit');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly tab = signal<Tab>('comandas');
  readonly config = signal<TicketsConfig>({
    visual: {}, messages: {},
    print: { paper: '80', copies: 1, autocut: true, defaultPrinter: '' },
    automations: { checkin: r(), pendingChange: r(), cashClose: r(), productTransfer: r(), cleaningClose: r() },
  });
  readonly printers = signal<string[]>([]);

  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'comandas', label: 'Comandas', icon: 'pi-comment' },
    { id: 'comprobantes', label: 'Comprobantes', icon: 'pi-file' },
    { id: 'operaciones', label: 'Operaciones', icon: 'pi-cog' },
    { id: 'impresion', label: 'Impresión', icon: 'pi-print' },
    { id: 'automatizaciones', label: 'Automatizaciones', icon: 'pi-bolt' },
  ];

  /** Catálogo data-driven de documentos por naturaleza. Agregar uno nuevo = sumar un objeto DocDef. */
  readonly families: Family[] = [
    {
      id: 'comandas',
      title: 'Comandas',
      intro: 'Documentos informativos y no tributarios entregados al huésped. No son boleta ni factura: su función es dar información útil de un momento de la estadía.',
      docs: [
        { key: 'checkin', icon: 'pi-sign-in', label: 'Check-in / Bienvenida', desc: 'La que recibe el huésped al ingresar.',
          fields: ['Habitación', 'Día hotelero', 'Ingreso', 'Hora límite de salida', 'WiFi (red/voucher)', 'Servicios: Netflix, Prime, Room Service, Intercomunicador', 'Dirección y teléfonos', 'Mensajes'], preview: 'BIENVENIDA' },
        { key: 'renovacion', icon: 'pi-refresh', label: 'Renovación', desc: 'El huésped renueva su estadía. Comanda compacta: bloque WiFi + nueva hora límite.',
          fields: ['Habitación', 'Estadía renovada - nueva hora límite', 'Nuevo voucher WiFi (pernocta)', 'Vigencia del voucher'], preview: 'RENOVACION' },
        { key: 'tiempoExtra', icon: 'pi-clock', label: 'Tiempo extra', desc: 'Extensión por horas adicionales. Igual a renovación pero "Tiempo extra"; WiFi de voucher personalizado.',
          fields: ['Habitación', 'Tiempo extra - nueva hora límite', 'Voucher WiFi (personalizado)', 'Tiempo del voucher'], preview: 'TIEMPO_EXTRA' },
        { key: 'voucherWifi', icon: 'pi-wifi', label: 'Voucher Wi-Fi', desc: 'Comanda pequeña e independiente para entregar solo el acceso WiFi.',
          fields: ['Nombre del hospedaje', 'Red', 'Código', 'Tiempo / vigencia'],
          note: 'Útil cuando el huésped no dio WhatsApp, necesita renovar solo el WiFi, cortesía, o conectarse para pagar por Yape.', preview: 'VOUCHER_WIFI' },
      ],
    },
    {
      id: 'comprobantes',
      title: 'Comprobantes',
      intro: 'Documentos de ventas/cobros al cliente, separados de las comandas informativas. Arquitectura preparada para la futura facturación electrónica/SUNAT (aún no implementada).',
      docs: [
        { key: 'hospedaje', icon: 'pi-home', label: 'Comprobante de hospedaje', desc: 'Cobro del servicio de hospedaje.',
          fields: ['Concepto', 'Importe', 'Método de pago', 'Datos del cliente'] },
        { key: 'productos', icon: 'pi-shopping-cart', label: 'Venta de productos', desc: 'Consumos y frigobar.',
          fields: ['Detalle de productos', 'Cantidades', 'Importes', 'Método de pago'] },
        { key: 'servicios', icon: 'pi-tags', label: 'Servicios', desc: 'Servicios adicionales.',
          fields: ['Servicio', 'Importe', 'Método de pago'] },
        { key: 'penalidades', icon: 'pi-exclamation-triangle', label: 'Penalidades', desc: 'Cargos por penalidad / extensión de horas.',
          fields: ['Concepto', 'Importe', 'Método de pago'] },
        { key: 'boleta', icon: 'pi-file', label: 'Boleta', desc: 'Comprobante tributario tipo boleta.',
          fields: ['Razón social', 'RUC', 'Cliente', 'Conceptos', 'IGV', 'Total'] },
        { key: 'factura', icon: 'pi-file-edit', label: 'Factura', desc: 'Comprobante tributario tipo factura.',
          fields: ['Razón social', 'RUC', 'Cliente + RUC', 'Conceptos', 'IGV', 'Total'] },
      ],
    },
    {
      id: 'operaciones',
      title: 'Operaciones',
      intro: 'Tickets de control interno del hospedaje. No están destinados al huésped ni son comprobantes de venta.',
      docs: [
        { key: 'transferencia', icon: 'pi-arrow-right-arrow-left', label: 'Transferencia de productos', desc: 'Recepción solicita productos al almacén.',
          fields: ['Producto', 'Solicitado', 'Enviado', 'Origen / destino', 'Turno', 'Usuario', 'Fecha/hora'] },
        { key: 'cierreCaja', icon: 'pi-lock', label: 'Cierre de caja', desc: 'Cuadre del turno (ciego o administrativo).',
          fields: ['Turno', 'Colaborador', 'Caja base', 'Efectivo contado', 'Ingresos/egresos', 'Ajustes', 'Auditoría'] },
        { key: 'cierreLimpieza', icon: 'pi-sparkles', label: 'Cierre de turno de limpieza', desc: 'Control/cierre de turno de housekeeping.',
          fields: ['Turno', 'Colaborador', 'Limpiezas realizadas', 'Fecha/hora'] },
      ],
    },
  ];

  readonly automationDefs: { key: keyof TicketsConfig['automations']; icon: string; label: string; desc: string }[] = [
    { key: 'checkin', icon: 'pi-sign-in', label: 'Check-in', desc: 'Imprimir la comanda de bienvenida (con WiFi) o enviar por WhatsApp según el cliente.' },
    { key: 'pendingChange', icon: 'pi-wallet', label: 'Vuelto pendiente', desc: 'Generar comprobante cuando queda vuelto "No entregado".' },
    { key: 'cashClose', icon: 'pi-lock', label: 'Cierre de caja', desc: 'Imprimir el cuadre al cerrar el turno.' },
    { key: 'productTransfer', icon: 'pi-arrow-right-arrow-left', label: 'Transferencia de productos', desc: 'Constancia al entregar/confirmar una solicitud de almacén.' },
    { key: 'cleaningClose', icon: 'pi-sparkles', label: 'Cierre de turno de limpieza', desc: 'Resumen al finalizar el turno de limpieza.' },
  ];
  readonly paperOpts = [{ label: '80 mm', value: '80' }, { label: '58 mm', value: '58' }];
  readonly channelOpts = [{ label: 'Imprimir (QZ)', value: 'PRINT' }, { label: 'WhatsApp', value: 'WHATSAPP' }, { label: 'Ninguno', value: 'NONE' }];

  qzLabel(): string { return this.printing.status() === 'connected' ? 'Conectado' : this.printing.status() === 'connecting' ? 'Conectando…' : 'Desconectado'; }

  /** Abre la vista previa de una plantilla fija con datos de muestra. */
  openPreview(d: DocDef): void {
    if (!d.preview) return;
    const kind = d.preview as ComandaKind;
    const html = buildComandaTicket(kind, this.identity(), sampleComandaData(kind));
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    this.previewTitle.set('Formato: ' + d.label);
    this.previewOpen = true;
  }

  ngOnInit(): void {
    this.http.get<ApiResponse<TicketsConfig>>(`${this.api}/tickets-config`).subscribe({
      next: (r) => { if (r.data) this.config.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    // Identidad real (logo, dirección, teléfonos) desde Configuración → Hotel, para la vista previa.
    const branchId = this.auth.activeBranchId();
    if (branchId) {
      this.http.get<ApiResponse<Record<string, string>>>(`${this.api}/branches/${branchId}`).subscribe({
        next: (r) => { if (r.data) this.identity.set(identityFromBranch(r.data)); },
        error: () => {/* se mantiene la identidad de muestra */},
      });
    }
  }

  async connect(): Promise<void> {
    try { await this.printing.connect(); this.messages.add({ severity: 'success', summary: 'QZ conectado', detail: '' }); }
    catch { this.messages.add({ severity: 'error', summary: 'QZ Tray', detail: 'No se pudo conectar. ¿Está QZ Tray abierto?' }); }
  }
  async detect(): Promise<void> {
    try { this.printers.set(await this.printing.listPrinters()); this.messages.add({ severity: 'success', summary: 'Impresoras', detail: `${this.printers().length} encontrada(s).` }); }
    catch { this.messages.add({ severity: 'error', summary: 'Impresoras', detail: 'No se pudieron detectar.' }); }
  }
  async testPrint(c: TicketsConfig): Promise<void> {
    try { await this.printing.printTest(c.print.defaultPrinter); }
    catch { this.messages.add({ severity: 'error', summary: 'Impresión', detail: 'No se pudo imprimir la prueba.' }); }
  }

  save(section: string, body: Partial<TicketsConfig>): void {
    this.saving.set(true);
    this.http.put<ApiResponse<TicketsConfig>>(`${this.api}/tickets-config`, body).subscribe({
      next: (r) => { if (r.data) this.config.set(r.data); this.saving.set(false); this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Configuración actualizada.' }); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
}

function r(): Rule { return { enabled: false, channel: 'NONE' }; }
