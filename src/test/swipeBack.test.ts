import { describe, expect, it } from "vitest";

import { isBackSwipe } from "../swipeBack.js";

describe("back swipe", () => {
  it("accepts a deliberate right swipe from the left edge only", () => {
    expect(isBackSwipe(20, 80, 12)).toBe(true);
    expect(isBackSwipe(40, 80, 12)).toBe(false);
    expect(isBackSwipe(20, 60, 12)).toBe(false);
    expect(isBackSwipe(20, 80, 90)).toBe(false);
  });
});
