import { describe, expect, it } from "vitest";

import { normalizeRestoredCart } from "../cart.js";

describe("restored cart", () => {
  it("drops missing and sold-out SKUs and clamps quantities to current backend stock", () => {
    expect(normalizeRestoredCart(
      [
        { skuId: "available", quantity: 8 },
        { skuId: "sold-out", quantity: 2 },
        { skuId: "missing", quantity: 1 },
      ],
      new Map([
        ["available", 3],
        ["sold-out", 0],
      ]),
    )).toEqual({ cart: { available: 3 }, changed: true });
  });

  it("keeps an already valid cart unchanged", () => {
    expect(normalizeRestoredCart(
      [{ skuId: "available", quantity: 2 }],
      new Map([["available", 3]]),
    )).toEqual({ cart: { available: 2 }, changed: false });
  });

  it("normalizes fractional quantities to whole items", () => {
    expect(normalizeRestoredCart(
      [{ skuId: "available", quantity: 1.2 }],
      new Map([["available", 1.2]]),
    )).toEqual({ cart: { available: 1 }, changed: true });
  });
});
