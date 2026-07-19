/**
 * Encrypts legacy plaintext TOTP and outgoing-webhook secrets and rewraps
 * ciphertext with the first key in AERA_DATA_ENCRYPTION_KEYS.
 * Safe to rerun after every key rotation.
 */
import "dotenv/config";
import prisma from "../lib/prisma";
import {
  decryptSecret,
  encryptionConfigured,
  encryptSecret,
  secretNeedsRotation,
} from "../lib/secret-encryption";

async function main() {
  if (!encryptionConfigured()) {
    throw new Error(
      "Set AERA_DATA_ENCRYPTION_KEYS to at least one id:base64-32-byte-key entry",
    );
  }

  const [users, endpoints] = await Promise.all([
    prisma.user.findMany({
      where: { totpSecret: { not: null } },
      select: { id: true, totpSecret: true },
    }),
    prisma.webhookEndpoint.findMany({ select: { id: true, secret: true } }),
  ]);

  let userCount = 0;
  let endpointCount = 0;
  for (const user of users) {
    if (!user.totpSecret || !secretNeedsRotation(user.totpSecret)) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptSecret(decryptSecret(user.totpSecret)) },
    });
    userCount++;
  }
  for (const endpoint of endpoints) {
    if (!secretNeedsRotation(endpoint.secret)) continue;
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { secret: encryptSecret(decryptSecret(endpoint.secret)) },
    });
    endpointCount++;
  }

  console.info(
    `Sensitive-data encryption complete: ${userCount} TOTP secrets, ${endpointCount} webhook secrets updated.`,
  );
}

main()
  .catch((error) => {
    console.error("Sensitive-data encryption failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
