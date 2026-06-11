export const environment = {
  production: true,
  // En producción el SPA y la API comparten origen: nginx sirve el frontend
  // y hace proxy de /api al backend. Por eso la URL es relativa.
  apiUrl: '/api',
};
