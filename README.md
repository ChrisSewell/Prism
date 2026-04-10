# Prism

Self-hosted, peer-to-peer file sharing over WebRTC data channels with mesh signaling.

## Overview

**Prism** lets people send files directly between browsers. A lightweight signaling server coordinates peer discovery and connection setup; file bytes never touch the server.

- **Full mesh**: Many peers per room; each pair gets its own data channel
- **Self-hosted**: Run on your own machine or VPS with Docker Compose
- **Secure by default**: Helmet headers, CORS allowlist, rate limiting, encrypted data channels (DTLS)
- **No accounts required**: Share a room code with peers to connect
- **Optional display names**: Set a name before joining or edit it in-room — stored in your browser only, never on the server

## Quick Start

```bash
# Clone and install
git clone git@github.com:ChrisSewell/Prism.git prism
cd prism
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Development (two terminals)

```bash
# Terminal 1 — signaling server
cd apps/signaling
npm run dev

# Terminal 2 — web UI (Vite dev server, proxies API to localhost:3000)
cd apps/web
npm run dev
```

Open `http://localhost:8080` in your browser.

### Production (Docker Compose)

```bash
cp .env.example .env   # edit values for your domain
# edit Caddyfile — replace yourdomain.com
# edit coturn/turnserver.conf — set static-auth-secret and realm
docker compose up -d
```

See [docs/operators.md](docs/operators.md) for the full deployment guide, TURN credential strategy, firewall rules, and scaling notes.

## Architecture

```
Browser A ──┐                    ┌── Browser B
            │  signaling (WSS)   │
            ├──── Server ────────┤
            │                    │
Browser C ──┘                    └── Browser D
            ╲                    ╱
             ╲  P2P DataChannel ╱
              ╲  (DTLS encrypted)╱
               ╲──────────────╱
```

The signaling server handles:
- Room creation and management (short codes, TTL, peer caps)
- Roster events (`peer:joined`, `peer:left`)
- Directed relay of SDP offers/answers and ICE candidates
- ICE server configuration endpoint (STUN + TURN with short-lived credentials)

File bytes are transferred peer-to-peer over WebRTC data channels using a versioned binary framing protocol. Connections use aggressive NAT traversal with pre-allocated candidate pools, diverse STUN servers, and automatic ICE restart on failure. When direct P2P is not possible (e.g. symmetric NAT), connections fall back to the TURN relay.

## Project Structure

```
├── apps/
│   ├── web/           # React SPA (Vite + Tailwind + shadcn/ui)
│   └── signaling/     # Express + Socket.IO signaling server
├── packages/
│   └── protocol/      # Shared types and binary framing codec
├── docs/              # Signaling contract, security, operator guides
├── docker-compose.yml # Production deployment (web + signaling + coturn + Caddy)
└── .env.example       # Environment variable reference
```

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Signaling server port | `3000` |
| `SIGNALING_ALLOWED_ORIGINS` | CORS allowlist (comma-separated) | — |
| `MAX_PEERS_PER_ROOM` | Max peers in a single room | `8` |
| `MAX_GLOBAL_PEERS` | Max total connected peers | `100` |
| `ROOM_TTL_MS` | Room idle timeout (ms) | `3600000` |
| `TURN_URLS` | TURN server URL(s) | — |
| `TURN_SECRET` | coturn shared secret | — |

See `.env.example` for the full list.

## Testing

```bash
npm test              # Run all test suites
npm run test:security # Run security-focused tests only
npm run lint          # ESLint
npm run typecheck     # TypeScript project references check
npm run audit:check   # npm audit --audit-level=high
```

## Operator Responsibility

Prism facilitates peer-to-peer file transfer. It does not include content moderation, DMCA workflows, or user authentication. Operators who self-host this software are responsible for how it is used on their infrastructure and for compliance with applicable laws.

## License

[MIT](LICENSE)
