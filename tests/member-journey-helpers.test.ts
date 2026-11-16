import { describe, expect, it } from "vitest";
import { isCommunityReturnPath } from "@/lib/community-return-path";
import { htmlHasText } from "@/lib/forum-draft";

describe("isCommunityReturnPath", () => {
  it("akzeptiert Pfade innerhalb der Community", () => {
    expect(isCommunityReturnPath("/c/kochen/s/forum/abc", "kochen")).toBe(true);
    expect(isCommunityReturnPath("/c/kochen", "kochen")).toBe(true);
    expect(isCommunityReturnPath("/c/kochen/s/forum?x=1#comment-1", "kochen")).toBe(true);
  });
  it("lehnt fremde Communities, die Beitrittsseite und fremde Ziele ab", () => {
    expect(isCommunityReturnPath("/c/kochenplus/s/forum", "kochen")).toBe(false);
    expect(isCommunityReturnPath("/c/kochen/join", "kochen")).toBe(false);
    expect(isCommunityReturnPath("/c/kochen/join?tier=1", "kochen")).toBe(false);
    expect(isCommunityReturnPath("//evil.example/c/kochen", "kochen")).toBe(false);
    expect(isCommunityReturnPath("https://evil.example/c/kochen", "kochen")).toBe(false);
    expect(isCommunityReturnPath("/\\evil.example", "kochen")).toBe(false);
    expect(isCommunityReturnPath(null, "kochen")).toBe(false);
  });
});

describe("htmlHasText", () => {
  it("erkennt leere Editor-Inhalte", () => {
    expect(htmlHasText("")).toBe(false);
    expect(htmlHasText("<p><br></p>")).toBe(false);
    expect(htmlHasText("<p>&nbsp;</p>")).toBe(false);
  });
  it("erkennt Text und Bilder", () => {
    expect(htmlHasText("<p>Hallo</p>")).toBe(true);
    expect(htmlHasText('<img src="x.gif" alt="GIF" />')).toBe(true);
  });
});
