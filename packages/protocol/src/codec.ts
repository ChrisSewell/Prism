import { PROTOCOL_VERSION } from "./version.js";
import type { Frame, ChunkFrame } from "./types.js";
import { MAX_CHUNK_PAYLOAD, MAX_FRAME_SIZE } from "./validation.js";

/**
 * Wire format (binary, big-endian):
 *   [1 byte  version]
 *   [1 byte  frame type id]
 *   [4 bytes total frame length (including header)]
 *   [... payload ...]
 *
 * Frame type ids:
 *   1 = file-start  (JSON payload)
 *   2 = chunk        (16-byte fileId + 4-byte offset + binary payload)
 *   3 = file-end     (JSON payload)
 *   4 = abort        (JSON payload)
 */

export const enum FrameTypeId {
  FileStart = 1,
  Chunk = 2,
  FileEnd = 3,
  Abort = 4,
}

const HEADER_SIZE = 6;
const CHUNK_META_SIZE = 40; // 36-byte fileId (UUID) as UTF-8 + 4-byte offset

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function typeToId(type: Frame["type"]): FrameTypeId {
  switch (type) {
    case "file-start":
      return FrameTypeId.FileStart;
    case "chunk":
      return FrameTypeId.Chunk;
    case "file-end":
      return FrameTypeId.FileEnd;
    case "abort":
      return FrameTypeId.Abort;
  }
}

export function encodeFrame(frame: Frame): ArrayBuffer {
  const typeId = typeToId(frame.type);

  if (frame.type === "chunk") {
    return encodeChunk(frame);
  }

  const jsonPayload = encodeJsonPayload(frame);
  const totalLength = HEADER_SIZE + jsonPayload.byteLength;

  if (totalLength > MAX_FRAME_SIZE) {
    throw new Error(
      `Frame exceeds MAX_FRAME_SIZE: ${totalLength} > ${MAX_FRAME_SIZE}`,
    );
  }

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, typeId);
  view.setUint32(2, totalLength);
  bytes.set(jsonPayload, HEADER_SIZE);

  return buffer;
}

function encodeChunk(frame: ChunkFrame): ArrayBuffer {
  if (frame.payload.byteLength > MAX_CHUNK_PAYLOAD) {
    throw new Error(
      `Chunk payload exceeds MAX_CHUNK_PAYLOAD: ${frame.payload.byteLength} > ${MAX_CHUNK_PAYLOAD}`,
    );
  }

  const fileIdBytes = textEncoder.encode(frame.fileId);
  if (fileIdBytes.byteLength > 36) {
    throw new Error("fileId exceeds 36 bytes");
  }

  const totalLength =
    HEADER_SIZE + CHUNK_META_SIZE + frame.payload.byteLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, FrameTypeId.Chunk);
  view.setUint32(2, totalLength);

  const fileIdPadded = new Uint8Array(36);
  fileIdPadded.set(fileIdBytes);
  bytes.set(fileIdPadded, HEADER_SIZE);

  view.setUint32(HEADER_SIZE + 36, frame.offset);
  bytes.set(frame.payload, HEADER_SIZE + CHUNK_META_SIZE);

  return buffer;
}

function encodeJsonPayload(
  frame: Exclude<Frame, ChunkFrame>,
): Uint8Array {
  const { type: _type, ...rest } = frame;
  return textEncoder.encode(JSON.stringify(rest));
}

export function decodeFrame(data: ArrayBuffer): Frame {
  if (data.byteLength < HEADER_SIZE) {
    throw new Error(
      `Frame too small: ${data.byteLength} bytes (minimum ${HEADER_SIZE})`,
    );
  }

  if (data.byteLength > MAX_FRAME_SIZE) {
    throw new Error(
      `Frame exceeds MAX_FRAME_SIZE: ${data.byteLength} > ${MAX_FRAME_SIZE}`,
    );
  }

  const view = new DataView(data);
  const version = view.getUint8(0);

  if (version !== PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported protocol version: ${version} (expected ${PROTOCOL_VERSION})`,
    );
  }

  const typeId = view.getUint8(1) as FrameTypeId;
  const declaredLength = view.getUint32(2);

  if (declaredLength !== data.byteLength) {
    throw new Error(
      `Frame length mismatch: declared ${declaredLength}, actual ${data.byteLength}`,
    );
  }

  switch (typeId) {
    case FrameTypeId.Chunk:
      return decodeChunk(data);

    case FrameTypeId.FileStart: {
      const json = parseJsonPayload(data);
      return {
        type: "file-start",
        fileId: json.fileId as string,
        name: json.name as string,
        size: json.size as number,
        mimeType: json.mimeType as string,
        ...(json.sha256 ? { sha256: json.sha256 as string } : {}),
      };
    }

    case FrameTypeId.FileEnd: {
      const json = parseJsonPayload(data);
      return { type: "file-end", fileId: json.fileId as string };
    }

    case FrameTypeId.Abort: {
      const json = parseJsonPayload(data);
      return {
        type: "abort",
        fileId: json.fileId as string,
        ...(json.reason ? { reason: json.reason as string } : {}),
      };
    }

    default:
      throw new Error(`Unknown frame type id: ${typeId}`);
  }
}

function decodeChunk(data: ArrayBuffer): ChunkFrame {
  if (data.byteLength < HEADER_SIZE + CHUNK_META_SIZE) {
    throw new Error("Chunk frame too small for metadata");
  }

  const view = new DataView(data);
  const bytes = new Uint8Array(data);

  const fileIdRaw = bytes.slice(HEADER_SIZE, HEADER_SIZE + 36);
  const nullIdx = fileIdRaw.indexOf(0);
  const fileId = textDecoder.decode(
    nullIdx >= 0 ? fileIdRaw.slice(0, nullIdx) : fileIdRaw,
  );

  const offset = view.getUint32(HEADER_SIZE + 36);
  const payload = new Uint8Array(
    data.slice(HEADER_SIZE + CHUNK_META_SIZE),
  );

  return { type: "chunk", fileId, offset, payload };
}

function parseJsonPayload(data: ArrayBuffer): Record<string, unknown> {
  const jsonBytes = new Uint8Array(data, HEADER_SIZE);
  const jsonStr = textDecoder.decode(jsonBytes);
  return JSON.parse(jsonStr) as Record<string, unknown>;
}
