/** Max filename length in bytes (UTF-8 encoded) */
export const MAX_FILENAME_BYTES = 1024;

/** Max chunk payload in bytes — 255 KiB leaves room for frame headers within SCTP 256 KiB limit */
export const MAX_CHUNK_PAYLOAD = 255 * 1024;

/** Max total frame size including headers */
export const MAX_FRAME_SIZE = MAX_CHUNK_PAYLOAD + 4096;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

export function validateFilename(name: string): {
  valid: boolean;
  reason?: string;
} {
  if (!name || name.length === 0) {
    return { valid: false, reason: "filename is empty" };
  }

  const encoded = new TextEncoder().encode(name);
  if (encoded.byteLength > MAX_FILENAME_BYTES) {
    return {
      valid: false,
      reason: `filename exceeds ${MAX_FILENAME_BYTES} bytes`,
    };
  }

  if (CONTROL_CHAR_RE.test(name)) {
    return { valid: false, reason: "filename contains control characters" };
  }

  if (name.includes("..") || name.startsWith("/") || name.startsWith("\\")) {
    return { valid: false, reason: "filename contains path traversal" };
  }

  return { valid: true };
}
