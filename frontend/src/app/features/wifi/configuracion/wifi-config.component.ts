import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Configuración WiFi (estructura — sin lógica todavía).
 * Aquí se elegirá el MODO de entrega de credenciales (modos internos, NO submenús):
 *   WiFi Global · WiFi por Tipo de Habitación · WiFi por Tarifa · Pool WiFi / Pool de Credenciales.
 * El WiFi es la FUENTE de la credencial del huésped; WhatsApp y Tickets la consumen.
 */
@Component({
  selector: 'app-wifi-config',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="wrap">
      <header class="head">
        <h1><i class="pi pi-wifi"></i> Configuración WiFi</h1>
        <p class="muted">Define cómo se entregan las credenciales de WiFi al huésped. El WiFi es la fuente; WhatsApp y el Ticket la consumen.</p>
      </header>

      <div class="modes">
        <p class="lbl">Modos de entrega (se configurarán aquí — no son submenús):</p>
        <div class="grid">
          <div class="mode"><i class="pi pi-globe"></i><div><strong>WiFi Global</strong><span>Una sola credencial para todo el hospedaje.</span></div></div>
          <div class="mode"><i class="pi pi-building"></i><div><strong>WiFi por Tipo de Habitación</strong><span>Credencial según el tipo de habitación.</span></div></div>
          <div class="mode"><i class="pi pi-tags"></i><div><strong>WiFi por Tarifa</strong><span>Credencial según la tarifa contratada.</span></div></div>
          <div class="mode"><i class="pi pi-ticket"></i><div><strong>Pool WiFi / Pool de Credenciales</strong><span>Asigna una credencial disponible del <a routerLink="/wifi/pool">Pool WiFi</a>.</span></div></div>
        </div>
      </div>

      <div class="soon"><i class="pi pi-info-circle"></i> Estructura creada. La lógica de selección de modo y asignación se implementará en una etapa posterior.</div>
    </section>
  `,
  styles: [
    `
      .wrap { padding: 1.5rem; max-width: 920px; }
      .head h1 { margin: 0; font-size: 1.5rem; display: inline-flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--p-text-muted-color, #64748b); margin: 0.35rem 0 0; }
      .modes { margin-top: 1.5rem; }
      .lbl { font-weight: 600; margin: 0 0 0.6rem; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
      .mode { display: flex; align-items: flex-start; gap: 0.7rem; padding: 1rem; border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 12px; background: var(--p-content-background, #fff); }
      .mode .pi { font-size: 1.3rem; color: var(--p-primary-color, #3b82f6); margin-top: 0.15rem; }
      .mode strong { display: block; } .mode span { font-size: 0.85rem; color: var(--p-text-muted-color, #64748b); }
      .soon { display: flex; align-items: center; gap: 0.5rem; margin-top: 1.25rem; padding: 0.7rem 0.9rem; border-radius: 10px; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: var(--p-primary-color, #2563eb); font-size: 0.88rem; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class WifiConfigComponent {}
