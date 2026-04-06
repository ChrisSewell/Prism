# Operator Guide

## Deployment

### Docker Compose (recommended)

Docker Compose brings up four services: **web** (React SPA via nginx), **signaling** (Node.js), **coturn** (TURN/STUN), and **caddy** (TLS reverse proxy). Caddy routes `/socket.io`, `/api`, `/health`, and `/metrics` to signaling; everything else goes to the web UI.

1. Copy `.env.example` to `.env` and configure all values
2. Edit `Caddyfile` — replace `yourdomain.com` with your domain
3. Edit `coturn/turnserver.conf` — set `static-auth-secret` and `realm`
4. Run:

```bash
docker compose up -d
```

Caddy auto-provisions TLS via Let's Encrypt. Your app will be available at `https://yourdomain.com`.

#### `VITE_SIGNALING_URL`

The web UI connects to the signaling server at the same origin by default (empty `VITE_SIGNALING_URL`). This works out of the box with the Docker Compose setup because Caddy serves both the UI and the API on the same domain.

If you serve the UI from a different origin than the API, set `VITE_SIGNALING_URL` to the full signaling URL (e.g. `https://api.yourdomain.com`) and rebuild the web image:

```bash
docker compose build --build-arg VITE_SIGNALING_URL=https://api.yourdomain.com web
```

### Manual / bare metal

```bash
npm install
npm run build

# Start signaling server
cd apps/signaling && npm start

# Serve apps/web/dist with any static file server (nginx, caddy, etc.)
```

Run coturn separately and configure `.env` with your TURN URLs and credentials.

## TURN credential strategy

Two approaches for coturn authentication in a mesh:

1. **Shared ICE response** — One set of TURN credentials returned to all peers. Simple, fewer unique allocations. Set `TURN_USERNAME` and `TURN_CREDENTIAL` in `.env`.

2. **Short-lived per-peer** — Use coturn `use-auth-secret` with time-limited usernames. Better isolation but more allocations under heavy mesh. Set `TURN_SECRET` in `.env` (leave `TURN_USERNAME` and `TURN_CREDENTIAL` empty). The signaling server generates HMAC-SHA1 credentials per request with a 24-hour TTL.

**Clock skew**: If using time-bounded TURN usernames, ensure the server has accurate time (NTP).

## Firewall

| Port | Protocol | Service |
|------|----------|---------|
| 80 | TCP | Caddy (HTTP redirect) |
| 443 | TCP | Caddy (HTTPS + WSS) |
| 3478 | UDP + TCP | coturn STUN/TURN |
| 5349 | TCP | coturn TLS |
| 49152–49200 | UDP | coturn relay range |

Only expose ports 80 and 443 publicly if using Caddy. coturn ports must be reachable by clients.

## IPv6 / dual-stack

Document whether your host and coturn expose IPv4 only, IPv6 only, or both. Mismatches between server and client networks cause hard-to-debug ICE failures. Test with `stun:` and `turn:` URLs for both address families if dual-stack.

## Horizontal scaling

Single Node process + in-memory rooms works for moderate use. For multiple Node instances:

1. Add a **Socket.IO Redis adapter** so rooms and relay work across processes
2. Verify with integration tests that two server instances share room state
3. Load-balance WebSocket connections with sticky sessions or connection-aware routing

## Environment variables

See `.env.example` for the full list with descriptions.

## Resource limits

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_PEERS_PER_ROOM` | Max peers in one room | 8 |
| `MAX_GLOBAL_PEERS` | Total connected peers across all rooms | 100 |
| `ROOM_TTL_MS` | Idle room timeout | 3600000 (1 hour) |

Mesh creates O(N²) connections for N peers. Memory and CPU scale accordingly. Run load tests (G7) before advertising high limits.

## Log retention

Structured JSON logs by default. No long-term storage of SDP payloads. Operators with compliance needs should configure log rotation and archival externally (e.g., `logrotate`, ELK, Loki).
