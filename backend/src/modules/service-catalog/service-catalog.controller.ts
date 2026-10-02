import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { serviceCatalogService as svc } from './service-catalog.service';
import {
  createCategorySchema, updateCategorySchema, createGroupSchema, updateGroupSchema, createConceptSchema, updateConceptSchema,
} from './service-catalog.schema';

export const serviceCatalogController = {
  async tree(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : 'SERVICIO';
    res.status(200).json(ok(await svc.tree(req.scope, tipo)));
  },
  async linenArticles(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await svc.linenArticles(req.scope)));
  },

  // Categorías
  async createCategory(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await svc.createCategory(req.scope, createCategorySchema.parse(req.body))));
  },
  async updateCategory(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await svc.updateCategory(req.scope, req.params.id, updateCategorySchema.parse(req.body))));
  },
  async removeCategory(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await svc.removeCategory(req.scope, req.params.id)));
  },

  // Grupos
  async createGroup(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await svc.createGroup(req.scope, createGroupSchema.parse(req.body))));
  },
  async updateGroup(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await svc.updateGroup(req.scope, req.params.id, updateGroupSchema.parse(req.body))));
  },
  async removeGroup(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await svc.removeGroup(req.scope, req.params.id)));
  },

  // Conceptos
  async createConcept(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await svc.createConcept(req.scope, createConceptSchema.parse(req.body))));
  },
  async updateConcept(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await svc.updateConcept(req.scope, req.params.id, updateConceptSchema.parse(req.body))));
  },
  async removeConcept(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await svc.removeConcept(req.scope, req.params.id)));
  },
};
