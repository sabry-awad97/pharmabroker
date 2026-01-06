import type { RouterClient } from '@orpc/server';

import { protectedProcedure, publicProcedure } from '../index';
import { whatsappRouter } from './whatsapp.router';

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return 'OK';
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: 'This is private',
      user: context.session?.user,
    };
  }),
  whatsapp: whatsappRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
