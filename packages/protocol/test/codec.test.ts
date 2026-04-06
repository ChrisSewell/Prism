import { describe, it, expect } from "vitest";
import { encodeFrame, decodeFrame } from "../src/codec.js";
import { PROTOCOL_VERSION } from "../src/version.js";
import { MAX_CHUNK_PAYLOAD } from "../src/validation.js";
import type { Frame, FileStartFrame, ChunkFrame } from "../src/types.js";
import crypto from "node:crypto";

describe("G1 — codec round-trip", () => {
  const fileId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("round-trips a file-start frame", () => {
    const frame: FileStartFrame = {
      type: "file-start",
      fileId,
      name: "photo.jpg",
      size: 1024000,
      mimeType: "image/jpeg",
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    expect(decoded).toEqual(frame);
  });

  it("round-trips a file-start frame with sha256", () => {
    const frame: FileStartFrame = {
      type: "file-start",
      fileId,
      name: "doc.pdf",
      size: 2048,
      mimeType: "application/pdf",
      sha256: "abc123def456",
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    expect(decoded).toEqual(frame);
  });

  it("round-trips a chunk frame", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const frame: ChunkFrame = {
      type: "chunk",
      fileId,
      offset: 0,
      payload,
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded) as ChunkFrame;
    expect(decoded.type).toBe("chunk");
    expect(decoded.fileId).toBe(fileId);
    expect(decoded.offset).toBe(0);
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3, 4, 5]);
  });

  it("round-trips a chunk frame at non-zero offset", () => {
    const payload = new Uint8Array(1024);
    payload.fill(0xab);
    const frame: ChunkFrame = {
      type: "chunk",
      fileId,
      offset: 65536,
      payload,
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded) as ChunkFrame;
    expect(decoded.offset).toBe(65536);
    expect(decoded.payload.byteLength).toBe(1024);
    expect(decoded.payload[0]).toBe(0xab);
  });

  it("round-trips a file-end frame", () => {
    const frame: Frame = { type: "file-end", fileId };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    expect(decoded).toEqual(frame);
  });

  it("round-trips an abort frame", () => {
    const frame: Frame = {
      type: "abort",
      fileId,
      reason: "user cancelled",
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    expect(decoded).toEqual(frame);
  });

  it("round-trips abort without reason", () => {
    const frame: Frame = { type: "abort", fileId };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    expect(decoded).toEqual(frame);
  });

  it("round-trips chunk at MAX_CHUNK_PAYLOAD size", () => {
    const payload = new Uint8Array(MAX_CHUNK_PAYLOAD);
    crypto.getRandomValues(payload);
    const frame: ChunkFrame = { type: "chunk", fileId, offset: 0, payload };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded) as ChunkFrame;
    expect(decoded.payload.byteLength).toBe(MAX_CHUNK_PAYLOAD);
  });

  it("encodes the protocol version in the first byte", () => {
    const frame: Frame = { type: "file-end", fileId };
    const encoded = encodeFrame(frame);
    const view = new DataView(encoded);
    expect(view.getUint8(0)).toBe(PROTOCOL_VERSION);
  });

  it("round-trips UTF-8 filenames", () => {
    const frame: FileStartFrame = {
      type: "file-start",
      fileId,
      name: "日本語ファイル.txt",
      size: 100,
      mimeType: "text/plain",
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded) as FileStartFrame;
    expect(decoded.name).toBe("日本語ファイル.txt");
  });
});
