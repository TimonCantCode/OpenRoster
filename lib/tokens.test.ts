import { describe, expect, it } from "vitest";
import { createToken, hashToken } from "./tokens";

describe("tokens", () => {
  it("creates unpredictable-looking tokens and stable hashes", () => {
    const first = createToken();
    const second = createToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(first)).toBe(hashToken(first));
    expect(hashToken(first)).not.toBe(first);
  });
});
