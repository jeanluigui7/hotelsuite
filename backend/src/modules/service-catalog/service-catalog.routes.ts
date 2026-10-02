import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { serviceCatalogController as c } from './service-catalog.controller';

export const serviceCatalogRouter = Router();

serviceCatalogRouter.use(authenticate(), tenant());

const base = '/service-catalog';

// Lecturas (configuración → permiso settings:view)
serviceCatalogRouter.get(base, requirePermission('settings', 'view'), asyncHandler(c.tree));
serviceCatalogRouter.get(`${base}/linen-articles`, requirePermission('settings', 'view'), asyncHandler(c.linenArticles));

// Categorías
serviceCatalogRouter.post(`${base}/categories`, requirePermission('settings', 'create'), asyncHandler(c.createCategory));
serviceCatalogRouter.put(`${base}/categories/:id`, requirePermission('settings', 'edit'), asyncHandler(c.updateCategory));
serviceCatalogRouter.delete(`${base}/categories/:id`, requirePermission('settings', 'delete'), asyncHandler(c.removeCategory));

// Grupos
serviceCatalogRouter.post(`${base}/groups`, requirePermission('settings', 'create'), asyncHandler(c.createGroup));
serviceCatalogRouter.put(`${base}/groups/:id`, requirePermission('settings', 'edit'), asyncHandler(c.updateGroup));
serviceCatalogRouter.delete(`${base}/groups/:id`, requirePermission('settings', 'delete'), asyncHandler(c.removeGroup));

// Conceptos
serviceCatalogRouter.post(`${base}/concepts`, requirePermission('settings', 'create'), asyncHandler(c.createConcept));
serviceCatalogRouter.put(`${base}/concepts/:id`, requirePermission('settings', 'edit'), asyncHandler(c.updateConcept));
serviceCatalogRouter.delete(`${base}/concepts/:id`, requirePermission('settings', 'delete'), asyncHandler(c.removeConcept));
