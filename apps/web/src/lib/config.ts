export const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || "";
export const CHUNK_SIZE = 256 * 1024; // 256 KiB
export const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16 MiB
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1 MiB
