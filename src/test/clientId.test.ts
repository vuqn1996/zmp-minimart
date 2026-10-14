import { describe, expect, it } from "vitest";

import { createClientId } from "../clientId.js";

describe("browser-compatible client IDs", () => {
  it("creates a UUID when Safari exposes getRandomValues but not randomUUID", () => {
    const legacySafariCrypto = {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        const bytes = array as unknown as Uint8Array;
        bytes.forEach((_value, index) => { bytes[index] = index; });
        return array;
      },
    };

    expect(createClientId(legacySafariCrypto)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("uses native randomUUID when available", () => {
    expect(createClientId({ randomUUID: () => "native-uuid" })).toBe("native-uuid");
  });
});
