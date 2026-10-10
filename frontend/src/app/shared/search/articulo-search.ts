/**
 * Búsqueda flexible de artículos para los buscadores de almacén (móvil-first).
 * - Normaliza: minúsculas, sin tildes, espacios colapsados.
 * - Coincidencia por nombre completo, parte del nombre o código.
 * - Tolerante a pequeños errores de escritura (Levenshtein acotado): "balnca"/"blanxa" → BLANCA.
 * - Ordena por relevancia (exacto > empieza con > contiene > aproximado).
 * Mismo criterio en el dropdown de sugerencias y en el filtro de la tabla.
 */
export interface BuscadorItem {
  id: string;
  name: string;
  code?: string | null; // sku / código / barcode
  category?: string | null;
  stock?: number | null; // opcional (operaciones de suministro)
  data?: unknown; // objeto original, se devuelve al seleccionar
}

export function normalize(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes/diacríticos
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distancia de edición acotada (si supera max, devuelve max+1 y corta). */
function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1; // poda: no puede mejorar
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** Puntaje de un ítem para una consulta YA normalizada. <0 = no coincide. */
export function scoreItem(item: BuscadorItem, qn: string): number {
  if (!qn) return -1;
  const name = normalize(item.name);
  const code = normalize(item.code);
  const cat = normalize(item.category);
  let best = -1;

  if (code && code === qn) best = Math.max(best, 980);
  if (name === qn) best = Math.max(best, 1000);
  else if (name.startsWith(qn)) best = Math.max(best, 900);
  else {
    const words = name.split(' ');
    if (words.some((w) => w.startsWith(qn))) best = Math.max(best, 820);
    if (name.includes(qn)) best = Math.max(best, 700);
  }
  if (best < 0 && code && code.includes(qn)) best = Math.max(best, 680);
  if (best < 0 && cat && cat.includes(qn)) best = Math.max(best, 400);

  // Tolerancia a errores de escritura (solo si no hubo coincidencia directa).
  if (best < 0 && qn.length >= 3) {
    const thr = qn.length <= 4 ? 1 : 2;
    const words = name.split(' ').concat(code ? [code] : []);
    let min = thr + 1;
    for (const w of words) {
      if (!w) continue;
      min = Math.min(min, levenshtein(qn, w, thr));
      // Ventana deslizante: typo dentro de una palabra más larga.
      if (w.length > qn.length) {
        for (let i = 0; i + qn.length <= w.length && min > 0; i++) {
          min = Math.min(min, levenshtein(qn, w.substr(i, qn.length), thr));
        }
      }
      if (min === 0) break;
    }
    if (min <= thr) best = 300 - min * 60;
  }
  return best;
}

/** Devuelve los ítems que coinciden, ordenados por relevancia (consulta cruda). */
export function searchItems(items: BuscadorItem[], query: string, limit = 25): BuscadorItem[] {
  const qn = normalize(query);
  if (!qn) return [];
  const scored: { it: BuscadorItem; s: number }[] = [];
  for (const it of items) {
    const s = scoreItem(it, qn);
    if (s >= 0) scored.push({ it, s });
  }
  scored.sort((a, b) => b.s - a.s || a.it.name.localeCompare(b.it.name));
  return scored.slice(0, limit).map((x) => x.it);
}

/** ¿El ítem coincide con la consulta? (para filtrar listas/tablas con el mismo criterio). */
export function matchesQuery(fields: { name: string; code?: string | null; category?: string | null }, query: string): boolean {
  const qn = normalize(query);
  if (!qn) return true;
  return scoreItem({ id: '', name: fields.name, code: fields.code ?? null, category: fields.category ?? null }, qn) >= 0;
}
