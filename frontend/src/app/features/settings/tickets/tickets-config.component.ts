import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Configuración del Ticket impreso (estructura — sin lógica todavía).
 * Aquí se configurará SOLO lo relacionado al ticket: identidad, logo, datos del negocio,
 * mensajes impresos, visualización, QR y qué elementos aparecen. El ticket podrá consumir
 * la credencial del módulo WiFi, pero la administración del WiFi/Pool NO vive aquí.
 * (La impresión operativa vía QZ está en Finanzas → Tickets.)
 */
@Component({
  selector: 'app-tickets-config',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="wrap">
      <header class="head">
        <h1><i class="pi pi-receipt"></i> Configuración del Ticket</h1>
        <p class="muted">Configura únicamente el ticket impreso. La impresión (QZ Tray) está en <a routerLink="/finance/tickets">Finanzas → Tickets</a>.</p>
      </header>

      <div class="grid">
        <div class="item"><i class="pi pi-id-card"></i><div><strong>Identidad</strong><span>Nombre y datos del negocio en el ticket.</span></div></div>
        <div class="item"><i class="pi pi-image"></i><div><strong>Logo</strong><span>Logotipo impreso en la cabecera.</span></div></div>
        <div class="item"><i class="pi pi-comment"></i><div><strong>Mensajes impresos</strong><span>Textos de bienvenida, pie o legales.</span></div></div>
        <div class="item"><i class="pi pi-eye"></i><div><strong>Visualización</strong><span>Qué elementos aparecen o se ocultan.</span></div></div>
        <div class="item"><i class="pi pi-qrcode"></i><div><strong>Código QR</strong><span>QR del ticket (p. ej. credencial WiFi del módulo WiFi).</span></div></div>
        <div class="item"><i class="pi pi-wifi"></i><div><strong>WiFi en el ticket</strong><span>Consume la credencial de <a routerLink="/wifi/configuracion">WiFi</a> para imprimirla.</span></div></div>
      </div>

      <div class="soon"><i class="pi pi-info-circle"></i> Estructura creada. La configuración del ticket se implementará en una etapa posterior.</div>
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.5rem; max-width: 920px; }
      .head h1 { margin: 0; font-size: 1.5rem; display: inline-flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--p-text-muted-color, #64748b); margin: 0.35rem 0 0; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-top: 1.25rem; }
      .item { display: flex; align-items: flex-start; gap: 0.7rem; padding: 1rem; border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; background: var(--p-content-background, #fff); }
      .item .pi { font-size: 1.3rem; color: var(--p-primary-color, #3b82f6); margin-top: 0.15rem; }
      .item strong { display: block; } .item span { font-size: 0.85rem; color: var(--p-text-muted-color, #64748b); }
      .soon { display: flex; align-items: center; gap: 0.5rem; margin-top: 1.25rem; padding: 0.7rem 0.9rem; border-radius: 10px; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: var(--p-primary-color, #2563eb); font-size: 0.88rem; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class TicketsConfigComponent {}
