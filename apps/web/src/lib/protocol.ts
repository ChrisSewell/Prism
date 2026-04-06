// Binary framing protocol for file transfer over WebRTC data channels

export const PROTOCOL_VERSION = 1;

export enum FrameType {
  FILE_START = 1,
  CHUNK = 2,
  FILE_END = 3,
  ABORT = 4,
}

export interface FileStartPayload {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface ChunkPayload {
  fileId: string;
  offset: number;
  data: Uint8Array;
}

export interface FileEndPayload {
  fileId: string;
}

export interface AbortPayload {
  fileId: string;
  reason?: string;
}

export type Frame =
  | { type: FrameType.FILE_START; payload: FileStartPayload }
  | { type: FrameType.CHUNK; payload: ChunkPayload }
  | { type: FrameType.FILE_END; payload: FileEndPayload }
  | { type: FrameType.ABORT; payload: AbortPayload };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeFrame(frame: Frame): ArrayBuffer {
  let payloadBytes: Uint8Array;

  if (frame.type === FrameType.CHUNK) {
    const { fileId, offset, data } = frame.payload;
    const idBytes = new Uint8Array(36);
    const encoded = textEncoder.encode(fileId);
    idBytes.set(encoded.subarray(0, 36));
    
    payloadBytes = new Uint8Array(36 + 4 + data.byteLength);
    payloadBytes.set(idBytes, 0);
    const view = new DataView(payloadBytes.buffer, payloadBytes.byteOffset);
    view.setUint32(36, offset, false); // big-endian
    payloadBytes.set(data, 40);
  } else {
    let jsonPayload: object;
    if (frame.type === FrameType.FILE_START) {
      jsonPayload = frame.payload;
    } else if (frame.type === FrameType.FILE_END) {
      jsonPayload = frame.payload;
    } else {
      jsonPayload = frame.payload;
    }
    payloadBytes = textEncoder.encode(JSON.stringify(jsonPayload));
  }

  const totalLength = 6 + payloadBytes.byteLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const arr = new Uint8Array(buffer);

  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, frame.type);
  view.setUint32(2, totalLength, false); // big-endian
  arr.set(payloadBytes, 6);

  return buffer;
}

export function decodeFrame(buffer: ArrayBuffer): Frame {
  const view = new DataView(buffer);
  const arr = new Uint8Array(buffer);

  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version}`);
  }

  const type = view.getUint8(1) as FrameType;
  const payload = arr.subarray(6);

  switch (type) {
    case FrameType.CHUNK: {
      const fileIdBytes = payload.subarray(0, 36);
      const fileId = textDecoder.decode(fileIdBytes).replace(/\0+$/, '');
      const offset = new DataView(payload.buffer, payload.byteOffset + 36).getUint32(0, false);
      const data = payload.subarray(40);
      return { type, payload: { fileId, offset, data: new Uint8Array(data) } };
    }
    case FrameType.FILE_START: {
      const json = JSON.parse(textDecoder.decode(payload));
      return { type, payload: json as FileStartPayload };
    }
    case FrameType.FILE_END: {
      const json = JSON.parse(textDecoder.decode(payload));
      return { type, payload: json as FileEndPayload };
    }
    case FrameType.ABORT: {
      const json = JSON.parse(textDecoder.decode(payload));
      return { type, payload: json as AbortPayload };
    }
    default:
      throw new Error(`Unknown frame type: ${type}`);
  }
}

export function validateFilename(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (new Blob([name]).size > 1024) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(name)) return false;
  if (name.includes('../') || name.includes('..\\')) return false;
  if (name.startsWith('/') || name.startsWith('\\')) return false;
  return true;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSecond: number): string {
  return formatFileSize(bytesPerSecond) + '/s';
}
