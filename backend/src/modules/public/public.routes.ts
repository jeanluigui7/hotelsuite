import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { publicController } from './public.controller';

// PUBLIC endpoints — no authentication, read-only, for the landing pages.
export const publicRouter = Router();

publicRouter.get('/public/branches/:id', asyncHandler(publicController.branch));
publicRouter.get('/public/branches/:id/rooms', asyncHandler(publicController.rooms));
publicRouter.get('/public/branches/:id/landing', asyncHandler(publicController.landing));
