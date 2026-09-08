# Waterfall mode — giao thức gửi hoạ tiết sang màn nước

> Nguồn sự thật: `CAU_TRUC_DU_LIEU.md` của project `waterfall-sprite`
> (`D:\VXI-Chinh\waterfall-sprite`) và firmware `waterfall-secc`
> (`C:\Users\SGM\Documents\PlatformIO\Projects\waterfall-secc`, subset
> **valve-only**, không có LED). File này là bản trích/rút gọn phần whiteboard
> app cần dùng. Đổi giao thức → sửa 2 file gốc trên trước, rồi cập nhật file
> này, rồi mới sửa code trong `client/src/waterfall/`.

## 1. Kiến trúc kết nối

Whiteboard chạy public trên internet (Railway, HTTPS) để nhiều người cùng vẽ.
ESP32 lại nằm trên mạng LAN cô lập, KHÔNG có internet (xem ảnh Network
Connections — "Ethernet 2: Unidentified network", không gateway). Hai thực tế
này loại bỏ cách nối "trực tiếp" ban đầu trong đa số trường hợp thật:

1. Trình duyệt chạy trang `https://...railway.app` bị **chặn mixed-content**
   nếu cố mở `ws://<ip-lan>:3333` (WebSocket không mã hoá) — lỗi trình duyệt,
   không phải bug code.
2. Ngay cả khi bỏ qua (1) bằng cách mở whiteboard qua `http://`, trình duyệt
   của người vẽ **chưa chắc nằm cùng LAN** với ESP32 — ai cũng vẽ được từ xa,
   nhưng chỉ máy đang cắm dây tới ESP32 mới với tới được nó.

**Giải pháp: 2 chế độ kết nối**, chọn ở panel (`mode` trong `waterfallStore.js`):

### Chế độ A — Bridge relay (mặc định, dùng khi whiteboard public)

```
Browser (bất kỳ đâu, https://)
        │  Socket.IO — DÙNG LẠI kết nối whiteboard sẵn có (wss://, cùng JWT)
        │  event: waterfall:frames / waterfall:cmd
        ▼
Server Node (server/src/socket/waterfallHandlers.js) — CHỈ RELAY, không hiểu
        │  giao thức van, không build frame
        │  event: waterfall:frames / waterfall:cmd (broadcast tới room bridge)
        ▼
Bridge (script Node, thư mục bridge/ — chạy trên MÁY CÓ CẮM DÂY tới ESP32,
        │  chính là máy có "Ethernet 2" trong ảnh Network Connections)
        │  ws://<ip-esp32>:3333  (LAN nội bộ, không cần internet ở chặng này)
        ▼
ESP32 (firmware waterfall-secc) → driver van (shift register 74HC595)
```

- Server không đụng vào bit nào của giao thức van — nó chỉ forward nguyên
  văn `frames`/`cmd` từ browser tới đúng bridge đang đăng ký (room Socket.IO
  riêng `waterfall-bridge`), và forward `waterfall:status` ngược lại. Codec
  (`valveCodec.js`) vẫn chỉ tồn tại ở phía browser — single source of truth,
  không lặp lại logic build frame ở server/bridge.
- Xác thực bridge bằng 1 secret dùng chung (`WATERFALL_BRIDGE_SECRET`, biến
  môi trường server) — tránh user thường giả làm bridge để chiếm quyền gửi
  lệnh xuống thiết bị thật. Xem mục 8.
- Bridge tự lấy JWT qua `/api/auth/guest` (như mọi client khác) rồi mở kết
  nối Socket.IO bình thường tới server whiteboard — không cần đổi gì ở
  `io.use()` (middleware xác thực JWT hiện có).

### Chế độ B — Kết nối trực tiếp (chỉ dùng khi dev/test cục bộ)

```
Whiteboard (browser, mở qua http://localhost, CÙNG máy/LAN với ESP32)
        │  ws://<ip-thiết-bị>:3333   (JSON text + binary, TRỰC TIẾP,
        │                             không qua server Node)
        ▼
ESP32 (firmware waterfall-secc)
```

Giữ lại cho tiện dev (không cần chạy bridge script), nhưng KHÔNG dùng được
khi whiteboard chạy `https://` công khai — xem lý do (1) ở trên.

