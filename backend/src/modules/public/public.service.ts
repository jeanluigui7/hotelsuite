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
