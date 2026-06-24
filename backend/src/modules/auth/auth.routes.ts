import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { authController } from './auth.controller';

export const authRouter = Router();

authRouter.post('/auth/login', asyncHandler(authController.login));
authRouter.post('/auth/refresh', asyncHandler(authController.refresh));
authRouter.post('/auth/logout', asyncHandler(authController.logout));
authRouter.get('/auth/me', authenticate(), asyncHandler(authController.me));
authRouter.patch('/auth/profile', authenticate(), asyncHandler(authController.updateProfile));
authRouter.post('/auth/change-password', authenticate(), asyncHandler(authController.changePassword));
