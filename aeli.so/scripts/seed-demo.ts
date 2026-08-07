/**
 * Ein Demo-Konto mit fertiger Seite — zum Anschauen und Ausprobieren.
 *
 *   DATABASE_URL=… npm run db:seed:demo
 *
 * Läuft über die privilegierte Verbindung, weil es einen `User` anlegt. Es ist
 * ein Entwicklungswerkzeug: es weigert sich, wenn NODE_ENV auf `production`
 * steht, damit niemand versehentlich ein Konto mit bekanntem Passwort in eine
 * echte Datenbank schreibt.
 */
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client.js";

const EMAIL = "demo@aeli.so";
const PASSWORD = "aeli-demo-passwort";
const HANDLE = "marie";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed-demo läuft nicht in Produktion — das Passwort steht im Quelltext.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL ist nicht gesetzt");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      update: {},
      create: {
        email: EMAIL,
        name: "Marie Lang",
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.aeliProfile.deleteMany({ where: { userId: user.id } });

    const profile = await prisma.aeliProfile.create({
      data: {
        userId: user.id,
        handle: HANDLE,
        displayName: "Marie Lang",
        bio: "Fotografin in Leipzig. Workshops, Prints und ein Newsletter, der wirklich nur einmal im Monat kommt.",
        theme: { preset: "mitternacht" },
        socials: [
          { platform: "instagram", url: "https://instagram.com/example" },
          { platform: "youtube", url: "https://youtube.com/@example" },
          { platform: "spotify", url: "https://open.spotify.com/artist/example" },
        ],
        status: "PUBLISHED",
        publishedAt: new Date(),
        seoDescription: "Workshops, Prints und ein Newsletter — alles an einer Stelle.",
      },
    });

    await prisma.aeliBlock.createMany({
      data: [
        {
          profileId: profile.id,
          type: "HEADER",
          title: "Gerade aktuell",
          sortOrder: 0,
        },
        {
          profileId: profile.id,
          type: "LINK",
          title: "Workshop: Available Light",
          subtitle: "14. September · noch 3 Plätze",
          href: "https://example.com/workshop",
          icon: "📷",
          config: { highlight: true, badge: "fast voll" },
          sortOrder: 1,
        },
        {
          profileId: profile.id,
          type: "LINK",
          title: "Prints im Shop",
          href: "https://example.com/shop",
          icon: "🖼",
          sortOrder: 2,
          clickCount: 42,
        },
        { profileId: profile.id, type: "DIVIDER", sortOrder: 3 },
        {
          profileId: profile.id,
          type: "EMBED",
          title: "Making-of",
          config: { embedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
          sortOrder: 4,
        },
        {
          profileId: profile.id,
          type: "NEWSLETTER",
          title: "Einmal im Monat",
          subtitle: "Ein Bild, ein Gedanke, kein Werbeblock.",
          sortOrder: 5,
        },
        {
          profileId: profile.id,
          type: "SOCIAL_ROW",
          sortOrder: 6,
        },
        {
          profileId: profile.id,
          type: "QR_SHARE",
          title: "Seite teilen",
          sortOrder: 7,
        },
        {
          // Ein geplanter Block: im Studio sichtbar mit Hinweis, auf der Seite
          // noch nicht. Damit lässt sich das Zeitfenster ohne Warten prüfen.
          profileId: profile.id,
          type: "LINK",
          title: "Vorverkauf Frühjahr",
          href: "https://example.com/vorverkauf",
          startsAt: new Date(Date.now() + 7 * 86_400_000),
          sortOrder: 8,
        },
      ],
    });

    console.log(`✅ Demo angelegt.
   Anmeldung : ${EMAIL} / ${PASSWORD}
   Seite     : /p/${HANDLE}  (bzw. ${HANDLE}.<AELI_ROOT_DOMAIN>)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
