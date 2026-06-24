import { Injectable, signal } from '@angular/core';
import { palette, updatePrimaryPalette, updateSurfacePalette } from '@primeng/themes';

export interface AccentOption {
  key: string;
  label: string;
  color: string;
}

/** Acentos disponibles en el selector de tema del dashboard. */
export const ACCENTS: AccentOption[] = [
  { key: 'emerald', label: 'Esmeralda', color: '#10b981' },
  { key: 'teal', label: 'Turquesa', color: '#14b8a6' },
  { key: 'blue', label: 'Azul', color: '#3b82f6' },
  { key: 'violet', label: 'Violeta', color: '#8b5cf6' },
  { key: 'rose', label: 'Rosa', color: '#f43f5e' },
  { key: 'orange', label: 'Naranja', color: '#f97316' },
  { key: 'amber', label: 'Ámbar', color: '#f59e0b' },
];

/** Superficie navy de RIZZOS (igual a las imágenes del Word). */
const NAVY_SURFACE = {
  0: '#ffffff',
  50: '#e6edf5',
  100: '#b9c8db',
  200: '#8aa0bd',
  300: '#5b7191',
  400: '#3d5273',
  500: '#2a3b57',
  600: '#1c2c44',
  700: '#142339',
  800: '#0f1a2b',
  900: '#0b1220',
  950: '#070b14',
};

const DARK_KEY = 'rz_theme_dark';
const ACCENT_KEY = 'rz_theme_accent';
const MODE_KEY = 'rz_theme_mode';

export type ThemeMode = 'claro' | 'oscuro' | 'sistema';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly accents = ACCENTS;
  readonly dark = signal<boolean>(this.readDark());
  readonly accent = signal<string>(localStorage.getItem(ACCENT_KEY) ?? 'emerald');
  readonly mode = signal<ThemeMode>((localStorage.getItem(MODE_KEY) as ThemeMode) || (this.readDark() ? 'oscuro' : 'claro'));
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.applyMode(this.mode());
    this.media.addEventListener('change', () => { if (this.mode() === 'sistema') this.applyMode('sistema'); });
  }

  /** Apariencia: Claro / Oscuro / Sistema (Sistema sigue al SO). */
  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(MODE_KEY, mode);
    this.applyMode(mode);
  }

  private applyMode(mode: ThemeMode): void {
    const dark = mode === 'oscuro' || (mode === 'sistema' && this.media.matches);
    this.setDark(dark);
  }

  private readDark(): boolean {
    const v = localStorage.getItem(DARK_KEY);
    return v === null ? true : v === '1'; // RIZZOS arranca en oscuro
  }

  setDark(value: boolean): void {
    this.dark.set(value);
    localStorage.setItem(DARK_KEY, value ? '1' : '0');
    this.apply();
  }

  toggleDark(): void {
    this.setDark(!this.dark());
  }

  setAccent(key: string): void {
    this.accent.set(key);
    localStorage.setItem(ACCENT_KEY, key);
    this.apply();
  }

  accentColor(): string {
    return this.accents.find((a) => a.key === this.accent())?.color ?? '#10b981';
  }

  /** Aplica clase .dark, paleta primaria (acento) y superficie navy a PrimeNG. */
  apply(): void {
    const root = document.documentElement;
    root.classList.toggle('dark', this.dark());

    const accent = this.accents.find((a) => a.key === this.accent()) ?? this.accents[0];
    updatePrimaryPalette(palette(accent.color));

    // En oscuro usamos la superficie navy; en claro, una gris suave.
    updateSurfacePalette(this.dark() ? NAVY_SURFACE : palette('#64748b'));

    // Exponemos el acento como variable propia para componentes hechos a mano.
    root.style.setProperty('--rz-accent', accent.color);
  }
}
