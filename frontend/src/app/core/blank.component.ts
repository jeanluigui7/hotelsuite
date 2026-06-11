import { Component } from '@angular/core';

/**
 * Componente vacío usado como destino intermedio para forzar la reinstanciación
 * de la ruta actual (p. ej. al cambiar de sucursal) sin recargar la página ni
 * desmontar el layout.
 */
@Component({
  selector: 'app-blank',
  standalone: true,
  template: '',
})
export class BlankComponent {}
