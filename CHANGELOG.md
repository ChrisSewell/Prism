# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.0] - 2026-04-10

### Added

- **Automatic ICE restart on failure**: When `iceConnectionState` transitions to `"failed"`, the offerer automatically attempts one ICE restart (`createOffer({ iceRestart: true })`) to re-gather candidates and retry connectivity checks without tearing down the PeerConnection. If the restart also fails, falls back to the existing manual retry path.
- **Periodic P2P upgrade for relayed peers**: A background loop (every 30 seconds) re-detects relay type for all connected peers and, for any that are still relayed with no active file transfer, triggers an ICE restart to attempt a P2P upgrade. Also corrects "unknown" relay status from early detection races.
- **Debug panel** (`VITE_DEBUG_ENABLED`): Collapsible ICE diagnostics panel at the bottom of the room page showing per-peer connection states, all gathered candidates, candidate pair table with RTT/bytes, and selected pair details. Includes manual/auto refresh and a copy-to-clipboard button for sharing debug dumps. Gated behind a build-time env flag.
- **ICE diagnostics logging**: On connection failure, all gathered ICE candidates and candidate-pair states are dumped to the console for debugging. On success, the selected candidate pair's full details (type, protocol, address, port) are logged alongside the relay/P2P detection.
- **ICE candidate error visibility**: `icecandidateerror` events are now logged with the failing URL, error code, and error text, surfacing STUN/TURN reachability issues in the browser console.

### Changed

- **Optimized RTCPeerConnection config**: Added `iceCandidatePoolSize: 2` to pre-allocate gathering resources (srflx candidates are ready faster) and `bundlePolicy: "max-bundle"` to reduce the number of NAT bindings needed.
- **Diversified default STUN servers**: Fallback ICE config now includes Google and Cloudflare STUN endpoints (consolidated into a single `urls` array) so clients behind symmetric NATs gather more reflexive candidates from different vantage points.
- **`retryPeer` re-fetches ICE servers**: Manual peer retry now calls `/api/ice` for fresh TURN credentials and server config before creating a new PeerConnection, instead of reusing stale config from room-join time.
- **Delayed relay detection**: Connection type (P2P vs relayed) is now checked 3 seconds after connecting, with a second check at 8 seconds, giving ICE time to settle on the optimal candidate pair instead of snapshotting a transient relay state.

## [1.2.0] - 2026-04-10

### Added

- **Relay vs direct (P2P) connection indicator**: Each peer's status badge now shows whether the connection is direct P2P or relayed through a TURN server, detected via `getStats()` ICE candidate-pair inspection. Relayed connections trigger a warning toast and an info tooltip explaining potential speed impact.

### Changed

- **Transfer throughput optimization**: Chunk size increased from 64 KiB to 256 KiB, send buffer from 1 MiB to 16 MiB, and yield interval from 8 to 64 chunks to reduce per-message overhead and saturate the SCTP send queue. Receiver-side React state updates are now throttled to 150 ms intervals instead of every chunk, eliminating ~49K unnecessary re-renders on large transfers.

### Fixed

- **`getRandomValues` 65 KiB limit**: Protocol test helper switched from `getRandomValues` to `randomFillSync` to support the new 256 KiB chunk payloads that exceed the Web Crypto API hard cap.

## [1.1.0] - 2026-04-10

### Added

- **Optional PIN access control for rooms**: Room creators can set a 4–8 digit PIN that joiners must enter before being admitted. PINs are SHA-256 hashed server-side, validated on both client and server, and surfaced via a modal dialog on join.
- **Optional display names**: Peers can set a username before creating/joining a room, or edit it in-room. Names are relayed via the signaling server and displayed in the peer list and room header. Anonymous peers fall back to a truncated peer ID.
- **Browser-local persistence**: Display names are saved in `localStorage` and auto-filled on return visits. Names are never stored on the server.
- **`peer:update-name` signaling event**: New event allows peers to change their display name after joining. Changes are broadcast to all room members in real time.
- **Self entry in peer list**: The local user now appears in the peer list with a "(you)" badge and inline name editing.
- **Nginx reverse proxy for signaling**: The web container's nginx config now proxies `/socket.io/`, `/api/`, and `/health` to the signaling container, enabling single-port deployments without Caddy.

### Changed

- **Roster payload**: `peers` in the roster response is now `Array<{ peerId, username? }>` instead of `string[]`.
- **`peer:joined` payload**: Now includes `username?` alongside `peerId`.
- **`RoomCreatePayload` / `RoomJoinPayload`**: Accept optional `username` and `pin` fields.

## [1.0.1] - 2026-04-10

### Fixed

- **ICE candidate race condition**: Candidates arriving before `setRemoteDescription` completes are now buffered and flushed once the remote description is set, instead of being silently dropped. This fixes cross-network connections getting stuck at "connecting."
- **Empty ICE server fallback**: When the signaling server returns an empty `iceServers` array (no STUN/TURN configured), the web client falls back to public Google STUN servers instead of attempting WebRTC with no ICE servers at all.
- **coturn `external-ip` conflict**: Removed explicit `external-ip` from the example `turnserver.conf` to avoid conflicting with the coturn Docker image's built-in auto-detection (`detect-external-ip`), which caused a startup error.

### Added

- **Connection debug logging**: Tagged console logging (`[useRoom]`, `[webrtc]`, `[signaling-client]`, `[signaling]`) across the full WebRTC connection lifecycle — ICE gathering, offer/answer exchange, candidate buffering, connection state transitions, and signaling relay. Helps diagnose connectivity issues in browser DevTools and server logs.
- **Prism-branded favicon**: Replaced the default favicon with a custom Prism SVG icon.

### Changed

- **STUN/TURN URLs must use a publicly routable address**: Updated `.env.example` and operator docs to clarify that `STUN_URLS` and `TURN_URLS` must be set to a public IP or hostname reachable by external clients, not a LAN IP.
- **Theme applied before mount**: Stored dark/light theme preference is now applied synchronously before React mounts, preventing a flash of unstyled content on error and loading routes.

## [1.0.0] - 2026-04-06

Initial release.

- Full-mesh peer-to-peer file transfer over WebRTC data channels
- Socket.IO signaling server with room management and directed relay
- React SPA with drag-and-drop file sharing UI
- coturn TURN/STUN integration with short-lived credentials
- Docker Compose deployment with Caddy TLS reverse proxy
- Security hardening: Helmet, CORS, rate limiting, non-root containers
- Versioned binary framing protocol (`@prism/protocol`)

