import { defineConfig } from "prisma/config";

// .env laden, ohne dotenv vorauszusetzen — `prisma generate` laeuft im
// postinstall, also bevor node_modules vollstaendig ist.
try {
  if (typeof process.loadEnvFile === "function") process.loadEnvFile();
} catch {
  /* keine .env — die Werte kommen aus der Umgebung */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Bewusst KEIN `migrations`-Pfad: Aeli migriert nicht. Die Migrationen der
  // gemeinsamen Datenbank liegen in ../prisma/migrations (Aera). Ein
  // `prisma migrate` aus diesem Ordner heraus wuerde das Spiegelschema fuer
  // vollstaendig halten und alle Aera-Tabellen loeschen wollen.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