- Cổng WebSocket điều khiển van: **3333**. Cổng HTTP (`/version`, không dùng
  trong mode này nhưng cùng thiết bị): **8080**.
- Firmware SECC là bản **valve-only** — không có nhánh LED (`"WL"` magic),
  nên whiteboard mode này **không gửi LED**, chỉ gửi van.

## 2. Đánh số van & bit packing (MSB-first)

```
Van 0-indexed:  0   1   2   3   4   5   6   7 | 8   9  10  11 ...
                ←────────── byte[0] ──────────► ←──── byte[1] ─────►
Bit:            7   6   5   4   3   2   1   0   7   6   5   4 ...
```

```
byte_index = valve >> 3
bit_mask   = 1 << (7 - (valve & 7))
buf[byte_index] |= bit_mask
```

`B = ceil(valve_count / 8)` — luôn tính động từ `valve_count`, không hardcode
(xem `valveBytesFor()` trong `valveCodec.js`).

## 3. Timestamp đặc biệt (reserved, little-endian)

| ts_ms | Hex LE | Tên | Kích thước frame | Ý nghĩa |
|---|---|---|---|---|
| `0xFFFFFFFD` | `FD FF FF FF` | TS_CONFIG | **6 byte cố định** | Khai báo `valve_count` (u16 LE ở byte 4-5). Luôn đứng ĐẦU TIÊN. |
| `0xFFFFFFFF` | `FF FF FF FF` | TS_RESET | 4 + B | Xoá queue, tắt hết van. |
| `0xFFFFFFFE` | `FE FF FF FF` | TS_START | 4 + B | `t0 = now`, scheduler bắt đầu chạy. |
| `0x00000000`–`0xFFFFFFFC` | — | DATA | 4 + B | Frame dữ liệu, `ts` tăng dần. |

CONFIG có kích thước KHÁC (6 byte, không phải 4+B) — vì parser cần đọc
`valve_count` từ CONFIG trước để biết B, mới suy ra được kích thước của mọi
frame theo sau. Đây là lý do CONFIG bắt buộc đứng đầu stream.

## 4. Thứ tự stream bắt buộc (grid/animation mode)

```
CONFIG  (6B)         — packConfigFrame(valveCount)
RESET   (4+B)        — packFrame(TS_RESET, zero bits)
START   (4+B)        — packFrame(TS_START, zero bits)
DATA    (4+B) × N     — packFrame(row × rowIntervalMs, bits của hàng row)
SENTINEL (4+B)       — packFrame(N × rowIntervalMs, zero bits) — tắt hết van, báo kết thúc
```

Mỗi hàng (row) trong grid vẽ tay = một lớp thời gian; hàng trên cùng phát
trước (`row=0`), hàng dưới cùng phát sau — mô phỏng hình ảnh trôi xuống theo
dòng nước rơi. `rowIntervalMs` = khoảng cách thời gian giữa 2 hàng.

Frame toàn-0 (không van nào mở) bị bỏ qua khi build — vì firmware có thể đọc
nhầm thành SENTINEL và dừng sớm; trạng thái mặc định sau RESET vốn đã là tắt,
nên bỏ frame này vô hại (`buildAnimationFrames()` trong `valveCodec.js`).

## 5. Giới hạn gửi (bắt buộc tuân theo)

- **Gửi từng frame một** qua `ws.send()` riêng lẻ — KHÔNG gộp toàn bộ stream
  thành 1 buffer rồi gửi 1 lần. Firmware dùng buffer nhận cố định
  `(4 + MAX_BOARDS) × 64` byte (`tcp_server.h`); 1 message WS quá lớn có thể
  làm buffer tràn và bị xoá sạch (mất cả stream).
- `valve_count` tối đa: **512** (`MAX_BOARDS=64` × 8, `config.h`). Client
  reject/clamp giá trị vượt ngưỡng này trước khi gửi.
- Không cần chờ giữa các `ws.send()` — các frame chỉ mang timestamp tương đối
  cho scheduler firmware xử lý, không phải gửi theo nhịp thời gian thực.

## 6. Lệnh JSON hỗ trợ (đã cài trong `commands.js`)

