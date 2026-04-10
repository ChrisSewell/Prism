# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.1] - 2026-04-10

### Fixed

- **ICE candidate race condition**: Candidates arriving before `setRemoteDescription` completes are now buffered and flushed once the remote description is set, instead of being silently dropped. This fixes cross-network connections getting stuck at "connecting."
- **Empty ICE server fallback**: When the signaling server returns an empty `iceServers` array (no STUN/TURN configured), the web client falls back to public Google STUN servers instead of attempting WebRTC with no ICE servers at all.
- **coturn `external-ip` conflict**: Removed explicit `external-ip` from the example `turnserver.conf` to avoid conflicting with the coturn Docker image's built-in auto-detection (`detect-external-ip`), which caused a startup error.

### Added

- **Connection debug logging**: Tagged console logging (`[useRoom]`, `[webrtc]`, `[signaling-client]`, `[signaling]`) across the full WebRTC connection lifecycle — ICE gathering, offer/answer exchange, candidate buffering, connection state transitions, and signaling relay. Helps diagnose connectivity issues in browser DevTools and server logs.

### Changed

- **STUN/TURN URLs must use a publicly routable address**: Updated `.env.example` and operator docs to clarify that `STUN_URLS` and `TURN_URLS` must be set to a public IP or hostname reachable by external clients, not a LAN IP.

## [1.0.0] - 2026-04-06

Initial release.

- Full-mesh peer-to-peer file transfer over WebRTC data channels
- Socket.IO signaling server with room management and directed relay
- React SPA with drag-and-drop file sharing UI
- coturn TURN/STUN integration with short-lived credentials
- Docker Compose deployment with Caddy TLS reverse proxy
- Security hardening: Helmet, CORS, rate limiting, non-root containers
- Versioned binary framing protocol (`@prism/protocol`)
