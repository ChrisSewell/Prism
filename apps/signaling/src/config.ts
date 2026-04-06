export interface Config {
  port: number;
  nodeEnv: string;
  allowedOrigins: string[];
  maxPeersPerRoom: number;
  maxGlobalPeers: number;
  roomTtlMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  stunUrls: string[];
  turnUrls: string[];
  turnUsername: string;
  turnCredential: string;
  turnSecret: string;
  metricsEnabled: boolean;
  metricsBearerToken: string;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    allowedOrigins: parseList(process.env.SIGNALING_ALLOWED_ORIGINS),
    maxPeersPerRoom: parseInt(process.env.MAX_PEERS_PER_ROOM || "8", 10),
    maxGlobalPeers: parseInt(process.env.MAX_GLOBAL_PEERS || "100", 10),
    roomTtlMs: parseInt(process.env.ROOM_TTL_MS || "3600000", 10),
    rateLimitWindowMs: parseInt(
      process.env.RATE_LIMIT_WINDOW_MS || "60000",
      10,
    ),
    rateLimitMaxRequests: parseInt(
      process.env.RATE_LIMIT_MAX_REQUESTS || "60",
      10,
    ),
    stunUrls: parseList(process.env.STUN_URLS),
    turnUrls: parseList(process.env.TURN_URLS),
    turnUsername: process.env.TURN_USERNAME || "",
    turnCredential: process.env.TURN_CREDENTIAL || "",
    turnSecret: process.env.TURN_SECRET || "",
    metricsEnabled: process.env.METRICS_ENABLED === "true",
    metricsBearerToken: process.env.METRICS_BEARER_TOKEN || "",
  };
}
