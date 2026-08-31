import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';

type Tab = 'plantillas' | 'visualizacion' | 'mensajes' | 'impresion' | 'automatizaciones';
type Channel = 'PRINT' | 'WHATSAPP' | 'NONE';
interface Rule { enabled: boolean; channel: Channel; }
interface TicketsConfig {
  visual: Record<string, boolean>;
  messages: { welcome: string; farewell: string; guestNotes: string; notices: string; legal: string; footer: string };
  print: { paper: '58' | '80'; copies: number; autocut: boolean; defaultPrinter: string };
  automations: { checkin: Rule; pendingChange: Rule; cashClose: Rule; productTransfer: Rule; cleaningClose: Rule };
}

@Component({
  selector: 'app-tickets-config',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, InputNumberModule, SelectModule, TagModule],
  template: `
    <section class="wrap">
      <header class="head">
        <h1><i class="pi pi-receipt"></i> Configuración de Tickets</h1>
        <p class="muted">Identidad de la sucursal desde <a routerLink="/settings/hotel">Hotel</a>; credenciales WiFi desde <a routerLink="/wifi/configuracion">WiFi</a>. Aquí se decide qué se muestra, cómo se imprime y cuándo.</p>
      </header>

      <div class="tabs">
        @for (t of tabs; track t.id) {
          <button class="tab" [class.active]="tab() === t.id" (click)="tab.set(t.id)"><i class="pi" [class]="t.icon"></i> {{ t.label }}</button>
        }
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else { @let c = config();

        <!-- PLANTILLAS -->
        @if (tab() === 'plantillas') {
          <p class="tab-desc">Tipos de documento que el sistema puede generar. Cada plantilla tendrá su propia configuración y vista previa en una etapa siguiente.</p>
          <div class="cards">
            @for (p of plantillas; track p.key) {
              <div class="pcard"><i class="pi" [class]="p.icon"></i><div><strong>{{ p.label }}</strong><span>{{ p.desc }}</span></div><p-tag value="Preparada" severity="secondary" /></div>
            }
          </div>
        }

        <!-- VISUALIZACIÓN -->
        @if (tab() === 'visualizacion') {
          <p class="tab-desc">Marca qué elementos aparecen en el ticket. WiFi y QR son solo interruptores: su contenido viene de sus módulos, no se guarda aquí.</p>
          @for (g of visualGroups; track g.title) {
            <div class="vgroup">
              <h4>{{ g.title }}</h4>
              <div class="vgrid">
                @for (f of g.fields; track f.key) {
                  <label class="chk"><input type="checkbox" [(ngModel)]="c.visual[f.key]" [disabled]="!canEdit" /> {{ f.label }}</label>
                }
              </div>
            </div>
          }
          @if (canEdit) { <div class="actions"><p-button label="Guardar visualización" icon="pi pi-check" [loading]="saving()" (onClick)="save('visual', { visual: c.visual })" /></div> }
        }

        <!-- MENSAJES -->
        @if (tab() === 'mensajes') {
          <p class="tab-desc">Textos adicionales que se imprimen en los tickets. Podrán variar por plantilla más adelante.</p>
          <div class="mgrid">
            @for (m of mensajes; track m.key) {
              <div class="mfld"><label>{{ m.label }}</label><textarea [(ngModel)]="c.messages[m.key]" [disabled]="!canEdit" rows="2" [placeholder]="m.ph"></textarea></div>
            }
          </div>
          @if (canEdit) { <div class="actions"><p-button label="Guardar mensajes" icon="pi pi-check" [loading]="saving()" (onClick)="save('messages', { messages: c.messages })" /></div> }
        }

        <!-- IMPRESIÓN -->
        @if (tab() === 'impresion') {
          <p class="tab-desc">Impresión física vía QZ Tray (imprime directo sin el diálogo del navegador). Requiere QZ Tray instalado en la PC de recepción.</p>
          <div class="panel">
            <div class="qzrow">
              <span>Estado QZ Tray:</span>
              <p-tag [value]="qzLabel()" [severity]="printing.status() === 'connected' ? 'success' : printing.status() === 'connecting' ? 'warn' : 'danger'" />
              <p-button label="Conectar" icon="pi pi-link" severity="secondary" size="small" [disabled]="printing.status() === 'connected'" (onClick)="connect()" />
              <p-button label="Detectar impresoras" icon="pi pi-search" size="small" [text]="true" [disabled]="printing.status() !== 'connected'" (onClick)="detect()" />
            </div>
            @if (printing.status() !== 'connected') { <p class="warn"><i class="pi pi-info-circle"></i> Sin QZ conectado, la impresión usará la vista previa del navegador.</p> }

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
          <p class="tab-desc">Reglas de <b>cuándo</b> se imprime un ticket o se usa otro canal (WhatsApp). Los interruptores quedan listos; el disparo automático se activará en una etapa posterior.</p>
          <div class="cards">
            @for (a of automations; track a.key) {
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
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.5rem; max-width: 960px; }
      .head h1 { margin: 0; font-size: 1.5rem; display: inline-flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--p-text-muted-color, #64748b); margin: 0.35rem 0 0; } .muted a, .head a { color: var(--p-primary-color, #3b82f6); font-weight: 600; }
      .tabs { display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 1.2rem 0 1rem; border-bottom: 1px solid var(--p-content-border-color, #2b2b30); }
      .tab { background: none; border: 0; border-bottom: 2px solid transparent; color: var(--p-text-muted-color, #94a3b8); padding: 0.6rem 0.9rem; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
      .tab.active { color: var(--p-primary-color, #3b82f6); border-bottom-color: var(--p-primary-color, #3b82f6); }
      .tab-desc { font-size: 0.88rem; color: var(--p-text-muted-color, #64748b); margin: 0 0 1rem; }
      .panel { background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; padding: 1.25rem; }
      .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
      .pcard, .acard { display: flex; align-items: center; gap: 0.7rem; padding: 0.9rem; border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; background: var(--p-content-background, #1f1f23); }
      .pcard { justify-content: space-between; } .pcard > div { flex: 1; } .pcard .pi, .acard .pi { font-size: 1.25rem; color: var(--p-primary-color, #3b82f6); }
      .pcard strong, .acard strong { display: block; } .pcard span, .acard span { font-size: 0.8rem; color: var(--p-text-muted-color, #64748b); }
      .acard { flex-direction: column; align-items: stretch; gap: 0.7rem; } .ahead { display: flex; gap: 0.7rem; align-items: flex-start; } .ahead > div { flex: 1; }
      .arow { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; border-top: 1px dashed var(--p-content-border-color, #2b2b30); padding-top: 0.6rem; }
      .vgroup { margin-bottom: 1.1rem; } .vgroup h4 { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--p-primary-color, #3b82f6); }
      .vgrid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem 1rem; }
      .chk { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.87rem; cursor: pointer; }
      .chk input { width: auto; }
      .mgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem 1rem; }
      .mfld { display: flex; flex-direction: column; gap: 0.3rem; } .mfld label { font-size: 0.83rem; color: var(--p-text-muted-color, #94a3b8); }
      .mfld textarea { resize: vertical; font: inherit; padding: 0.55rem 0.7rem; border-radius: 8px; border: 1px solid var(--p-content-border-color, #2b2b30); background: var(--p-content-background, #131313); color: inherit; }
      .qzrow { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; } .qzrow span { font-size: 0.9rem; }
      .warn { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #f59e0b; margin: 0.6rem 0 0; }
      .prow { display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; } .pcol { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 0.35rem; } .pcol label { font-size: 0.83rem; color: var(--p-text-muted-color, #94a3b8); }
      .actions { display: flex; gap: 0.6rem; justify-content: flex-end; margin-top: 1.3rem; }
      :host ::ng-deep .w, :host ::ng-deep .ch { width: 100%; } :host ::ng-deep .ch { max-width: 12rem; }
      @media (max-width: 760px) { .cards, .mgrid { grid-template-columns: 1fr; } .vgrid { grid-template-columns: 1fr 1fr; } }
    `,
  ],
})
export class TicketsConfigComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  readonly printing = inject(PrintingService);

  readonly canEdit = this.auth.can('settings', 'edit');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly tab = signal<Tab>('visualizacion');
  readonly config = signal<TicketsConfig>({
    visual: {}, messages: { welcome: '', farewell: '', guestNotes: '', notices: '', legal: '', footer: '' },
    print: { paper: '80', copies: 1, autocut: true, defaultPrinter: '' },
    automations: { checkin: r(), pendingChange: r(), cashClose: r(), productTransfer: r(), cleaningClose: r() },
  });
  readonly printers = signal<string[]>([]);

  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'plantillas', label: 'Plantillas', icon: 'pi-clone' },
    { id: 'visualizacion', label: 'Visualización', icon: 'pi-eye' },
    { id: 'mensajes', label: 'Mensajes', icon: 'pi-comment' },
    { id: 'impresion', label: 'Impresión', icon: 'pi-print' },
    { id: 'automatizaciones', label: 'Automatizaciones', icon: 'pi-bolt' },
  ];
  readonly plantillas = [
    { key: 'checkin', icon: 'pi-sign-in', label: 'Check-in / Bienvenida', desc: 'Ticket de ingreso del huésped.' },
    { key: 'hospedaje', icon: 'pi-home', label: 'Comprobante de hospedaje', desc: 'Cargo de la estancia.' },
    { key: 'renovacion', icon: 'pi-refresh', label: 'Renovación / Extensión', desc: 'Ampliación de la estancia.' },
    { key: 'productos', icon: 'pi-shopping-cart', label: 'Venta de productos', desc: 'Consumos y frigobar.' },
    { key: 'servicios', icon: 'pi-tags', label: 'Servicios y penalidades', desc: 'Cargos adicionales.' },
    { key: 'vuelto', icon: 'pi-wallet', label: 'Vuelto pendiente', desc: 'Vuelto no entregado.' },
    { key: 'transferencia', icon: 'pi-arrow-right-arrow-left', label: 'Transferencia de productos', desc: 'Constancia de entrega.' },
    { key: 'cierreCaja', icon: 'pi-lock', label: 'Cierre de caja', desc: 'Cuadre del turno.' },
    { key: 'cierreLimpieza', icon: 'pi-sparkles', label: 'Cierre de turno de limpieza', desc: 'Resumen operativo.' },
  ];
  readonly visualGroups: { title: string; fields: { key: string; label: string }[] }[] = [
    { title: 'Identidad (desde Hotel)', fields: [
      { key: 'logo', label: 'Logo' }, { key: 'tradeName', label: 'Nombre comercial' }, { key: 'legalName', label: 'Razón social' },
      { key: 'ruc', label: 'RUC' }, { key: 'address', label: 'Dirección' }, { key: 'phone', label: 'Teléfono / WhatsApp' },
    ] },
    { title: 'Estancia', fields: [
      { key: 'room', label: 'Habitación' }, { key: 'guest', label: 'Huésped' }, { key: 'datetime', label: 'Fecha y hora' }, { key: 'stayType', label: 'Tipo de estadía' },
    ] },
    { title: 'Pago y consumo', fields: [
      { key: 'paymentMethod', label: 'Método de pago' }, { key: 'amounts', label: 'Importes' }, { key: 'products', label: 'Productos y servicios' },
    ] },
    { title: 'Operación y extras', fields: [
      { key: 'user', label: 'Usuario que operó' }, { key: 'wifi', label: 'WiFi (del módulo WiFi)' }, { key: 'qr', label: 'Código QR' }, { key: 'loyalty', label: 'Puntos de lealtad' },
    ] },
  ];
  readonly mensajes: { key: keyof TicketsConfig['messages']; label: string; ph: string }[] = [
    { key: 'welcome', label: 'Mensaje de bienvenida', ph: 'Ej.: ¡Bienvenido a RIZZOS!' },
    { key: 'farewell', label: 'Mensaje de despedida', ph: 'Ej.: ¡Gracias por su visita!' },
    { key: 'guestNotes', label: 'Indicaciones al huésped', ph: 'Ej.: Check-out hasta las 12:00.' },
    { key: 'notices', label: 'Avisos', ph: 'Ej.: Prohibido fumar.' },
    { key: 'legal', label: 'Texto legal', ph: 'Ej.: Comprobante no tributario.' },
    { key: 'footer', label: 'Pie del ticket', ph: 'Ej.: www.rizzos.pe' },
  ];
  readonly automations: { key: keyof TicketsConfig['automations']; icon: string; label: string; desc: string }[] = [
    { key: 'checkin', icon: 'pi-sign-in', label: 'Check-in', desc: 'Imprimir bienvenida (con WiFi) o enviar por WhatsApp según el cliente.' },
    { key: 'pendingChange', icon: 'pi-wallet', label: 'Vuelto pendiente', desc: 'Generar ticket cuando queda vuelto "No entregado".' },
    { key: 'cashClose', icon: 'pi-lock', label: 'Cierre de caja', desc: 'Imprimir el cuadre al cerrar el turno.' },
    { key: 'productTransfer', icon: 'pi-arrow-right-arrow-left', label: 'Transferencia de productos', desc: 'Constancia al entregar/confirmar una solicitud.' },
    { key: 'cleaningClose', icon: 'pi-sparkles', label: 'Cierre de turno de limpieza', desc: 'Resumen al finalizar el turno de limpieza.' },
  ];
  readonly paperOpts = [{ label: '80 mm', value: '80' }, { label: '58 mm', value: '58' }];
  readonly channelOpts = [{ label: 'Imprimir (QZ)', value: 'PRINT' }, { label: 'WhatsApp', value: 'WHATSAPP' }, { label: 'Ninguno', value: 'NONE' }];

  qzLabel(): string { return this.printing.status() === 'connected' ? 'Conectado' : this.printing.status() === 'connecting' ? 'Conectando…' : 'Desconectado'; }

  ngOnInit(): void {
    this.http.get<ApiResponse<TicketsConfig>>(`${this.api}/tickets-config`).subscribe({
      next: (r) => { if (r.data) this.config.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
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
