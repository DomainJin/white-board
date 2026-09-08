// ── Cấu hình mặc định cho mode "Màn nước" ──────────────────────────────────
// Nguồn sự thật giao thức: xem waterfallProtocol.md ở thư mục này.
// Mọi hằng số ở đây có thể đổi theo thiết bị thật — không hardcode rải rác
// trong component/codec, luôn đọc từ đây.

export const WATERFALL_CONFIG = {
  // Cổng mặc định của firmware ESP32 (waterfall-secc): WS điều khiển van +
  // HTTP cho /version. Có thể sửa trong panel nếu thiết bị dùng cổng khác.
  DEFAULT_WS_PORT: 3333,
  DEFAULT_HTTP_PORT: 8080,

  // Số van (cột) dùng để vẽ khi CHƯA kết nối thiết bị. Sau khi kết nối,
  // grid tự resize theo valve_count thật do thiết bị báo về (GET_CONFIG).
  DEFAULT_VALVE_COUNT: 80,

  // Số hàng (lớp thời gian rơi) mặc định của hoạ tiết.
  DEFAULT_ROW_COUNT: 24,
  MIN_ROW_COUNT: 2,
  MAX_ROW_COUNT: 64,

  // Khoảng cách thời gian giữa các hàng khi phát (ms). Hàng dưới cùng phát
  // sau cùng — mô phỏng nước rơi từ trên xuống. EFFECT_TICK_MS tối thiểu của
  // firmware là 10ms (config.h), nên không cho chọn nhỏ hơn.
  DEFAULT_ROW_INTERVAL_MS: 80,
  MIN_ROW_INTERVAL_MS: 10,
  MAX_ROW_INTERVAL_MS: 300,

  // Giới hạn cứng phần cứng (config.h: MAX_BOARDS=64 → MAX_VALVES=512).
  MAX_VALVES: 512,
}
