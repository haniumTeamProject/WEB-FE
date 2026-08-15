import { describe, expect, it } from 'vitest'
import { nearestWalkable } from './reinforcementBeacons'

function buildMask(w: number, h: number, isWalkable: (x: number, y: number) => boolean): Uint8Array {
  const walkable = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      walkable[y * w + x] = isWalkable(x, y) ? 1 : 0
    }
  }
  return walkable
}

describe('nearestWalkable', () => {
  it('이미 통행 가능한 픽셀이면 그대로 돌려준다', () => {
    const w = 20
    const h = 20
    const walkable = buildMask(w, h, () => true)
    expect(nearestWalkable(10, 10, w, h, walkable)).toEqual({ x: 10, y: 10 })
  })

  it('벽 위에 찍혔으면 가장 가까운 통행 가능 픽셀로 보정한다', () => {
    const w = 20
    const h = 20
    // (13,10) 딱 한 칸만 통행 가능(복도가 휘어 직선 보간점이 벽에 걸리는 상황을 흉내) — 결과가 유일해서 동률 문제가 없다.
    const walkable = buildMask(w, h, (x, y) => x === 13 && y === 10)
    expect(nearestWalkable(10, 10, w, h, walkable)).toEqual({ x: 13, y: 10 })
  })

  it('반경 안에 통행 가능 픽셀이 전혀 없으면 null을 돌려준다', () => {
    const w = 20
    const h = 20
    const walkable = buildMask(w, h, () => false)
    expect(nearestWalkable(10, 10, w, h, walkable)).toBeNull()
  })
})
