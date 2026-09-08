import { describe, it, expect } from 'vitest'
import {
  TS_CONFIG,
  TS_RESET,
  TS_START,
  valveBytesFor,
  packConfigFrame,
  packFrame,
  valveBits,
  buildAnimationFrames,
  gridToOpenValveRows,
} from '../valveCodec.js'

function hex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

describe('valveBytesFor', () => {
  it('rounds up to whole bytes', () => {
    expect(valveBytesFor(80)).toBe(10)
    expect(valveBytesFor(320)).toBe(40)
    expect(valveBytesFor(50)).toBe(7) // not a multiple of 8
    expect(valveBytesFor(1)).toBe(1)
    expect(valveBytesFor(8)).toBe(1)
    expect(valveBytesFor(9)).toBe(2)
  })
})

describe('packConfigFrame — byte-exact', () => {
  it('80 valves -> FD FF FF FF 50 00 (spec example)', () => {
    expect(hex(packConfigFrame(80))).toBe('FD FF FF FF 50 00')
  })

  it('320 valves -> FD FF FF FF 40 01 (spec example)', () => {
    expect(hex(packConfigFrame(320))).toBe('FD FF FF FF 40 01')
  })

  it('is exactly 6 bytes', () => {
    expect(packConfigFrame(80).length).toBe(6)
  })
})

describe('packFrame — little-endian timestamp', () => {
  it('encodes ts_ms as LE u32 (160 -> A0 00 00 00)', () => {
    const f = packFrame(160, new Uint8Array(2))
    expect(hex(f.slice(0, 4))).toBe('A0 00 00 00')
  })

  it('reserved timestamps encode to their documented byte patterns', () => {
    expect(hex(packFrame(TS_RESET, new Uint8Array(1)).slice(0, 4))).toBe('FF FF FF FF')
    expect(hex(packFrame(TS_START, new Uint8Array(1)).slice(0, 4))).toBe('FE FF FF FF')
    expect(hex(packFrame(TS_CONFIG, new Uint8Array(0)).slice(0, 4))).toBe('FD FF FF FF')
  })

  it('frame length is 4 + B', () => {
    const B = 10
    expect(packFrame(0, new Uint8Array(B)).length).toBe(4 + B)
  })
})

describe('valveBits — MSB-first packing', () => {
  it('valve 0 -> byte[0] = 0x80', () => {
    expect(valveBits([0], 1)[0]).toBe(0x80)
  })

  it('valve 7 -> byte[0] = 0x01', () => {
    expect(valveBits([7], 1)[0]).toBe(0x01)
  })

  it('valve 8 -> byte[1] = 0x80 (byte[0] stays 0)', () => {
    const bits = valveBits([8], 2)
    expect(bits[0]).toBe(0x00)
    expect(bits[1]).toBe(0x80)
  })

  it('last valve of a non-multiple-of-8 width sets the correct bit, trailing bits stay 0', () => {
    // 50 valves -> B=7 (56 bits), last valid valve index = 49
    const B = valveBytesFor(50)
    const bits = valveBits([49], B)
    // valve 49 -> byte 6, bit (7 - (49 % 8)) = (7-1) = 6 -> 0x40
    expect(bits[6]).toBe(0x40)
    // every other byte must be 0
    for (let i = 0; i < B - 1; i++) expect(bits[i]).toBe(0x00)
  })

  it('valves outside [0, B*8) are ignored, never throw', () => {
    const bits = valveBits([-1, 999], 1)
    expect(Array.from(bits)).toEqual([0x00])
  })

  it('multiple valves in the same byte combine with OR', () => {
    // valves 0 and 7 -> 0x80 | 0x01 = 0x81
    expect(valveBits([0, 7], 1)[0]).toBe(0x81)
  })
})

describe('gridToOpenValveRows', () => {
  it('extracts open (truthy) column indices per row', () => {
    const grid = [
      new Uint8Array([1, 0, 1, 0]),
      new Uint8Array([0, 0, 0, 0]),
    ]
    expect(gridToOpenValveRows(grid)).toEqual([[0, 2], []])
  })
})

describe('buildAnimationFrames — stream order and structure', () => {
  it('emits CONFIG, RESET, START, one DATA per non-empty row, then an all-off sentinel', () => {
    const rows = [[0], [], [1]] // row 1 is empty -> skipped as a no-op frame
    const frames = buildAnimationFrames(rows, 50, 8) // valveCount=8 -> B=1

    // CONFIG first, 6 bytes, declares valveCount=8
    expect(frames[0].length).toBe(6)
    expect(hex(frames[0])).toBe('FD FF FF FF 08 00')

    // RESET then START, each 4+B=5 bytes
    expect(hex(frames[1])).toBe('FF FF FF FF 00')
    expect(hex(frames[2])).toBe('FE FF FF FF 00')

    // DATA for row 0 (ts=0, valve 0 -> 0x80); row 1 skipped (all-zero); row 2 (ts=100, valve 1 -> 0x40)
    expect(hex(frames[3])).toBe('00 00 00 00 80')
    expect(hex(frames[4])).toBe('64 00 00 00 40') // ts=2*50=100 -> 0x64 LE

    // Sentinel: ts = rows.length * rowIntervalMs = 150, bits all-zero
    const sentinel = frames[frames.length - 1]
    expect(hex(sentinel)).toBe('96 00 00 00 00') // 150 = 0x96
    expect(sentinel.length).toBe(5)
  })

  it('every non-CONFIG frame has length 4 + B for a dynamic (non-multiple-of-8) valve count', () => {
    const valveCount = 50
    const B = valveBytesFor(valveCount)
    const rows = [[49], [0, 7]]
    const frames = buildAnimationFrames(rows, 20, valveCount)
    // frames[0] = CONFIG (6 bytes); everything else must be 4+B
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].length).toBe(4 + B)
    }
  })

  it('an all-zero drawn row produces no DATA frame (only the trailing sentinel remains all-zero)', () => {
    const frames = buildAnimationFrames([[], []], 10, 8)
    // CONFIG + RESET + START + sentinel = 4 frames, no DATA in between
    expect(frames.length).toBe(4)
  })
})
