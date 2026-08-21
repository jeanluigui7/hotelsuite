import { prisma } from '../config/prisma';

/**
 * Lógica compartida del Kardex de PRODUCTOS (Recepción y Productos-Limpieza).
 * Ambos son almacenes de tipo PRODUCTS; el "Almacén General" y "PRODUCTOS LIMPIEZA"
 * se distinguen por NOMBRE (limpieza contiene "LIMPIEZA"). Esto importa para clasificar:
 * abastecimiento DESDE el general = Ingreso; transferencia entre áreas = Ajuste.
 */
export interface KardexWindow {
  from: Date; to: Date; shift: string; businessDate: string; startTime: string; endTime: string; isCurrent: boolean;
}

const DEF_SHIFTS = [
  { shift: 'MANANA', startTime: '06:30', endTime: '14:30', status: 'active' },
  { shift: 'TARDE', startTime: '14:30', endTime: '22:30', status: 'active' },
  { shift: 'NOCHE', startTime: '22:30', endTime: '06:30', status: 'active' },
];

/** Ventana [from, to) del turno según la config de Horarios (o el turno actual por hora). */
export function computeTurnWindow(
  shifts: { shift: string; startTime: string; endTime: string; status: string }[],
  date?: string,
  shift?: string,
): KardexWindow {
  const cfg = shifts.length ? shifts : DEF_SHIFTS;
  const toMin = (h: string): number => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  let bizDate = date;
  let shiftKey = shift;
  if (!bizDate || !shiftKey) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const s = cfg.find((x) => {
      if (x.status !== 'active') return false;
      const st = toMin(x.startTime); const en = toMin(x.endTime);
      return en > st ? nowMin >= st && nowMin < en : nowMin >= st || nowMin < en;
    }) ?? cfg[0];
    const st = toMin(s.startTime); const overnight = toMin(s.endTime) <= st;
    const d = new Date(now);
    if (overnight && now.getHours() * 60 + now.getMinutes() < st) d.setDate(d.getDate() - 1);
    bizDate = ymd(d); shiftKey = s.shift;
  }
  const sc = cfg.find((x) => x.shift === shiftKey) ?? cfg[0];
  const [sh, sm] = sc.startTime.split(':').map(Number);
  const [eh, em] = sc.endTime.split(':').map(Number);
  const overnight = eh * 60 + em <= sh * 60 + sm;
  const from = new Date(`${bizDate}T00:00:00`); from.setHours(sh, sm, 0, 0);
  const to = new Date(`${bizDate}T00:00:00`); to.setHours(eh, em, 0, 0); if (overnight) to.setDate(to.getDate() + 1);
  return { from, to, shift: shiftKey, businessDate: bizDate, startTime: sc.startTime, endTime: sc.endTime, isCurrent: now >= from && now < to };
}

/** Almacenes de productos de una sucursal, distinguiendo el General de PRODUCTOS-LIMPIEZA por nombre. */
export async function productWarehouses(branchId: string) {
  const prods = await prisma.warehouse.findMany({ where: { branchId, type: 'PRODUCTS' }, select: { id: true, name: true } });
  const isLimp = (n: string) => /limpieza/i.test(n);
  const limpieza = prods.find((w) => isLimp(w.name)) ?? null;
  const generals = prods.filter((w) => !isLimp(w.name));
  return { general: generals[0] ?? null, generalIds: generals.map((w) => w.id), limpieza };
}

type MinField = 'reorderPoint' | 'receptionReorderPoint';
export interface KardexItem {
  productId: string; name: string; sku: string | null; categoryId: string | null; categoryName: string | null;
  stockInicial: number; ingresos: number; salidas: number; ajustes: number; stock: number; min: number; belowMin: boolean;
}

/** Construye las filas del kardex para un almacén dentro de la ventana de turno. */
export async function buildProductKardex(opts: {
  branchId: string; whId: string; win: KardexWindow; generalIds: string[]; minField: MinField;
}): Promise<KardexItem[]> {
  const { branchId, whId, win, generalIds, minField } = opts;
  const [products, stocks, movs] = await Promise.all([
    // Solo productos (excluye amenities).
    prisma.product.findMany({ where: { branchId, status: 'active', NOT: { OR: [{ productType: 'AMENITY' }, { category: { type: 'AMENITY' } }] } }, include: { category: { select: { name: true } } }, orderBy: { sku: 'asc' } }),
    prisma.stock.findMany({ where: { warehouseId: whId } }),
    prisma.inventoryMovement.findMany({ where: { branchId, warehouseId: whId, createdAt: { gte: win.from } }, select: { productId: true, quantity: true, createdAt: true, type: true, relatedWarehouseId: true, adjustType: true } }),
  ]);
  const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));
  const generalSet = new Set(generalIds);
  // Ajuste = ADJUST, cualquier adjustType, o TRANSFER interno (contra un almacén que NO es el general).
  const isAdjust = (m: { type: string; adjustType: string | null; relatedWarehouseId: string | null }) =>
    m.type === 'ADJUST' || !!m.adjustType || (m.type === 'TRANSFER' && !(m.relatedWarehouseId != null && generalSet.has(m.relatedWarehouseId)));

  const sinceFrom = new Map<string, number>();
  const sinceTo = new Map<string, number>();
  const ingresos = new Map<string, number>();
  const salidas = new Map<string, number>();
  const ajustes = new Map<string, number>();
  for (const m of movs) {
    if (!m.productId) continue;
    sinceFrom.set(m.productId, (sinceFrom.get(m.productId) ?? 0) + m.quantity);
    if (m.createdAt >= win.to) sinceTo.set(m.productId, (sinceTo.get(m.productId) ?? 0) + m.quantity);
    else if (isAdjust(m)) ajustes.set(m.productId, (ajustes.get(m.productId) ?? 0) + m.quantity);
    else if (m.quantity > 0) ingresos.set(m.productId, (ingresos.get(m.productId) ?? 0) + m.quantity);
    else salidas.set(m.productId, (salidas.get(m.productId) ?? 0) + Math.abs(m.quantity));
  }

  return products.map((p) => {
    const current = stockMap.get(p.id) ?? 0;
    const stockFinal = current - (sinceTo.get(p.id) ?? 0);
    const stockInicial = current - (sinceFrom.get(p.id) ?? 0);
    const min = (p as unknown as Record<string, number>)[minField] ?? 0;
    return {
      productId: p.id, name: p.name, sku: p.sku, categoryId: p.categoryId, categoryName: p.category?.name ?? null,
      stockInicial, ingresos: ingresos.get(p.id) ?? 0, salidas: salidas.get(p.id) ?? 0, ajustes: ajustes.get(p.id) ?? 0,
      stock: stockFinal, min, belowMin: stockFinal <= min,
    };
  });
}
