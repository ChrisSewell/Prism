# Signaling API Contract (v1)

## Protocol version

- **Signaling protocol version**: `1` (from `@prism/protocol` `SIGNALING_VERSION`)
- **Framing protocol version**: `1` (from `@prism/protocol` `PROTOCOL_VERSION`)
- These may differ in future releases; both are documented here

## Socket.IO connection

Connect with WebSocket transport and `protocolVersion` in auth:

```javascript
const socket = io("https://yourdomain.com", {
  transports: ["websocket"],
  auth: { protocolVersion: 1 },
});
```

Unknown major versions are rejected with a connection error.

## Events (client → server)

### `room:create`

Create a new room. Callback receives `{ roomCode, peerId }` or `{ error: { code, message } }`.

### `room:join`

Join an existing room. Payload: `{ roomCode: string }`. Callback receives `{ roomCode, peers: string[], selfPeerId }` or `{ error: { code, message } }`.

### `signal:offer` / `signal:answer` / `signal:candidate`

Directed signaling relay. Payload:
```json
{
  "toPeerId": "<target peer UUID>",
  "data": { "sdp": "..." }
}
```

Server sets `fromPeerId` from the sender's session — client-supplied `fromPeerId` is ignored.

## Events (server → client)

### `room:created`

Emitted if no callback provided. Payload: `{ roomCode, peerId }`.

### `room:roster`

Full peer list on join. Payload: `{ roomCode, peers: string[], selfPeerId }`.

### `peer:joined`

New peer entered the room. Payload: `{ peerId }`.

### `peer:left`

Peer disconnected. Payload: `{ peerId }`. Client should close RTCPeerConnection to that peer and abort in-flight transfers.

### `signal:offer` / `signal:answer` / `signal:candidate`

Relayed signaling message. Payload:
```json
{
  "fromPeerId": "<sender UUID>",
  "toPeerId": "<your UUID>",
  "data": { "sdp": "..." }
}
```

### `error`

Error event. Payload: `{ code: string, message: string }`.

## Error codes

| Code | Meaning |
|------|---------|
| `ROOM_NOT_FOUND` | Room code does not exist |
| `ROOM_FULL` | Room has reached `MAX_PEERS_PER_ROOM` |
| `GLOBAL_PEER_LIMIT` | Server-wide peer cap reached |
| `INVALID_PAYLOAD` | Missing or invalid fields |
| `NOT_IN_ROOM` | Sender is not a member of any room |
| `PEER_NOT_FOUND` | Target peer not in the same room |
| `RATE_LIMITED` | Too many requests |

## HTTP endpoints

### `GET /health`

Returns `{ "status": "ok" }` with status 200.

### `GET /api/ice`

Returns ICE server configuration:
```json
{
  "iceServers": [
    { "urls": ["stun:stun.example.com:3478"] },
    {
      "urls": ["turn:turn.example.com:3478"],
      "username": "user",
      "credential": "pass"
    }
  ]
}
```

If no `STUN_URLS` or `TURN_URLS` are configured, the response will contain an empty `iceServers` array. The web client detects this and falls back to public Google STUN servers (`stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`) so that peer connections can still establish server-reflexive candidates. For production deployments, always configure STUN/TURN with a publicly routable address — see [operators.md](operators.md).

### `GET /metrics` (optional)

Prometheus text format. Requires `METRICS_ENABLED=true`. Protected by `METRICS_BEARER_TOKEN` if set.

## WebRTC data channel defaults

| Setting | Value |
|---------|-------|
| `ordered` | `true` (file integrity) |
| `binaryType` | `arraybuffer` |
| Label | `file-transfer` (or negotiated ID) |

## Glare / polite-impolite rule

For each peer pair `(A, B)`, the peer with the **lexicographically smaller `peerId`** is the **impolite** peer (creates the offer first). The other is **polite** and yields on glare.

## SCTP chunk sizing

WebRTC data channels use SCTP with a ~256 KiB max message size (browser-dependent). Application chunk size should be safely below that (16–64 KiB default in `@prism/protocol`).

## Browser support matrix

| Browser | Minimum version | Notes |
|---------|----------------|-------|
| Chrome/Chromium | 80+ | Full support |
| Firefox | 75+ | Full support |
| Safari | 15+ | Test data channel reliability |
| Edge | 80+ | Chromium-based |
