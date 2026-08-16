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

  it('벽까지 거리가 예전 고정 스텝 수(300)를 넘는 큰 방에서도 벽을 찾아 스냅한다', () => {
    const w = 1400
    const h = 1400
    // 좌우 벽은 각각 301 스텝 거리(예전 300 스텝 캡을 넘음), 상하는 열린 공간
    const walkable = buildMask(w, h, (x) => x >= 400 && x < 1001)
    const snap = findCorridorSnap(w, h, walkable, 700, 700)
    expect(snap).not.toBeNull()
    expect(snap!.axis).toBe('x')
    expect(snap!.x).toBeCloseTo(700)
    expect(snap!.y).toBe(700)
  })

  it('복도가 넓은 로비로 합쳐지는 교차점에서도 찾은 span 중 더 좁은 쪽으로 스냅한다(폭 제한 없음 — 의도적 선택)', () => {
    // 여러 복도가 문틈으로 넓게 합쳐지는 지점에서는 로비 폭 전체를 "복도 폭"으로 오인해 다소 먼 곳으로
    // 스냅할 수 있다. 폭 상한(축척 기반)을 넣어봤지만 정상적인 넓은 개방 공간(로비 등)에서도 스냅을 아예
    // 안 하게 돼 버려 오히려 불편하다는 피드백에 따라 상한 없이 항상 스냅하는 쪽을 선택했다 — 토글로 기능
    // 자체를 끌 수 있으니 드문 교차점 오작동보다 항상 뭔가는 스냅되는 쪽이 낫다는 판단.
    const w = 400
    const h = 300
    const mask = new Uint8Array(w * h)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * w + x] = 1
    }
    rect(50, 0, 70, 150) // 세로 복도(폭 20)
    rect(30, 150, 110, 200) // 세로 복도와 가로 복도를 잇는 넓은 로비(폭 80)
    rect(110, 180, 300, 200) // 가로 복도(폭 20)

    const snap = findCorridorSnap(w, h, mask, 60, 180)
    expect(snap).not.toBeNull()
  })
})
