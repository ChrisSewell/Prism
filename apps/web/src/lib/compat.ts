export function checkWebRTCSupport(): boolean {
  return (
    typeof RTCPeerConnection !== "undefined" &&
    typeof RTCDataChannel !== "undefined"
  );
}
