import { describe, it, expect } from "vitest";
import { encodeFrame, decodeFrame } from "../../src/codec.js";
import { PROTOCOL_VERSION } from "../../src/version.js";
import { MAX_CHUNK_PAYLOAD, MAX_FRAME_SIZE } from "../../src/validation.js";
import type { ChunkFrame } from "../../src/types.js";
import crypto from "node:crypto";

describe("S1 — protocol abuse", () => {
  const fileId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("rejects frames smaller than header size", () => {
    const tiny = new ArrayBuffer(3);
    expect(() => decodeFrame(tiny)).toThrow(/too small/i);
  });

  it("rejects frames exceeding MAX_FRAME_SIZE", () => {
    const huge = new ArrayBuffer(MAX_FRAME_SIZE + 1);
    expect(() => decodeFrame(huge)).toThrow(/MAX_FRAME_SIZE/i);
  });

  it("rejects wrong protocol version", () => {
    const frame = encodeFrame({ type: "file-end", fileId });
    const view = new DataView(frame);
    view.setUint8(0, PROTOCOL_VERSION + 1);
    expect(() => decodeFrame(frame)).toThrow(/version/i);
  });

  it("rejects version 0", () => {
    const frame = encodeFrame({ type: "file-end", fileId });
    const view = new DataView(frame);
    view.setUint8(0, 0);
    expect(() => decodeFrame(frame)).toThrow(/version/i);
  });

  it("rejects unknown frame type id", () => {
    const frame = encodeFrame({ type: "file-end", fileId });
    const view = new DataView(frame);
    view.setUint8(1, 255);
    expect(() => decodeFrame(frame)).toThrow(/unknown frame type/i);
  });

  it("rejects frame with mismatched declared length", () => {
    const frame = encodeFrame({ type: "file-end", fileId });
    const view = new DataView(frame);
    view.setUint32(2, 9999);
    expect(() => decodeFrame(frame)).toThrow(/length mismatch/i);
  });

  it("rejects chunk payload exceeding MAX_CHUNK_PAYLOAD", () => {
    const oversized = new Uint8Array(MAX_CHUNK_PAYLOAD + 1);
    const frame: ChunkFrame = {
      type: "chunk",
      fileId,
      offset: 0,
      payload: oversized,
    };
    expect(() => encodeFrame(frame)).toThrow(/MAX_CHUNK_PAYLOAD/i);
  });

  it("accepts chunk at exactly MAX_CHUNK_PAYLOAD", () => {
    const maxPayload = new Uint8Array(MAX_CHUNK_PAYLOAD);
    const frame: ChunkFrame = {
      type: "chunk",
      fileId,
      offset: 0,
      payload: maxPayload,
    };
    expect(() => encodeFrame(frame)).not.toThrow();
  });

  it("truncated chunk metadata does not crash", () => {
    const frame = encodeFrame({
      type: "chunk",
      fileId,
      offset: 0,
      payload: new Uint8Array([1]),
    });
    const truncated = frame.slice(0, 10);
    const view = new DataView(truncated);
    view.setUint32(2, truncated.byteLength);
    expect(() => decodeFrame(truncated)).toThrow();
  });

  describe("fuzz — random bytes", () => {
    it("does not crash on 100 random buffers", () => {
      for (let i = 0; i < 100; i++) {
        const size = Math.floor(Math.random() * 200) + 6;
        const buf = new ArrayBuffer(size);
        const bytes = new Uint8Array(buf);
        crypto.getRandomValues(bytes);
        const view = new DataView(buf);
        view.setUint32(2, size);

        try {
          decodeFrame(buf);
        } catch {
          // Expected — just must not crash the process
        }
      }
    });
  });

  it("corrupted JSON payload throws without crash", () => {
    const frame = encodeFrame({ type: "file-end", fileId });
    const bytes = new Uint8Array(frame);
    // Corrupt the JSON portion
    for (let i = 6; i < bytes.length; i++) {
      bytes[i] = 0xff;
    }
    expect(() => decodeFrame(frame)).toThrow();
  });
});
