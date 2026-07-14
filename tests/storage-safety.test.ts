import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  features: { storage: false },
  env: {
    S3_REGION: "auto",
    S3_ENDPOINT: "",
    S3_ACCESS_KEY_ID: "",
    S3_SECRET_ACCESS_KEY: "",
    S3_BUCKET: "",
  },
}));

import { uploadObject } from "@/lib/storage";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("uploadObject production safety", () => {
  it("fails closed when private object storage is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      uploadObject({
        key: "tenants/t1/gallery/example.jpg",
        body: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow("Private object storage is required");
  });
});
