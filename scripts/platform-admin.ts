import "dotenv/config";
import prisma from "../lib/prisma";

type Action = "grant" | "revoke";

function option(name: string): string {
  const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "").trim() : "";
}

async function main() {
  const action = process.argv[2] as Action | undefined;
  if (action !== "grant" && action !== "revoke") {
    throw new Error(
      "Usage: platform-admin.ts <grant|revoke> --email <address> --confirm <action:address>",
    );
  }

  const email = option("email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid --email is required.");
  }
  if (option("confirm").toLowerCase() !== `${action}:${email}`) {
    throw new Error(`Refusing change. Pass --confirm ${action}:${email}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user exists for ${email}.`);

  if (action === "grant") {
    if (!user.emailVerifiedAt) throw new Error("The user's e-mail is not verified.");
    if (!user.totpEnabledAt || !user.totpSecret) {
      throw new Error("The user must finish TOTP setup before becoming a platform admin.");
    }
  }

  const platformRole = action === "grant" ? "ADMIN" : "USER";
  if (user.platformRole === platformRole) {
    console.log(`${email} already has platform role ${platformRole}.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { platformRole, sessionVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        action: `platform_admin.${action}`,
        targetType: "User",
        targetId: user.id,
        metadata: { email, source: "scripts/platform-admin.ts" },
      },
    });
  });

  console.log(`${email} now has platform role ${platformRole}; existing sessions were revoked.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
