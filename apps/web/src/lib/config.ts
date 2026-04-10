export const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || "";
export const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_ENABLED === "true";
export const CHUNK_SIZE = 255 * 1024; // 255 KiB — leaves room for 46-byte frame header within SCTP 256 KiB limit
export const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16 MiB
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1 MiB
