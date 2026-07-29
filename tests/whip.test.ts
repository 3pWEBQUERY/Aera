import { describe, expect, it, vi } from "vitest";
import { exchangeSdp, releaseResource, WhipError } from "@/lib/whip";

/**
 * Der WHIP/WHEP-Handgriff.
 *
 * Interessant ist hier nur, was leicht falsch gemacht wird: der Content-Type
 * (ohne ihn lehnt Cloudflare ab) und die Resource-Adresse, die relativ
 * zurueckkommen darf — wird sie falsch aufgeloest, meldet sich der Sender nie
 * ab und der Eingang gilt weiter als belegt.
 */

function sdpResponse(answer: string, location?: string, status = 201) {
  return {
    ok: status < 400,
    status,
    text: async () => answer,
    headers: new Headers(location ? { Location: location } : {}),
  } as Response;
}

describe("exchangeSdp", () => {
  it("posts the offer as application/sdp and returns the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sdpResponse("v=0 answer"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeSdp("https://cf.example/webRTC/publish", "v=0 offer");

    expect(result.answer).toBe("v=0 answer");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cf.example/webRTC/publish");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/sdp");
    expect(init.body).toBe("v=0 offer");
  });

  it("resolves a relative resource against the endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sdpResponse("a", "/sessions/42")));

    const result = await exchangeSdp("https://cf.example/webRTC/publish", "offer");

    expect(result.resource).toBe("https://cf.example/sessions/42");
  });

  it("keeps an absolute resource as it is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sdpResponse("a", "https://other.example/s/1")),
    );

    const result = await exchangeSdp("https://cf.example/webRTC/publish", "offer");

    expect(result.resource).toBe("https://other.example/s/1");
  });

  it("reports the status when the endpoint refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sdpResponse("", undefined, 403)));

    const error = await exchangeSdp("https://cf.example/x", "offer").then(
      () => null,
      (e: unknown) => e as WhipError,
    );

    expect(error).toBeInstanceOf(WhipError);
    expect(error!.status).toBe(403);
  });
});

describe("releaseResource", () => {
  it("sends a DELETE that survives the page unload", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    releaseResource("https://cf.example/sessions/42");

    expect(fetchMock).toHaveBeenCalledWith("https://cf.example/sessions/42", {
      method: "DELETE",
      keepalive: true,
    });
  });

  it("does nothing without a resource", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    releaseResource(null);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
