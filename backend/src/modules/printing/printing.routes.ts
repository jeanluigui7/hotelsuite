import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { printingController } from './printing.controller';

export const printingRouter = Router();

// Authenticated: only logged-in users can request signatures / the certificate.
printingRouter.use(authenticate());

printingRouter.get('/printing/certificate', asyncHandler(async (req, res) => printingController.certificate(req, res)));
printingRouter.post('/printing/sign', asyncHandler(async (req, res) => printingController.sign(req, res)));
