// ── Grid hoạ tiết (van) — PURE, không import UI/store ──────────────────────
// Mỗi hàng là 1 Uint8Array dài `cols` (0 = tắt, 1 = mở). Hàng 0 = trên cùng,
// phát trước; hàng cuối = dưới cùng, phát sau — mô phỏng nước rơi.

export function createEmptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => new Uint8Array(cols))
}

/** Đổi kích thước grid, giữ lại phần giao nhau (crop/pad bằng 0), không mutate grid cũ. */
export function resizeGrid(grid, rows, cols) {
  const out = createEmptyGrid(rows, cols)
  const copyRows = Math.min(rows, grid.length)
  for (let r = 0; r < copyRows; r++) {
    const src = grid[r]
    const copyCols = Math.min(cols, src.length)
    out[r].set(src.subarray(0, copyCols))
  }
  return out
}

/** Trả về grid MỚI với 1 ô đã đổi giá trị (immutable — an toàn cho Zustand). */
export function setCell(grid, row, col, value) {
  if (row < 0 || row >= grid.length) return grid
  if (col < 0 || col >= grid[row].length) return grid
  if (grid[row][col] === value) return grid
  const nextRow = grid[row].slice()
  nextRow[col] = value
  const next = grid.slice()
  next[row] = nextRow
  return next
}

export function isGridEmpty(grid) {
  return grid.every((row) => row.every((v) => v === 0))
}
