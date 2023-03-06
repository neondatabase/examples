import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        // when using a pooled database connection with prisma, you need to append`?pgbouncer=true` to the connection string.
        // The reason this is done here rather than in the .env file is because the Neon Vercel integration doesn't include it.
        url: `${process.env.DATABASE_URL}?pgbouncer=true&connect_timeout=10&pool_timeout=10`,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
