import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  magicBytesMatch,
  validateUploadDeclaration,
} from "@/lib/upload-policy";

describe("upload policy", () => {
  it("enforces purpose-specific media kinds", () => {
    expect(
      validateUploadDeclaration({
        purpose: "avatar",
        contentType: "video/mp4",
        sizeBytes: 1024,
      }),
    ).toEqual({ ok: false, error: "type" });
    expect(
      validateUploadDeclaration({
        purpose: "course-video",
        contentType: "image/png",
        sizeBytes: 1024,
      }),
    ).toEqual({ ok: false, error: "type" });
  });

  it("keeps the unassigned media library private", () => {
    const result = validateUploadDeclaration({
      purpose: "library",
      contentType: "image/png",
      sizeBytes: 1024,
    });
    expect(result.ok && result.policy.visibility).toBe("MEMBERS");
  });

  it("rejects unknown purposes, zero bytes and oversized images", () => {
    expect(
      validateUploadDeclaration({
        purpose: "unknown",
        contentType: "image/png",
        sizeBytes: 1,
      }),
    ).toEqual({ ok: false, error: "purpose" });
    expect(
      validateUploadDeclaration({
        purpose: "avatar",
        contentType: "image/png",
        sizeBytes: 0,
      }),
    ).toEqual({ ok: false, error: "size" });
    expect(
      validateUploadDeclaration({
        purpose: "avatar",
        contentType: "image/png",
        sizeBytes: MAX_IMAGE_BYTES + 1,
      }),
    ).toEqual({ ok: false, error: "size" });
  });

  it("accepts real signatures and rejects MIME spoofing", () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const fakePng = new TextEncoder().encode("<script>alert(1)</script>");
    expect(magicBytesMatch("image/png", png)).toBe(true);
    expect(magicBytesMatch("image/png", fakePng)).toBe(false);

    const mp4 = Uint8Array.from([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    expect(magicBytesMatch("video/mp4", mp4)).toBe(true);
    expect(magicBytesMatch("image/jpeg", mp4)).toBe(false);
  });
  it("accepts PDF and Office/ZIP document attachments, rejects spoofs", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n....");
    const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(magicBytesMatch("application/pdf", pdf)).toBe(true);
    expect(magicBytesMatch("application/zip", zip)).toBe(true);
    expect(
      magicBytesMatch(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        zip,
      ),
    ).toBe(true);
    const fakePdf = new TextEncoder().encode("not a pdf at all here");
    expect(magicBytesMatch("application/pdf", fakePdf)).toBe(false);

    const attach = validateUploadDeclaration({
      purpose: "blog-file",
      contentType: "application/pdf",
      sizeBytes: 2048,
    });
    expect(attach.ok && attach.kind).toBe("file");
    expect(
      validateUploadDeclaration({
        purpose: "blog-image",
        contentType: "application/pdf",
        sizeBytes: 2048,
      }),
    ).toEqual({ ok: false, error: "type" });
  });
});
