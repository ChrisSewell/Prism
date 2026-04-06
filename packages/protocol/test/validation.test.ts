import { describe, it, expect } from "vitest";
import { validateFilename, MAX_FILENAME_BYTES } from "../src/validation.js";

describe("G1 — filename validation", () => {
  it("accepts a normal filename", () => {
    expect(validateFilename("photo.jpg")).toEqual({ valid: true });
  });

  it("accepts UTF-8 filenames", () => {
    expect(validateFilename("документ.pdf")).toEqual({ valid: true });
  });

  it("rejects empty filename", () => {
    const result = validateFilename("");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("empty");
  });

  it("rejects filename exceeding max bytes", () => {
    const longName = "a".repeat(MAX_FILENAME_BYTES + 1);
    const result = validateFilename(longName);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("bytes");
  });

  it("accepts filename at exactly max bytes", () => {
    const maxName = "a".repeat(MAX_FILENAME_BYTES);
    expect(validateFilename(maxName)).toEqual({ valid: true });
  });

  it("rejects filenames with control characters", () => {
    expect(validateFilename("file\x00name.txt").valid).toBe(false);
    expect(validateFilename("file\x07name.txt").valid).toBe(false);
  });

  it("rejects path traversal patterns", () => {
    expect(validateFilename("../etc/passwd").valid).toBe(false);
    expect(validateFilename("/etc/passwd").valid).toBe(false);
    expect(validateFilename("\\windows\\system32").valid).toBe(false);
  });
});
