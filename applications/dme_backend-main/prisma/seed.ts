import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { seedSuperadmin } from './seeds/superadmin.seed';
import { seedManager } from './seeds/manager.seed';
import { seedCompanies } from './seeds/companies.seed';
import { seedDataSources } from './seeds/data-sources.seed';

dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');
  await seedSuperadmin(prisma);
  await seedManager(prisma);
  await seedCompanies(prisma);
  await seedDataSources(prisma);
  console.log('Database seed completed.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
