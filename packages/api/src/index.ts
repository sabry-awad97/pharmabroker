import { os } from '@orpc/server';

import type { Context } from './context';
import { ApiError, ErrorCodes } from './errors';

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, 'Authentication required', {
      requestId: context.requestId,
    });
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// Re-export for convenience
export { ApiError, ErrorCodes } from './errors';
