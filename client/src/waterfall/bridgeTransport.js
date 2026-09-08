// ── Bridge transport — gửi hoạ tiết qua server thay vì WebSocket trực tiếp ──
// Dùng LẠI kết nối Socket.IO sẵn có của whiteboard (getSocket() từ
// hooks/useSocket.js) — không mở thêm kết nối riêng. Không import Zustand ở
// đây (giữ pure I/O boundary); waterfallStore.js gọi các hàm này và tự lưu
// state, useSocket.js gọi attachWaterfallBridgeListeners() để nối event vào
// store qua callback — tránh import vòng giữa 2 file store/hook.
//
// Vì sao cần bridge: xem waterfallProtocol.md mục 1 (mixed-content HTTPS
// chặn ws:// trực tiếp khi whiteboard chạy public).

import { getSocket } from '../hooks/useSocket.js'

const ACK_TIMEOUT_MS = 8000

export function isBridgeSocketReady() {
  return !!getSocket()?.connected
}

/** Gửi mảng frame nhị phân (đã build bởi valveCodec.js) qua server tới bridge. */
export async function sendFramesViaBridge(frames) {
  const socket = getSocket()
  if (!socket?.connected) throw new Error('Chưa kết nối server whiteboard')
  const ack = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('waterfall:frames', frames)
  if (!ack?.ok) throw new Error(ack?.error || 'Server từ chối gửi hoạ tiết')
}

/** Gửi 1 lệnh JSON (object, vd {cmd:'ALL_OFF'}) qua server tới bridge. */
export async function sendCmdViaBridge(cmd) {
  const socket = getSocket()
  if (!socket?.connected) throw new Error('Chưa kết nối server whiteboard')
  const ack = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('waterfall:cmd', cmd)
  if (!ack?.ok) throw new Error(ack?.error || 'Server từ chối lệnh')
}

/**
 * Gắn listener cho 2 event server broadcast liên quan tới bridge. Gọi 1 lần
 * khi socket kết nối (trong useSocket.js) — dùng callback thay vì import
 * store trực tiếp để module này không phụ thuộc Zustand.
 */
export function attachWaterfallBridgeListeners(socket, { onStatus, onBridgeOnline } = {}) {
  socket.on('waterfall:status', (status) => onStatus?.(status))
  socket.on('waterfall:bridge-online', ({ online }) => onBridgeOnline?.(online))
}
