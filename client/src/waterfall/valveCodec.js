// ── Valve binary codec — PURE, không import UI/socket ──────────────────────
// Byte-exact với giao thức firmware waterfall-secc (xem waterfallProtocol.md
// cùng thư mục). Đổi định dạng → sửa spec trước, sửa code sau.
//
// Frame stream bắt buộc: CONFIG(6B) → RESET(4+B) → START(4+B) → DATA(4+B)... → SENTINEL(4+B, bits=0)
// B = ceil(valveCount / 8), tính động từ CONFIG — không hardcode.

/** Reserved timestamp: khai báo valve_count. Payload = valve_count (u16 LE). Bytes: FD FF FF FF. */
export const TS_CONFIG = 0xfffffffd
/** Reserved timestamp: xoá queue, tắt hết van. Bytes: FF FF FF FF. */
export const TS_RESET = 0xffffffff
/** Reserved timestamp: bắt đầu chạy scheduler (t0 = now). Bytes: FE FF FF FF. */
export const TS_START = 0xfffffffe

export const FRAME_HEADER_BYTES = 4
export const CONFIG_FRAME_BYTES = 6

/** Số byte cần để chứa `valveCount` van, MSB-first, không hardcode. */
export function valveBytesFor(valveCount) {
  return Math.ceil(valveCount / 8)
}

/**
 * Pack CONFIG frame: 6 byte = [FD FF FF FF][valve_count u16 LE]. Không padding.
 * Frame này PHẢI đứng đầu tiên (offset 0) — firmware đọc nó trước để suy ra
 * B = ceil(valve_count/8) cho mọi frame theo sau (RESET/START/DATA).
 */
export function packConfigFrame(valveCount) {
  const frame = new Uint8Array(CONFIG_FRAME_BYTES)
  const view = new DataView(frame.buffer)
  view.setUint32(0, TS_CONFIG >>> 0, true)
  view.setUint16(4, valveCount & 0xffff, true)
  return frame
}

/**
 * Pack một frame: u32 LE `tsMs` theo sau là `bits`. Độ dài = 4 + bits.length.
 * Little-Endian theo đúng CAU_TRUC_DU_LIEU.md.
 */
export function packFrame(tsMs, bits) {
  const frame = new Uint8Array(FRAME_HEADER_BYTES + bits.length)
  new DataView(frame.buffer).setUint32(0, tsMs >>> 0, true)
  frame.set(bits, FRAME_HEADER_BYTES)
  return frame
}

/**
 * Pack danh sách van (0-indexed) đang mở thành B byte, MSB-first:
 *   buf[v >> 3] |= 1 << (7 - (v & 7))
 * Van ngoài phạm vi [0, B*8) bị bỏ qua — bit dư luôn là 0.
 */
export function valveBits(valves, B) {
  const buf = new Uint8Array(B)
  const maxValve = B * 8
  for (const v of valves) {
    if (v < 0 || v >= maxValve) continue
    buf[v >> 3] |= 1 << (7 - (v & 7))
  }
  return buf
}

function concat(frames) {
  const total = frames.reduce((n, f) => n + f.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const f of frames) {
    out.set(f, off)
    off += f.length
  }
  return out
}

/**
 * Grid mode: mỗi hàng (row) dùng chung 1 timestamp = row × rowIntervalMs.
 * Trả về DANH SÁCH frame riêng lẻ (không nối thành 1 buffer) để bên gửi có
 * thể emit từng frame một qua WebSocket — tránh vượt RX buffer cố định của
 * firmware (xem waterfallProtocol.md mục "Giới hạn gửi").
 *
 * @param rows        rows[i] = mảng chỉ số van (0-indexed) đang mở ở hàng i
 * @param rowIntervalMs khoảng cách thời gian giữa các hàng (ms)
 * @param valveCount  số van khai báo trong CONFIG frame
 * @returns {Uint8Array[]} danh sách frame theo đúng thứ tự cần gửi
 */
export function buildAnimationFrames(rows, rowIntervalMs, valveCount) {
  const B = valveBytesFor(valveCount)
  const frames = [
    packConfigFrame(valveCount),
    packFrame(TS_RESET, new Uint8Array(B)),
    packFrame(TS_START, new Uint8Array(B)),
  ]
  rows.forEach((openValves, i) => {
    const bits = valveBits(openValves, B)
    // Bỏ qua frame toàn 0 — firmware đọc bits=0 như SENTINEL và có thể dừng
    // sớm. Trạng thái mặc định sau RESET đã là tắt hết nên bỏ qua vô hại.
    if (bits.some((b) => b !== 0)) {
      frames.push(packFrame(i * rowIntervalMs, bits))
    }
  })
  // Sentinel: tắt hết van, 1 rowIntervalMs sau hàng cuối.
  frames.push(packFrame(rows.length * rowIntervalMs, new Uint8Array(B)))
  return frames
}

/** Nối danh sách frame thành 1 buffer liền — dùng khi cần tổng kích thước (vd log/test). */
export function concatFrames(frames) {
  return concat(frames)
}

/**
 * Chuyển grid vẽ tay (mảng hàng, mỗi hàng là Uint8Array 0/1 dài `cols`)
 * thành `rows[][]` (danh sách chỉ số van mở) mà buildAnimationFrames() cần.
 */
export function gridToOpenValveRows(grid) {
  return grid.map((row) => {
    const open = []
    for (let c = 0; c < row.length; c++) {
      if (row[c]) open.push(c)
    }
    return open
  })
}
