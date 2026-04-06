import { describe, it, expect } from "vitest";
import { PROTOCOL_VERSION } from "../src/version.js";

describe("protocol version", () => {
  it("exports a numeric version", () => {
    expect(typeof PROTOCOL_VERSION).toBe("number");
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
  });
});
