import { describe, expect, it } from 'vitest'
import { snapToGrid } from './utils'

describe('snapToGrid', () => {
  it('rounds to the nearest multiple of the grid size (default 5)', () => {
    expect(snapToGrid(12)).toBe(10)
    expect(snapToGrid(13)).toBe(15)
    expect(snapToGrid(0)).toBe(0)
  })

  it('supports a custom grid size', () => {
    expect(snapToGrid(24, 10)).toBe(20)
    expect(snapToGrid(26, 10)).toBe(30)
  })

  it('rounds negative values toward the nearest grid line', () => {
    expect(snapToGrid(-3)).toBe(-5)
    expect(snapToGrid(-2)).toBe(0)
  })
})
