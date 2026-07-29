import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cloudflare Stream Live.
 *
 * Geprueft wird, was schiefgehen kann, ohne dass man es sieht: dass der
 * API-Schluessel nicht in einer Fehlermeldung landet, dass ein geschuetzter
 * Stream tatsaechlich ein signiertes Token bekommt, und dass ein 404 als
 * Antwort behandelt wird statt als Absturz.
 */

const mocks = vi.hoisted(() => ({
  env: {
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_STREAM_TOKEN: "cf-secret-token-value-do-not-leak-0001",
    CLOUDFLARE_STREAM_CUSTOMER_CODE: "abcd1234efgh5678",
  },
  features: { streamLive: true },
}));

vi.mock("@/lib/env", () => ({ env: mocks.env, features: mocks.features }));

import {
  CloudflareStreamError,
  createLiveInput,
  deleteLiveInput,
  getLiveInput,
  latestRecording,
  playbackToken,
  streamHlsUrl,
  streamIframeUrl,
} from "@/lib/cloudflare-stream";

function ok(result: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => ({ success: status < 400, result }),
  } as Response;
}

function fail(status: number, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, result: null, errors: [{ message }] }),
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.features.streamLive = true;
  vi.stubGlobal("fetch", fetchMock);
});

describe("createLiveInput", () => {
  it("records automatically and returns the ingest data", async () => {
    fetchMock.mockResolvedValue(
      ok({
        uid: "input-1",
        rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: "key-1" },
        srt: { url: "srt://live.cloudflare.com:778", passphrase: "pass-1" },
        webRTC: { url: "https://customer-x.cloudflarestream.com/secret/webRTC/publish" },
        webRTCPlayback: { url: "https://customer-x.cloudflarestream.com/input-1/webRTC/play" },
        status: { current: { state: "disconnected" } },
      }),
    );

    const input = await createLiveInput({ name: "demo · Talk", requireSignedURLs: false });

    expect(input).toMatchObject({
      uid: "input-1",
      ingestUrl: "rtmps://live.cloudflare.com:443/live/",
      streamKey: "key-1",
      whipUrl: "https://customer-x.cloudflarestream.com/secret/webRTC/publish",
      whepUrl: "https://customer-x.cloudflarestream.com/input-1/webRTC/play",
      connected: false,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${mocks.env.CLOUDFLARE_ACCOUNT_ID}/stream/live_inputs`,
    );
    expect(JSON.parse(init.body).recording).toMatchObject({
      mode: "automatic",
      requireSignedURLs: false,
    });
  });

  it("locks down a stream that requires an entitlement", async () => {
    fetchMock.mockResolvedValue(ok({ uid: "input-2", rtmps: { url: "u", streamKey: "k" } }));

    await createLiveInput({ name: "paid", requireSignedURLs: true });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).recording.requireSignedURLs).toBe(true);
  });

  it("refuses when the platform has no Cloudflare configuration", async () => {
    mocks.features.streamLive = false;

    await expect(
      createLiveInput({ name: "x", requireSignedURLs: false }),
    ).rejects.toBeInstanceOf(CloudflareStreamError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("error handling", () => {
  it("never puts the API token into the error", async () => {
    fetchMock.mockResolvedValue(fail(403, "Authentication error"));

    const error = await createLiveInput({ name: "x", requireSignedURLs: false }).then(
      () => null,
      (e: unknown) => e as CloudflareStreamError,
    );

    expect(error).toBeInstanceOf(CloudflareStreamError);
    expect(error!.status).toBe(403);
    expect(JSON.stringify(error)).not.toContain(mocks.env.CLOUDFLARE_STREAM_TOKEN);
    expect(error!.message).not.toContain(mocks.env.CLOUDFLARE_STREAM_TOKEN);
  });

  it("turns a network failure into a timeout error, not a crash", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    const error = await getLiveInput("input-1").then(
      () => null,
      (e: unknown) => e as CloudflareStreamError,
    );

    expect(error).toBeInstanceOf(CloudflareStreamError);
    expect(error!.status).toBe(504);
  });

  it("treats a missing input as an answer, not an error", async () => {
    fetchMock.mockResolvedValue(fail(404, "not found"));

    await expect(getLiveInput("gone")).resolves.toBeNull();
    await expect(deleteLiveInput("gone")).resolves.toBeUndefined();
  });
});

describe("latestRecording", () => {
  it("picks the newest recording that is ready", async () => {
    fetchMock.mockResolvedValue(
      ok([
        { uid: "old", status: { state: "ready" }, created: "2026-01-01T10:00:00Z", playback: { hls: "old.m3u8" } },
        { uid: "processing", status: { state: "inprogress" }, created: "2026-03-01T10:00:00Z" },
        { uid: "new", status: { state: "ready" }, created: "2026-02-01T10:00:00Z", playback: { hls: "new.m3u8" }, duration: 61.4 },
      ]),
    );

    await expect(latestRecording("input-1")).resolves.toEqual({
      uid: "new",
      hlsUrl: "new.m3u8",
      thumbnailUrl: null,
      durationSeconds: 61,
    });
  });

  it("returns null while nothing is ready yet", async () => {
    fetchMock.mockResolvedValue(ok([{ uid: "x", status: { state: "inprogress" } }]));

    await expect(latestRecording("input-1")).resolves.toBeNull();
  });
});

describe("playback URLs", () => {
  it("builds player and HLS addresses from the customer code", () => {
    expect(streamIframeUrl("input-1")).toBe(
      "https://customer-abcd1234efgh5678.cloudflarestream.com/input-1/iframe",
    );
    expect(streamHlsUrl("input-1")).toBe(
      "https://customer-abcd1234efgh5678.cloudflarestream.com/input-1/manifest/video.m3u8",
    );
  });

  it("asks Cloudflare for a short-lived token", async () => {
    fetchMock.mockResolvedValue(ok({ token: "signed-token" }));

    await expect(playbackToken("input-1")).resolves.toBe("signed-token");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/stream/input-1/token");
    expect(init.method).toBe("POST");
    // Höchstens ein paar Stunden — eine weitergegebene Adresse soll ablaufen.
    const exp = JSON.parse(init.body).exp;
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 24 * 3600);
  });
});
