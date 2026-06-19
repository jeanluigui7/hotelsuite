import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'RIZZOS';
  // Instancia el tema al arrancar (aplica modo oscuro + acento RIZZOS).
  private readonly theme = inject(ThemeService);
}
