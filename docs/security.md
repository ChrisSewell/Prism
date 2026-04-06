# Security

## Threat model

The signaling server is assumed to be reachable from the public internet. Friends-only access is enforced by sharing room codes privately, not by network restrictions.

## Transport

- **TLS everywhere**: HTTPS + WSS in production via reverse proxy (Caddy auto-TLS or nginx + certbot)
- **HSTS**: Set at the reverse proxy (`Strict-Transport-Security`)
- **No mixed content**: All resources served over HTTPS

## HTTP hardening

- **Helmet**: Express middleware sets `X-Content-Type-Options: nosniff`, `X-Frame-Options`, CSP, and other security headers
- **No `X-Powered-By`**: Disabled
- **Error responses**: Generic JSON errors; no stack traces, file paths, or env values leaked (tested in S0)

## CORS and origin policy

- **HTTP**: CORS allowlist via `SIGNALING_ALLOWED_ORIGINS` env. `Access-Control-Allow-Origin` only set for listed origins. Never `*` with credentials.
- **WebSocket**: Socket.IO `allowRequest` enforces the same origin allowlist on upgrade requests (tested in S3)

## Rate limiting

- Per-IP rate limiting on all HTTP routes (`express-rate-limit`)
- Socket.IO `maxHttpBufferSize` caps signaling message size at 16 KiB
- Room creation, join, and signaling relay are bounded by rate limits

## Room security

- **Unguessable codes**: 6+ chars from `crypto.randomBytes`, base64url encoded
- **No room enumeration**: Join requires the exact code; no listing API
- **Max peers enforced**: Server-side check on every join
- **Global peer cap**: Prevents resource exhaustion across all rooms
- **TTL eviction**: Idle rooms cleaned up automatically
- **Membership checks**: Every relayed signal verified against room membership (tested in S2)

## Signaling integrity

- **Server-authoritative `fromPeerId`**: Client-supplied sender ID is ignored; server sets it from the authenticated socket session
- **Cross-room relay impossible**: Target peer must be in the same room
- **Protocol version handshake**: Unknown major versions rejected on connect

## WebRTC data path

- File bytes are transferred P2P over WebRTC data channels encrypted with **DTLS**
- The signaling server **never sees file content** — only SDP, ICE candidates, and room metadata
- Operators and anyone with server access can see IPs, SDP, and signaling metadata in logs

## TURN credentials

- Prefer short-lived credentials via coturn `use-auth-secret`
- Never commit real secrets to the repository
- Rotate `static-auth-secret` operationally
- TURN password is never included in error responses (tested in S3)

## Container posture

- Dockerfile runs as **non-root** user (`appuser`)
- Multi-stage build; production image contains only runtime files
- Secrets via environment variables, not baked into layers

## Metrics endpoint

- Optional `GET /metrics` — **do not expose publicly** without protection
- Bind to internal network, reverse-proxy allowlist, or require Bearer token (`METRICS_BEARER_TOKEN`)

## Log retention

- Structured JSON logs, no full SDP by default
- No TURN passwords in logs
- Correlation IDs per connection for tracing
- Default: rotate daily, no long-term archival of signaling payloads
- Operators with compliance needs override locally

## Security test gates

| Gate | Scope |
|------|-------|
| S0 | HTTP headers, error body safety, npm audit |
| S1 | Protocol frame abuse, fuzz, boundary |
| S2 | Signaling abuse, cross-room, spoofing, flood, protocolVersion |
| S3 | CORS HTTP + WebSocket, credential leak |
| S4 | Dockerfile non-root, operator checklist |
| S5 | Client XSS/CSP, frame-ancestors, filename sanitization |

Run security tests: `npm run test:security`

## Web UI hardening

- Filenames and user strings treated as untrusted — validated via `validateFilename` before rendering; React default escaping prevents XSS
- CSP headers set via Caddy reverse proxy (`default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`)
- `X-Frame-Options: DENY` set at the reverse proxy to prevent clickjacking
- CSP meta tag in `index.html` as defense-in-depth for dev/non-proxy environments
- No open redirect patterns in the codebase
