import { CHUNK_SIZE, MAX_BUFFERED_AMOUNT, BUFFERED_AMOUNT_LOW_THRESHOLD } from "./config";
import { encodeFrame, decodeFrame, FrameType, validateFilename } from "./protocol";
import type { TransferState } from "./types";
import { v4 as uuidv4 } from "uuid";

const log = (...args: unknown[]) => console.log("[webrtc]", ...args);

export function createPeerConnection(
  iceServers: RTCIceServer[],
  onIceCandidate: (candidate: RTCIceCandidate) => void,
  onConnectionStateChange: (state: RTCPeerConnectionState) => void,
  onDataChannel: (channel: RTCDataChannel) => void,
): RTCPeerConnection {
  log("createPeerConnection: creating with", iceServers.length, "ICE server configs");
  const pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      log("onicecandidate: candidate=", e.candidate.candidate?.substring(0, 80));
      onIceCandidate(e.candidate);
    } else {
      log("onicecandidate: ICE gathering complete (null candidate)");
    }
  };

  pc.onconnectionstatechange = () => {
    log("onconnectionstatechange:", pc.connectionState);
    onConnectionStateChange(pc.connectionState);
  };

  pc.ondatachannel = (e) => {
    log("ondatachannel: received channel", e.channel.label, "readyState=", e.channel.readyState);
    setupDataChannel(e.channel);
    onDataChannel(e.channel);
  };

  return pc;
}

export function createDataChannel(pc: RTCPeerConnection): RTCDataChannel {
  log("createDataChannel: creating 'file-transfer' channel");
  const dc = pc.createDataChannel("file-transfer", { ordered: true });
  setupDataChannel(dc);
  return dc;
}

function setupDataChannel(dc: RTCDataChannel) {
  dc.binaryType = "arraybuffer";
  dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
}

const PROGRESS_THROTTLE_MS = 150;
const YIELD_INTERVAL_CHUNKS = 64;

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function sendFile(
  file: File,
  dc: RTCDataChannel,
  peerId: string,
  peerLabel: string,
  onProgress: (transfer: Partial<TransferState> & { fileId: string; peerId: string }) => void,
  abortSignal: AbortSignal,
): Promise<TransferState> {
  const fileId = uuidv4();
  const transfer: TransferState = {
    fileId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    bytesTransferred: 0,
    status: "pending",
    direction: "sending",
    peerId,
    peerLabel,
    startTime: Date.now(),
    file,
  };

  onProgress({ ...transfer });

  const startFrame = encodeFrame({
    type: FrameType.FILE_START,
    payload: { fileId, name: file.name, size: file.size, mimeType: transfer.mimeType },
  });
  dc.send(startFrame);

  transfer.status = "transferring";
  onProgress({ fileId, peerId, status: "transferring" });

  const reader = file.stream().getReader();
  let offset = 0;
  let lastProgressTime = Date.now();
  let chunksSinceYield = 0;

  try {
    while (true) {
      if (abortSignal.aborted) {
        dc.send(encodeFrame({ type: FrameType.ABORT, payload: { fileId, reason: "User cancelled" } }));
        transfer.status = "cancelled";
        onProgress({ fileId, peerId, status: "cancelled" });
        return transfer;
      }

      const { done, value } = await reader.read();
      if (done) break;

      let pos = 0;
      while (pos < value.byteLength) {
        const chunkData = value.subarray(pos, pos + CHUNK_SIZE);

        if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await new Promise<void>((resolve) => {
            dc.onbufferedamountlow = () => {
              dc.onbufferedamountlow = null;
              resolve();
            };
          });
        }

        const chunkFrame = encodeFrame({
          type: FrameType.CHUNK,
          payload: { fileId, offset, data: chunkData },
        });
        dc.send(chunkFrame);

        offset += chunkData.byteLength;
        pos += chunkData.byteLength;
        transfer.bytesTransferred = offset;
        chunksSinceYield++;

        const now = Date.now();
        if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
          onProgress({ fileId, peerId, bytesTransferred: offset });
          lastProgressTime = now;
        }

        if (chunksSinceYield >= YIELD_INTERVAL_CHUNKS) {
          chunksSinceYield = 0;
          await yieldToMainThread();
        }
      }
    }

    dc.send(encodeFrame({ type: FrameType.FILE_END, payload: { fileId } }));
    transfer.status = "completed";
    transfer.bytesTransferred = file.size;
    onProgress({ fileId, peerId, status: "completed", bytesTransferred: file.size });
  } catch (err) {
    transfer.status = "failed";
    onProgress({ fileId, peerId, status: "failed" });
    try {
      dc.send(encodeFrame({ type: FrameType.ABORT, payload: { fileId, reason: String(err) } }));
    } catch { /* ignore */ }
  }

  return transfer;
}

export function handleIncomingFrame(
  buffer: ArrayBuffer,
  incomingTransfers: Map<string, TransferState>,
  peerId: string,
  peerLabel: string,
  onTransferUpdate: (fileId: string, transfer: TransferState) => void,
) {
  const frame = decodeFrame(buffer);

  switch (frame.type) {
    case FrameType.FILE_START: {
      const { fileId, name, size, mimeType } = frame.payload;
      if (!validateFilename(name)) {
        console.warn("Invalid filename received:", name);
        return;
      }
      const transfer: TransferState = {
        fileId,
        fileName: name,
        fileSize: size,
        mimeType,
        bytesTransferred: 0,
        status: "transferring",
        direction: "receiving",
        peerId,
        peerLabel,
        startTime: Date.now(),
        chunks: [],
      };
      incomingTransfers.set(fileId, transfer);
      onTransferUpdate(fileId, { ...transfer });
      break;
    }
    case FrameType.CHUNK: {
      const { fileId, data } = frame.payload;
      const transfer = incomingTransfers.get(fileId);
      if (!transfer) return;
      transfer.chunks!.push(new Uint8Array(data));
      transfer.bytesTransferred += data.byteLength;
      const now = Date.now();
      if (!transfer.lastProgressTime || now - transfer.lastProgressTime >= PROGRESS_THROTTLE_MS) {
        transfer.lastProgressTime = now;
        onTransferUpdate(fileId, { ...transfer });
      }
      break;
    }
    case FrameType.FILE_END: {
      const { fileId } = frame.payload;
      const transfer = incomingTransfers.get(fileId);
      if (!transfer) return;
      const blob = new Blob(transfer.chunks! as BlobPart[], { type: transfer.mimeType });
      transfer.blobUrl = URL.createObjectURL(blob);
      transfer.status = "completed";
      transfer.chunks = undefined;
      onTransferUpdate(fileId, { ...transfer });
      break;
    }
    case FrameType.ABORT: {
      const { fileId } = frame.payload;
      const transfer = incomingTransfers.get(fileId);
      if (!transfer) return;
      transfer.status = "cancelled";
      transfer.chunks = undefined;
      onTransferUpdate(fileId, { ...transfer });
      break;
    }
  }
}
