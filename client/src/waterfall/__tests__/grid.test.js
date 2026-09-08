import { describe, it, expect } from 'vitest'
import { createEmptyGrid, resizeGrid, setCell, isGridEmpty } from '../grid.js'

describe('createEmptyGrid', () => {
  it('creates rows x cols, all zero', () => {
    const g = createEmptyGrid(3, 4)
    expect(g.length).toBe(3)
    g.forEach((row) => {
      expect(row.length).toBe(4)
      expect(Array.from(row)).toEqual([0, 0, 0, 0])
    })
  })
})

describe('setCell', () => {
  it('returns a new grid with the cell updated, original untouched', () => {
    const g = createEmptyGrid(2, 2)
    const next = setCell(g, 0, 1, 1)
    expect(next[0][1]).toBe(1)
    expect(g[0][1]).toBe(0) // original untouched (immutable)
    expect(next).not.toBe(g)
  })

  it('is a no-op (same reference) when the value does not change', () => {
    const g = createEmptyGrid(2, 2)
    const next = setCell(g, 0, 0, 0)
    expect(next).toBe(g)
  })

  it('ignores out-of-range row/col without throwing', () => {
    const g = createEmptyGrid(2, 2)
    expect(setCell(g, -1, 0, 1)).toBe(g)
    expect(setCell(g, 5, 0, 1)).toBe(g)
    expect(setCell(g, 0, 5, 1)).toBe(g)
  })
})

describe('resizeGrid', () => {
  it('preserves overlapping cells when growing', () => {
    let g = createEmptyGrid(2, 2)
    g = setCell(g, 1, 1, 1)
    const grown = resizeGrid(g, 3, 4)
    expect(grown.length).toBe(3)
    expect(grown[0].length).toBe(4)
    expect(grown[1][1]).toBe(1) // preserved
    expect(grown[2][0]).toBe(0) // new row is zeroed
  })

  it('crops cleanly when shrinking, discarding out-of-range cells', () => {
    let g = createEmptyGrid(3, 4)
    g = setCell(g, 2, 3, 1) // will be cropped away
    g = setCell(g, 0, 0, 1) // survives
    const shrunk = resizeGrid(g, 2, 2)
    expect(shrunk.length).toBe(2)
    expect(shrunk[0][0]).toBe(1)
    expect(shrunk[0].length).toBe(2)
  })
})

describe('isGridEmpty', () => {
  it('true for all-zero grid, false once any cell is set', () => {
    let g = createEmptyGrid(2, 2)
    expect(isGridEmpty(g)).toBe(true)
    g = setCell(g, 1, 1, 1)
    expect(isGridEmpty(g)).toBe(false)
  })
})
