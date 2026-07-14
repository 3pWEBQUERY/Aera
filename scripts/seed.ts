/**
 * Aera ships WITHOUT demo content by design. The platform starts empty; the
 * first real creator community is created through the UI at /start.
 *
 * This script only verifies that the schema is reachable and reports table
 * counts — it never inserts placeholder/demo data.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [tenants, users] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
  ]);
  console.log("✅ Schema erreichbar — keine Demo-Daten werden eingefügt.");
  console.log(`   Tenants: ${tenants} · Users: ${users}`);
  console.log("   Erstelle deine erste Community über /start.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
