import { create } from 'zustand'
import { WATERFALL_CONFIG as CFG } from '../waterfall/config.js'
import { createEmptyGrid, resizeGrid, setCell as setCellPure } from '../waterfall/grid.js'
import { ValveSocket, SOCKET_STATUS } from '../waterfall/valveSocket.js'
import { buildAnimationFrames, gridToOpenValveRows } from '../waterfall/valveCodec.js'
import { cmdAllOff, cmdGetConfig } from '../waterfall/commands.js'
import { sendFramesViaBridge, sendCmdViaBridge } from '../waterfall/bridgeTransport.js'

// Socket direct-mode là I/O thật — không thuộc state React, giữ ở module
// scope (giống pattern socketInstance trong hooks/useSocket.js chính).
let directSocket = null

const LS_IP_KEY = 'wb_waterfall_ip'
const LS_PORT_KEY = 'wb_waterfall_port'
const LS_MODE_KEY = 'wb_waterfall_mode'

function loadSaved(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function saveLocal(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private mode — bỏ qua */ }
}

const savedMode = loadSaved(LS_MODE_KEY, 'bridge')

export const useWaterfallStore = create((set, get) => ({
  // Mode toggle — true khi đang ở màn hình vẽ hoạ tiết cho màn nước
  active: false,
  setActive: (active) => set({ active }),
  toggleActive: () => set((s) => ({ active: !s.active })),

  // ── Chế độ vận chuyển ────────────────────────────────────────────────────
  // 'bridge' (mặc định, khuyên dùng khi whiteboard chạy public HTTPS): gửi
  //   qua server whiteboard, relay tới bridge script chạy trên máy cắm dây
  //   tới ESP32. Xem waterfallProtocol.md mục 1 (lý do mixed-content).
  // 'direct': trình duyệt mở ws:// thẳng tới ESP32 — chỉ dùng được khi mở
  //   whiteboard qua http://localhost cùng LAN với thiết bị.
  transportMode: savedMode === 'direct' ? 'direct' : 'bridge',
  setTransportMode: (transportMode) => {
    saveLocal(LS_MODE_KEY, transportMode)
    set({ transportMode, error: null, sendError: null })
  },

  // ── Bridge relay: trạng thái do server broadcast lại ────────────────────
  bridgeOnline: false,
  setBridgeOnline: (bridgeOnline) => set({ bridgeOnline }),
  applyBridgeStatus: (status) => {
    const patch = {}
    if (status.status) patch.status = status.status
    if ('error' in status) patch.error = status.error
    if ('valveCount' in status) patch.valveCount = status.valveCount
    if ('valveBytes' in status) patch.valveBytes = status.valveBytes
    if ('tickMs' in status) patch.tickMs = status.tickMs
    set(patch)
    if (typeof status.valveCount === 'number') get().resizeCols(status.valveCount)
  },

  // ── Kết nối thiết bị (chỉ dùng ở transportMode==='direct') ──────────────
  ip: loadSaved(LS_IP_KEY, ''),
  wsPort: Number(loadSaved(LS_PORT_KEY, CFG.DEFAULT_WS_PORT)) || CFG.DEFAULT_WS_PORT,
  status: SOCKET_STATUS.DISCONNECTED,
  error: null,
  valveCount: null,
  valveBytes: null,
  tickMs: null,

  setIp: (ip) => { saveLocal(LS_IP_KEY, ip); set({ ip }) },
  setWsPort: (wsPort) => { saveLocal(LS_PORT_KEY, String(wsPort)); set({ wsPort }) },

  connect: async () => {
    const { ip, wsPort } = get()
    if (!ip.trim()) {
      set({ error: 'Nhập địa chỉ IP của bộ điều khiển van' })
      return
    }
    set({ error: null })
    directSocket?.close()

    directSocket = new ValveSocket({
      onStatus: (status) => set({ status }),
      onMessage: (data) => {
        if (typeof data !== 'string') return
        try {
          const msg = JSON.parse(data)
          if (msg.type === 'config') {
            const patch = {}
            if (typeof msg.valve_count === 'number') patch.valveCount = msg.valve_count
            if (typeof msg.valve_bytes === 'number') patch.valveBytes = msg.valve_bytes
            if (typeof msg.tick_ms === 'number') patch.tickMs = msg.tick_ms
            set(patch)
            if (typeof msg.valve_count === 'number') get().resizeCols(msg.valve_count)
          }
        } catch { /* không phải JSON — bỏ qua (forward-compatible) */ }
      },
    })

    try {
      await directSocket.connect(`ws://${ip}:${wsPort}`)
      directSocket.sendText(JSON.stringify(cmdGetConfig()))
    } catch (err) {
      set({ error: String(err.message || err) })
    }
  },

  disconnect: () => {
    directSocket?.close()
    directSocket = null
    set({ status: SOCKET_STATUS.DISCONNECTED, valveCount: null, valveBytes: null, tickMs: null })
  },

  // ── Hoạ tiết (grid vẽ tay) ───────────────────────────────────────────────
  cols: CFG.DEFAULT_VALVE_COUNT,
  rowCount: CFG.DEFAULT_ROW_COUNT,
  rowIntervalMs: CFG.DEFAULT_ROW_INTERVAL_MS,
  grid: createEmptyGrid(CFG.DEFAULT_ROW_COUNT, CFG.DEFAULT_VALVE_COUNT),

  // Gọi khi thiết bị báo valve_count thật — resize grid, giữ hoạ tiết đã vẽ
  // trong phần giao nhau (không hardcode 80, luôn suy từ thiết bị/config).
  resizeCols: (cols) => {
    const clamped = Math.max(1, Math.min(CFG.MAX_VALVES, Math.round(cols)))
    set((s) => ({ cols: clamped, grid: resizeGrid(s.grid, s.rowCount, clamped) }))
  },

  setRowCount: (rowCount) => {
    const clamped = Math.max(CFG.MIN_ROW_COUNT, Math.min(CFG.MAX_ROW_COUNT, Math.round(rowCount)))
    set((s) => ({ rowCount: clamped, grid: resizeGrid(s.grid, clamped, s.cols) }))
  },

  setRowIntervalMs: (ms) => {
    const clamped = Math.max(CFG.MIN_ROW_INTERVAL_MS, Math.min(CFG.MAX_ROW_INTERVAL_MS, Math.round(ms)))
    set({ rowIntervalMs: clamped })
  },

  setCell: (row, col, value) => set((s) => ({ grid: setCellPure(s.grid, row, col, value) })),

  clearGrid: () => set((s) => ({ grid: createEmptyGrid(s.rowCount, s.cols) })),

  // ── Gửi sang màn nước ────────────────────────────────────────────────────
  sending: false,
  lastSentAt: null,
  sendError: null,

  allOff: async () => {
    const { transportMode, status, bridgeOnline } = get()
    set({ sendError: null })
    try {
      if (transportMode === 'bridge') {
        if (!bridgeOnline) throw new Error('Chưa có bridge nào kết nối tới màn nước')
        await sendCmdViaBridge(cmdAllOff())
      } else {
        if (status !== SOCKET_STATUS.CONNECTED || !directSocket?.sendText(JSON.stringify(cmdAllOff()))) {
          throw new Error('Chưa kết nối thiết bị')
        }
      }
    } catch (err) {
      set({ sendError: String(err.message || err) })
    }
  },

  sendPattern: async () => {
    const { grid, rowIntervalMs, valveCount, cols, transportMode, status, bridgeOnline } = get()

    const ready = transportMode === 'bridge'
      ? bridgeOnline
      : status === SOCKET_STATUS.CONNECTED && !!directSocket

    if (!ready) {
      set({ sendError: 'Chưa kết nối thiết bị' })
      return
    }

    // Ưu tiên valve_count thật do thiết bị báo về; nếu chưa có (chưa nhận
    // được GET_CONFIG reply) thì dùng đúng số cột đang vẽ trên grid.
    const effectiveValveCount = valveCount ?? cols
    set({ sending: true, sendError: null })
    try {
      const rows = gridToOpenValveRows(grid)
      const frames = buildAnimationFrames(rows, rowIntervalMs, effectiveValveCount)

      if (transportMode === 'bridge') {
        // 1 lần gửi cả mảng frame — server chỉ relay nguyên văn, KHÔNG gộp
        // thành 1 buffer (đó là việc của bridge khi ws.send() từng frame
        // xuống ESP32, giữ đúng giới hạn RX buffer của firmware).
        await sendFramesViaBridge(frames)
      } else {
        // Gửi từng frame một qua WS binary trực tiếp — xem waterfallProtocol.md
        // mục 5 (giới hạn RX buffer cố định của firmware).
        for (const frame of frames) {
          if (!directSocket.sendBinary(frame)) throw new Error('Mất kết nối khi đang gửi')
        }
      }
      set({ lastSentAt: Date.now() })
    } catch (err) {
      set({ sendError: String(err.message || err) })
    } finally {
      set({ sending: false })
    }
  },
}))
