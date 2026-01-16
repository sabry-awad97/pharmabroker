import { env } from '@pharmabroker/env/server';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, Prisma } from '../prisma/generated/client';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export default prisma;
export { Prisma };
