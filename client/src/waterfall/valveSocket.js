// ── WebSocket client tới bộ điều khiển van (ws://ip:3333) ──────────────────
// Kết nối TRỰC TIẾP từ trình duyệt tới ESP32 trong cùng mạng LAN — không qua
// server Node của whiteboard. Gửi JSON text (lệnh) + binary (frame van).
//
// Lưu ý mixed-content: nếu trang whiteboard chạy HTTPS, trình duyệt sẽ chặn
// kết nối ws:// (không mã hoá) tới thiết bị LAN. Dùng qua HTTP (mạng nội bộ)
// hoặc mở whiteboard qua http://localhost khi cần điều khiển màn nước.

export const SOCKET_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
}

export class ValveSocket {
  constructor(opts = {}) {
    this.ws = null
    this._status = SOCKET_STATUS.DISCONNECTED
    this.onStatus = opts.onStatus
    this.onMessage = opts.onMessage
    this.createWebSocket = opts.createWebSocket ?? ((url) => new WebSocket(url))
  }

  get status() {
    return this._status
  }

  _setStatus(s) {
    this._status = s
    this.onStatus?.(s)
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this._setStatus(SOCKET_STATUS.CONNECTING)
        const ws = this.createWebSocket(url)
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => {
          this._setStatus(SOCKET_STATUS.CONNECTED)
          resolve()
        }
        ws.onclose = () => this._setStatus(SOCKET_STATUS.DISCONNECTED)
        ws.onerror = () => {
          this._setStatus(SOCKET_STATUS.ERROR)
          reject(new Error(`Không kết nối được ${url}`))
        }
        ws.onmessage = (event) => this.onMessage?.(event.data)
        this.ws = ws
      } catch (err) {
        this._setStatus(SOCKET_STATUS.ERROR)
        reject(err)
      }
    })
  }

  sendText(text) {
    if (!this.ws || this._status !== SOCKET_STATUS.CONNECTED) return false
    this.ws.send(text)
    return true
  }

  sendBinary(buf) {
    if (!this.ws || this._status !== SOCKET_STATUS.CONNECTED) return false
    this.ws.send(buf)
    return true
  }

  close() {
    this.ws?.close()
    this.ws = null
    this._setStatus(SOCKET_STATUS.DISCONNECTED)
  }
}
