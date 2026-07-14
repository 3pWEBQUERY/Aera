import { describe, it, expect } from "vitest";
import { isLessonUnlocked, lessonAvailableAt, daysUntilUnlock } from "@/lib/drip";

const DAY = 86_400_000;
const joined = new Date("2026-07-01T10:00:00Z");

describe("isLessonUnlocked", () => {
  it("lessons without drip are always unlocked", () => {
    expect(isLessonUnlocked(joined, null)).toBe(true);
    expect(isLessonUnlocked(joined, 0)).toBe(true);
    expect(isLessonUnlocked(null, null)).toBe(true);
  });

  it("locks dripped lessons before the offset and unlocks after", () => {
    const drip = 7;
    expect(isLessonUnlocked(joined, drip, new Date(joined.getTime() + 6 * DAY))).toBe(false);
    expect(isLessonUnlocked(joined, drip, new Date(joined.getTime() + 7 * DAY))).toBe(true);
    expect(isLessonUnlocked(joined, drip, new Date(joined.getTime() + 30 * DAY))).toBe(true);
  });

  it("keeps dripped lessons locked without a membership", () => {
    expect(isLessonUnlocked(null, 7)).toBe(false);
    expect(isLessonUnlocked(undefined, 1)).toBe(false);
  });
});

describe("lessonAvailableAt / daysUntilUnlock", () => {
  it("computes the unlock timestamp", () => {
    expect(lessonAvailableAt(joined, 3).getTime()).toBe(joined.getTime() + 3 * DAY);
    expect(lessonAvailableAt(joined, null).getTime()).toBe(joined.getTime());
  });

  it("counts remaining days, rounded up", () => {
    const now = new Date(joined.getTime() + 1.5 * DAY);
    expect(daysUntilUnlock(joined, 7, now)).toBe(6); // 5.5 -> 6
    expect(daysUntilUnlock(joined, 7, new Date(joined.getTime() + 8 * DAY))).toBe(0);
  });
});