```json
{"cmd":"ALL_OFF"}
{"cmd":"ALL_ON"}
{"cmd":"STREAM_STOP"}
{"cmd":"SET","bits":"<hex, B×2 ký tự>"}
{"cmd":"GET_CONFIG"}
{"cmd":"SET_TICK","ms":10}
```

`GET_CONFIG` trả về:
```json
{"type":"config","valve_count":80,"valve_bytes":10,"tick_ms":10}
```
Whiteboard gọi lệnh này ngay sau khi kết nối để resize grid vẽ theo đúng
`valve_count` thật của thiết bị (xem `resizeCols()` trong `waterfallStore.js`);
trước khi kết nối, grid dùng `WATERFALL_CONFIG.DEFAULT_VALVE_COUNT` (xem
`config.js`) làm giá trị tạm.

## 8. Giao thức bridge relay (Socket.IO, server ↔ browser ↔ bridge)

Nguồn sự thật cho phần này: `server/src/socket/waterfallHandlers.js` (server)
và `bridge/index.js` (bridge). Đây là tầng vận chuyển MỚI (thêm khi whiteboard
lên public); giao thức van ở mục 1-6 giữ nguyên, chỉ đổi đường đi.

| Event | Chiều | Payload | Ghi chú |
|---|---|---|---|
| `waterfall:bridge:register` | Bridge → Server | `{ secret, label? }` + ack | `secret` phải khớp `WATERFALL_BRIDGE_SECRET`. Ack `{ok:true}` hoặc `{ok:false,error}`. |
| `waterfall:status` | Bridge → Server → mọi browser | `{ status, valveCount, valveBytes, tickMs, error }` | Server broadcast nguyên văn, không diễn giải. |
| `waterfall:bridge-online` | Server → mọi browser | `{ online: boolean }` | Server tự phát khi bridge connect/disconnect. |
| `waterfall:frames` | Browser → Server → bridge đang đăng ký | mảng `Uint8Array`/`Buffer` (mỗi phần tử là 1 frame đã đóng gói bởi `valveCodec.js`) + ack | Server KHÔNG parse nội dung, chỉ relay + kiểm tra có bridge nào online không. |
| `waterfall:cmd` | Browser → Server → bridge đang đăng ký | object lệnh JSON, vd `{cmd:'ALL_OFF'}` (xem `commands.js`) + ack | Bridge tự `JSON.stringify()` trước khi gửi xuống ESP32 qua `ws.send()` text. |

**Bảo mật (mức tối thiểu cho bản này):** 1 secret dùng chung qua biến môi
trường `WATERFALL_BRIDGE_SECRET` ở server, và bridge đọc cùng giá trị đó từ
`bridge/.env`. Không có secret cấu hình → server từ chối mọi
`waterfall:bridge:register` (an toàn theo hướng "fail closed", không phải
"fail open"). Đây không phải xác thực mạnh (không xoay vòng token, không mã
hoá riêng) — đủ dùng cho 1 thiết bị vật lý, 1 bridge, nội bộ; KHÔNG dùng lại
secret này cho việc khác.

## 9. Việc KHÔNG làm trong bản này (ngoài phạm vi)

- Không phát lại từ SD card (`PLAY_SD`/`STOP_SD`) — chỉ live-stream 1 hoạ
  tiết tĩnh do người dùng vừa vẽ.
- Không hỗ trợ LED (firmware SECC không có).
- Không đồng bộ nhiều thiết bị/màn cùng lúc (bản `waterfall-sprite` đầy đủ có
  multi-slot; whiteboard chỉ nhắm 1 thiết bị cho nhanh gọn) — bridge relay ở
  đây cũng chỉ giả định 1 bridge/1 ESP32; nếu nhiều bridge cùng đăng ký,
  server gửi tới TẤT CẢ (không có logic chọn "màn nào").
- Không lưu lịch sử hoạ tiết đã gửi vào DB — đây là tính năng "vẽ nhanh, gửi
  ngay", không phải công cụ dựng show.
- Không tự động khởi động lại bridge nếu crash (chạy tay hoặc dùng
  `pm2`/Task Scheduler của Windows nếu cần chạy nền lâu dài — ngoài phạm vi
  code trong repo này).
