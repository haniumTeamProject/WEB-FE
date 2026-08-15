import { describe, expect, it } from 'vitest'
import { findCorridorSnap } from './corridorSnap'

// w x h 그리드에서 walkable(x,y) 판정 함수로 Uint8Array 마스크를 만든다.
function buildMask(w: number, h: number, isWalkable: (x: number, y: number) => boolean): Uint8Array {
  const walkable = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      walkable[y * w + x] = isWalkable(x, y) ? 1 : 0
    }
  }
  return walkable
}

describe('findCorridorSnap', () => {
  it('세로 복도(좌우가 좁음)면 가로축으로 스냅한다', () => {
    const w = 20
    const h = 20
    // x=8..11(폭 4)만 통행 가능한 세로 복도, 상하로는 뚫려있음(열린 공간)
    const walkable = buildMask(w, h, (x) => x >= 8 && x <= 11)
    const snap = findCorridorSnap(w, h, walkable, 9, 10)
    expect(snap).not.toBeNull()
    expect(snap!.axis).toBe('x')
    expect(snap!.x).toBeCloseTo(9.5)
    expect(snap!.y).toBe(10)
  })

  it('가로 복도(상하가 좁음)면 세로축으로 스냅한다', () => {
    const w = 20
    const h = 20
    // y=8..11(폭 4)만 통행 가능한 가로 복도
    const walkable = buildMask(w, h, (_x, y) => y >= 8 && y <= 11)
    const snap = findCorridorSnap(w, h, walkable, 10, 9)
    expect(snap).not.toBeNull()
    expect(snap!.axis).toBe('y')
    expect(snap!.y).toBeCloseTo(9.5)
    expect(snap!.x).toBe(10)
  })

  it('사방이 다 열린 공간이면 스냅하지 않는다', () => {
    const w = 20
    const h = 20
    const walkable = buildMask(w, h, () => true)
    const snap = findCorridorSnap(w, h, walkable, 10, 10)
    expect(snap).toBeNull()
  })

  it('벽 위(통행 불가 지점)에서는 스냅하지 않는다', () => {
    const w = 20
    const h = 20
    const walkable = buildMask(w, h, (x) => x >= 8 && x <= 11)
    const snap = findCorridorSnap(w, h, walkable, 0, 0)
    expect(snap).toBeNull()
  })
})
