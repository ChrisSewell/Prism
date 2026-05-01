export const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || "";
export const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_ENABLED === "true";
export const CHUNK_SIZE = 255 * 1024; // 255 KiB — leaves room for 46-byte frame header within SCTP 256 KiB limit
export const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16 MiB
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1 MiB

export const SOCKET_CONNECT_TIMEOUT_MS = 10_000;
export const PEER_REMOVAL_GRACE_MS = 3_000;
export const RELAY_DETECT_INITIAL_MS = 3_000;
export const RELAY_DETECT_FOLLOWUP_MS = 8_000;
export const RELAY_UPGRADE_INTERVAL_MS = 30_000;
export const RELAY_UPGRADE_VERIFY_MS = 5_000;

export const ICE_RESTART_MAX_ATTEMPTS = 3;
export const ICE_RESTART_BACKOFF_MS = [0, 2_000, 6_000] as const;
