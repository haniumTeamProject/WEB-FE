import { describe, expect, it } from 'vitest'
import { closeGaps, openNoise } from './maskMorphology'

function buildMask(w: number, h: number, isSet: (x: number, y: number) => boolean): Uint8Array {
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      mask[y * w + x] = isSet(x, y) ? 1 : 0
    }
  }
  return mask
}

describe('closeGaps', () => {
  it('벽으로 막히지 않은 좁은 틈을 이어붙인다', () => {
    const w = 20
    const h = 5
    // x=0..8과 x=11..19만 통행 가능, 그 사이 x=9..10은 틈(2px)
    const walkable = buildMask(w, h, (x) => x <= 8 || x >= 11)
    const barrier = new Uint8Array(w * h)
    const result = closeGaps(walkable, barrier, w, h, 2)
    expect(result[2 * w + 9]).toBe(1)
    expect(result[2 * w + 10]).toBe(1)
  })

  it('벽으로 막힌 틈은 이어붙이지 않는다', () => {
    const w = 20
    const h = 5
    const walkable = buildMask(w, h, (x) => x <= 8 || x >= 11)
    const barrier = buildMask(w, h, (x) => x === 9 || x === 10)
    const result = closeGaps(walkable, barrier, w, h, 2)
    expect(result[2 * w + 9]).toBe(0)
    expect(result[2 * w + 10]).toBe(0)
  })
})

describe('openNoise', () => {
  it('반경보다 작은 돌출부를 제거하고 원래 모양은 유지한다', () => {
    const w = 20
    const h = 20
    // 5..14 x 5..14의 정사각형 통행영역 + (2,2) 한 칸짜리 잡음(반경 1로는 못 없앨 만큼 붙어있지 않음)
    const walkable = buildMask(w, h, (x, y) => (x >= 5 && x <= 14 && y >= 5 && y <= 14) || (x === 2 && y === 2))
    const barrier = new Uint8Array(w * h)
    const result = openNoise(walkable, barrier, w, h, 1)
    expect(result[2 * w + 2]).toBe(0) // 잡음 제거됨
    expect(result[10 * w + 10]).toBe(1) // 본체는 유지됨
  })
})
