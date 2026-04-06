export type FrameType = "file-start" | "chunk" | "file-end" | "abort";

export interface FileStartFrame {
  type: "file-start";
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  sha256?: string;
}

export interface ChunkFrame {
  type: "chunk";
  fileId: string;
  offset: number;
  payload: Uint8Array;
}

export interface FileEndFrame {
  type: "file-end";
  fileId: string;
}

export interface AbortFrame {
  type: "abort";
  fileId: string;
  reason?: string;
}

export type Frame = FileStartFrame | ChunkFrame | FileEndFrame | AbortFrame;
