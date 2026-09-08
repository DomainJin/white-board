// ── Lệnh điều khiển van cho firmware waterfall-secc ─────────────────────────
// PURE builders trả về OBJECT (không phải chuỗi JSON) — đây là nguồn sự thật
// duy nhất cho hình dạng lệnh, dùng chung cho cả 2 đường vận chuyển:
//   - Direct mode (valveSocket.js): JSON.stringify(cmd) trước khi gửi WS text.
//   - Bridge mode (bridgeTransport.js): gửi thẳng object qua Socket.IO, bridge
//     tự JSON.stringify() trước khi forward xuống ESP32.
// Khớp waterfallProtocol.md mục 6.

/** Hex chữ hoa của buffer byte (vd [0xff,0x00] -> "FF00"). */
export function bytesToHex(bytes) {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0').toUpperCase()
  return s
}

export function cmdAllOff() {
  return { cmd: 'ALL_OFF' }
}

export function cmdAllOn() {
  return { cmd: 'ALL_ON' }
}

export function cmdStreamStop() {
  return { cmd: 'STREAM_STOP' }
}

/** Đặt ngay 1 frame van (không qua stream). `bits` dài valveBytes byte. */
export function cmdSet(bits) {
  return { cmd: 'SET', bits: bytesToHex(bits) }
}

export function cmdGetConfig() {
  return { cmd: 'GET_CONFIG' }
}

export function cmdSetTick(ms) {
  return { cmd: 'SET_TICK', ms: Math.max(1, Math.round(ms)) }
}
