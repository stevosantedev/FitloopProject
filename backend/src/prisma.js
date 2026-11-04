import { PrismaClient } from "@prisma/client";

// One shared Prisma client avoids creating a separate database connection pool per route.
export const prisma = new PrismaClient();
