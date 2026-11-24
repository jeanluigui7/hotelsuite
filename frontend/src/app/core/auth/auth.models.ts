export interface AuthUser {
  userId: string;
  email: string;
  name?: string;
  phone?: string | null;
  roleId: string;
  roleName: string;
  isSuperAdmin: boolean;
  permissions: string[];
  branchIds: string[];
  /** Si está activo, el usuario debe cambiar su contraseña antes de operar. */
  mustChangePassword?: boolean;
  /** Modo huellero obligatorio por rol: ingresa y finaliza turno con huella (no contraseña). */
  requiresFingerprint?: boolean;
}

/** Modo de ingreso resuelto para un correo (pre-sesión). */
export interface LoginMode {
  mode: 'password' | 'fingerprint';
  name?: string;
}

/** Solicitud de autenticación por huella (login o logout). */
export interface FingerprintRequest {
  requestId: string;
  name: string;
  expiresInMs: number;
}

/** Resultado del sondeo del modal de huella. */
export interface FingerprintPoll {
  status: 'pending' | 'authenticated' | 'expired' | 'cancelled';
  remainingMs?: number;
  user?: AuthUser;
  accessToken?: string;
  shiftStarted?: boolean;
}

export interface Branch {
  id: string;
  name: string; // nombre comercial
  legalName?: string | null; // razón social
  address?: string | null;
  taxId?: string | null; // RUC
  // Contacto
  phone?: string | null; // legado
  landline?: string | null; // teléfono fijo
  mobile?: string | null; // celular
  whatsapp?: string | null;
  whatsappSameAsMobile?: boolean;
  email?: string | null;
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  mapsUrl?: string | null; // enlace de Google Maps
  logoUrl?: string | null; // logo (data URL)
  currency: string;
  cutoffHour: number;
  /** Administrador presente: ON = cierre de caja detallado; OFF = cierre ciego en recepción. */
  adminPresent?: boolean;
  status: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  branchId?: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}
