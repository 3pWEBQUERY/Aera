import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { env } from "@/lib/env";
import {
  PLATFORM_AUDIENCE,
  sessionAudienceForHost,
  signSession,
  verifySession,
} from "@/lib/session";
import { sessionMatchesUser } from "@/lib/auth";

const secret = new TextEncoder().encode(env.AUTH_SECRET);

describe("session revocation versions", () => {
  it("roundtrips the user id and current session version", async () => {
    const token = await signSession({ userId: "u1", sessionVersion: 4 });

    await expect(verifySession(token)).resolves.toEqual({
      userId: "u1",
      sessionVersion: 4,
    });
  });

  it("maps tokens without a session version to version zero", async () => {
    const legacy = await new SignJWT({ userId: "u1" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(PLATFORM_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    await expect(verifySession(legacy)).resolves.toEqual({
      userId: "u1",
      sessionVersion: 0,
    });
  });

  it("rejects tokens without an audience", async () => {
    const unbound = await new SignJWT({ userId: "u1", sessionVersion: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    await expect(verifySession(unbound)).resolves.toBeNull();
  });

  it("never accepts a custom-domain session on the platform", async () => {
    const audience = sessionAudienceForHost("creator-domain.example");
    expect(audience).toBe("custom:creator-domain.example");
    const token = await signSession({ userId: "u1", sessionVersion: 1 }, audience);

    await expect(verifySession(token)).resolves.toBeNull();
    await expect(verifySession(token, "custom:other.example")).resolves.toBeNull();
    await expect(verifySession(token, audience)).resolves.toEqual({
      userId: "u1",
      sessionVersion: 1,
    });
  });

  it("rejects a token after the database version was incremented", () => {
    expect(
      sessionMatchesUser(
        { userId: "u1", sessionVersion: 2 },
        { id: "u1", sessionVersion: 3 },
      ),
    ).toBe(false);
  });

  it("accepts only matching user and version pairs", () => {
    expect(
      sessionMatchesUser(
        { userId: "u1", sessionVersion: 3 },
        { id: "u1", sessionVersion: 3 },
      ),
    ).toBe(true);
    expect(
      sessionMatchesUser(
        { userId: "u1", sessionVersion: 3 },
        { id: "u2", sessionVersion: 3 },
      ),
    ).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    await expect(verifySession("not-a-jwt")).resolves.toBeNull();
  });
});
