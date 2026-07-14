/**
 * Connectivity smoke test. Creates a throwaway user, reads it back and deletes
 * it again so NO demo data remains.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🔍 Teste Datenbankverbindung…");
  const email = `healthcheck+${Date.now()}@aera.local`;
  const user = await prisma.user.create({
    data: { email, name: "Healthcheck", passwordHash: "x" },
  });
  const found = await prisma.user.findUnique({ where: { id: user.id } });
  if (!found) throw new Error("Read-back failed");
  await prisma.user.delete({ where: { id: user.id } });
  console.log("✅ Verbindung, Schreiben, Lesen und Löschen funktionieren.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌", e);
    await prisma.$disconnect();
    process.exit(1);
  });
