import "dotenv/config";
import bcrypt from "bcryptjs";
import { systemPrisma as prisma } from "../lib/prisma";

/**
 * Operator script: create a user account directly in the database.
 *
 * Meant for bootstrapping (the first account before mail/signup is
 * reachable). The password never appears on the command line: pass either a
 * bcrypt hash in AERA_NEW_USER_PASSWORD_HASH (preferred — the plaintext then
 * never reaches the server) or the plaintext in AERA_NEW_USER_PASSWORD.
 * Terms and privacy are deliberately NOT accepted on the user's behalf; the
 * app asks for that consent at the first login.
 *
 *   AERA_NEW_USER_PASSWORD_HASH='$2b$12$…' npm run admin:create-user -- \
 *     --email user@example.com --name "Name" --verified \
 *     --confirm create-user:user@example.com
 */

function option(name: string): string {
  const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "").trim() : "";
}

async function passwordHash(): Promise<string> {
  const hash = (process.env.AERA_NEW_USER_PASSWORD_HASH ?? "").trim();
  if (hash) {
    if (!/^\$2[aby]\$1[0-4]\$[./A-Za-z0-9]{53}$/.test(hash)) {
      throw new Error("AERA_NEW_USER_PASSWORD_HASH must be a bcrypt hash with cost 10-14.");
    }
    return hash;
  }
  const plain = process.env.AERA_NEW_USER_PASSWORD ?? "";
  if (plain.length < 8 || plain.length > 200) {
    throw new Error("Set AERA_NEW_USER_PASSWORD_HASH, or AERA_NEW_USER_PASSWORD with 8-200 characters.");
  }
  return bcrypt.hash(plain, 12);
}

async function main() {
  const email = option("email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid --email is required.");
  if (option("confirm").toLowerCase() !== `create-user:${email}`) {
    throw new Error(`Refusing change. Pass --confirm create-user:${email}`);
  }
  const name = (option("name") || email.split("@")[0]).slice(0, 80);
  const verified = process.argv.includes("--verified");

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Idempotent: never overwrite an existing account's password from here.
    console.log(`${email} already exists; nothing changed.`);
    return;
  }

  const hash = await passwordHash();
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash: hash,
        emailVerifiedAt: verified ? new Date() : null,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        action: "platform_admin.create_user",
        targetType: "User",
        targetId: user.id,
        metadata: { email, verified, source: "scripts/create-user.ts" },
      },
    });
  });
  console.log(`${email} created${verified ? " (e-mail verified)" : ""}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
