import type { RouterClient } from '@orpc/server';

import { protectedProcedure, publicProcedure } from '../index';
import { whatsappRouter } from './whatsapp.router';
import { aiSettingsRouter } from './ai-settings.router';

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
  ai: {
    settings: aiSettingsRouter,
  },
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
