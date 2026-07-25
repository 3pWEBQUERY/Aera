import "dotenv/config";
import prisma from "../lib/prisma";

/**
 * The allowlist is parsed here rather than imported from lib/env, and the four
 * conditions are checked inline rather than through lib/platform-admin:
 * both of those modules start with `import "server-only"`, which throws on
 * sight in a plain Node script.
 */
function adminEmailAllowlist(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

type Action = "grant" | "revoke" | "status";

function option(name: string): string {
  const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "").trim() : "";
}

async function main() {
  const action = process.argv[2] as Action | undefined;
  if (action !== "grant" && action !== "revoke" && action !== "status") {
    throw new Error(
      "Usage: platform-admin.ts <grant|revoke|status> --email <address> [--confirm <action:address>]",
    );
  }

  const email = option("email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid --email is required.");
  }
  // Reading state changes nothing, so it needs no confirmation handshake.
  if (action !== "status" && option("confirm").toLowerCase() !== `${action}:${email}`) {
    throw new Error(`Refusing change. Pass --confirm ${action}:${email}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user exists for ${email}.`);

  if (action === "status") {
    // /admin answers 404 instead of 403 so the area stays invisible — which
    // also means a locked-out admin gets no hint about WHY. This prints the
    // four conditions from lib/platform-admin.ts individually.
    const allowlist = adminEmailAllowlist();
    const mark = (ok: boolean) => (ok ? "OK  " : "FAIL");
    const checks: [boolean, string][] = [
      [user.platformRole === "ADMIN", `platformRole is ADMIN (is: ${user.platformRole})`],
      [Boolean(user.emailVerifiedAt), "e-mail verified"],
      [Boolean(user.totpEnabledAt && user.totpSecret), "TOTP (2FA) enabled"],
      [
        allowlist.length === 0 || allowlist.includes(email),
        allowlist.length === 0
          ? "PLATFORM_ADMIN_EMAILS empty (allowlist inactive)"
          : `listed in PLATFORM_ADMIN_EMAILS (${allowlist.length} entr${allowlist.length === 1 ? "y" : "ies"})`,
      ],
    ];
    console.log(`\nPlatform admin status for ${email}\n`);
    for (const [ok, label] of checks) console.log(`  ${mark(ok)}  ${label}`);
    const granted = checks.every(([ok]) => ok);
    console.log(
      `\n  => /admin ${granted ? "is reachable" : "answers 404 — fix every FAIL above"}\n`,
    );
    return;
  }

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
