import type { AuthUser, RequestScope } from '../shared/context';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      scope?: RequestScope;
    }
  }
}

export {};
