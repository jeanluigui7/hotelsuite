import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/errors';

async function getSetting(branchId: string, key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
  return s?.value ?? null;
}

export const publicService = {
  /** Public hotel info for the landing page (only safe fields). */
  async branch(id: string) {
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch || branch.status !== 'active') throw new NotFoundError('Hotel no encontrado');
    return {
      id: branch.id,
      name: branch.name,
      legalName: branch.legalName,
      address: branch.address,
      phone: branch.phone,
      email: branch.email,
      logoUrl: branch.logoUrl,
      currency: branch.currency,
      welcome: await getSetting(id, 'landing.welcome'),
    };
  },

  /** Todo lo que la landing necesita en una sola llamada: hotel, servicios,
   *  tipos (para filtros) y habitaciones individuales con disponibilidad. */
  async landing(id: string) {
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch || branch.status !== 'active') throw new NotFoundError('Hotel no encontrado');

    const roomTypes = await prisma.roomType.findMany({
      where: { branchId: id, status: 'active' },
      include: {
        attributes: { include: { attribute: true } },
        rates: { where: { status: 'active' }, orderBy: { durationMinutes: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    const typeById = new Map(roomTypes.map((rt) => [rt.id, rt]));

    const rooms = await prisma.room.findMany({
      where: { branchId: id, roomType: { status: 'active' } },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });

    // Servicios = atributos distintos de los tipos + items de tipo SERVICE.
    // Se deduplica por nombre normalizado (sin distinguir mayúsculas/espacios).
    const serviceMap = new Map<string, { name: string; icon: string | null }>();
    const norm = (s: string): string => s.trim().toLowerCase();
    for (const rt of roomTypes) {
      for (const a of rt.attributes) {
        if (!serviceMap.has(norm(a.attribute.name))) serviceMap.set(norm(a.attribute.name), { name: a.attribute.name, icon: a.attribute.icon });
      }
    }
    const serviceItems = await prisma.item.findMany({ where: { branchId: id, kind: 'SERVICE', status: 'active' } });
    for (const it of serviceItems) {
      if (!serviceMap.has(norm(it.name))) serviceMap.set(norm(it.name), { name: it.name, icon: 'pi pi-check-circle' });
    }

    const mapRates = (rtId: string) =>
      (typeById.get(rtId)?.rates ?? []).map((r) => ({ label: r.label, durationMinutes: r.durationMinutes, price: Number(r.price) }));

    const roomsOut = rooms.map((r) => {
      const rt = typeById.get(r.roomTypeId);
      return {
        id: r.id,
        number: r.number,
        floor: r.floor,
        available: r.status === 'FREE',
        typeId: r.roomTypeId,
        typeName: rt?.name ?? '—',
        description: rt?.description ?? null,
        capacity: rt?.capacity ?? 0,
        attributes: (rt?.attributes ?? []).map((a) => ({ name: a.attribute.name, icon: a.attribute.icon })),
        rates: mapRates(r.roomTypeId),
      };
    });

    return {
      hotel: {
        id: branch.id,
        name: branch.name,
        legalName: branch.legalName,
        address: branch.address,
        phone: branch.phone,
        email: branch.email,
        logoUrl: branch.logoUrl,
        currency: branch.currency,
        welcome: await getSetting(id, 'landing.welcome'),
      },
      services: [...serviceMap.values()],
      roomTypes: roomTypes.map((rt) => ({ id: rt.id, name: rt.name })),
      rooms: roomsOut,
      counts: { total: roomsOut.length, available: roomsOut.filter((r) => r.available).length },
    };
  },

  /** Public room catalog (active room types with attributes and rates). */
  async rooms(id: string) {
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch || branch.status !== 'active') throw new NotFoundError('Hotel no encontrado');
    const roomTypes = await prisma.roomType.findMany({
      where: { branchId: id, status: 'active' },
      include: {
        attributes: { include: { attribute: true } },
        rates: { where: { status: 'active' }, orderBy: { durationMinutes: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    return {
      hotel: { id: branch.id, name: branch.name, currency: branch.currency },
      roomTypes: roomTypes.map((rt) => ({
        id: rt.id,
        name: rt.name,
        description: rt.description,
        capacity: rt.capacity,
        basePrice: rt.basePrice,
        attributes: rt.attributes.map((a) => ({ name: a.attribute.name, icon: a.attribute.icon })),
        rates: rt.rates.map((r) => ({ label: r.label, durationMinutes: r.durationMinutes, price: r.price })),
      })),
    };
  },
};
