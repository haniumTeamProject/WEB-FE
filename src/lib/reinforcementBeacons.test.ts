import { describe, expect, it } from 'vitest'
import { dedupeClosePlanItems, findAdjacentPairs, nearestWalkable } from './reinforcementBeacons'

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

interface P {
  id: string
  x: number
  y: number
  component: number
}

function hasPair(pairs: [P, P][], idA: string, idB: string): boolean {
  return pairs.some(([a, b]) => (a.id === idA && b.id === idB) || (a.id === idB && b.id === idA))
}

describe('findAdjacentPairs', () => {
  it('일직선 복도에서는 바로 옆 비콘끼리만 잇고, 사이에 낀 비콘을 건너뛴 먼 쌍은 안 잇는다', () => {
    const w = 30
    const h = 5
    const walkable = buildMask(w, h, (_x, y) => y === 2) // 가로로 뚫린 복도 한 줄
    const points: P[] = [
      { id: 'A', x: 0, y: 2, component: 0 },
      { id: 'B', x: 10, y: 2, component: 0 },
      { id: 'C', x: 20, y: 2, component: 0 },
    ]
    const pairs = findAdjacentPairs(points, w, h, walkable, 1)
    expect(hasPair(pairs, 'A', 'B')).toBe(true)
    expect(hasPair(pairs, 'B', 'C')).toBe(true)
    expect(hasPair(pairs, 'A', 'C')).toBe(false) // B가 이미 사이를 잇고 있으므로 건너뛴 직결은 불필요
  })

  it('교차로에서는 갈라지는 방향마다 전부 중심 비콘과 이어진다(예전엔 한 방향만 이어지던 문제)', () => {
    const w = 40
    const h = 40
    // 십자 모양 통행 영역: 세로줄 + 가로줄
    const walkable = buildMask(w, h, (x, y) => x === 20 || y === 20)
    const points: P[] = [
      { id: 'O', x: 20, y: 20, component: 0 },
      { id: 'N', x: 20, y: 10, component: 0 },
      { id: 'S', x: 20, y: 32, component: 0 },
      { id: 'E', x: 35, y: 20, component: 0 },
    ]
    const pairs = findAdjacentPairs(points, w, h, walkable, 1)
    expect(hasPair(pairs, 'O', 'N')).toBe(true)
    expect(hasPair(pairs, 'O', 'S')).toBe(true)
    expect(hasPair(pairs, 'O', 'E')).toBe(true)
    // 갈라지는 두 팔끼리는 중심(O)을 건너뛰고 직접 이어지면 안 된다
    expect(hasPair(pairs, 'N', 'S')).toBe(false)
    expect(hasPair(pairs, 'N', 'E')).toBe(false)
  })

  it('옆방에 있어 경로상 안 겹치는 비콘 때문에 정상적인 직결이 막히면 안 된다(실제 발견된 버그)', () => {
    const w = 30
    const h = 15
    // 복도(y=7, 가로로 쭉) + 그 아래 옆방(x 8~12, y 9~13) + 문 하나(x=10, y=8)로만 복도와 연결.
    const walkable = buildMask(
      w,
      h,
      (x, y) => y === 7 || (y === 8 && x === 10) || (x >= 8 && x <= 12 && y >= 9 && y <= 13),
    )
    const points: P[] = [
      { id: 'A', x: 0, y: 7, component: 0 },
      { id: 'B', x: 20, y: 7, component: 0 },
      { id: 'P', x: 10, y: 11, component: 0 }, // 옆방 안 — A-B 직선 중간 지점과 유클리드 거리는 가깝지만 벽 너머라 가시선이 없음
    ]
    const pairs = findAdjacentPairs(points, w, h, walkable, 1)
    expect(hasPair(pairs, 'A', 'B')).toBe(true)
  })

  it('다른 방(컴포넌트)에 있는 비콘끼리는 잇지 않는다', () => {
    const w = 30
    const h = 10
    const walkable = buildMask(w, h, (x, y) => (x < 10 && y === 2) || (x >= 20 && y === 2)) // 중간이 뚝 끊긴 두 복도
    const points: P[] = [
      { id: 'A', x: 0, y: 2, component: 0 },
      { id: 'B', x: 25, y: 2, component: 1 },
    ]
    const pairs = findAdjacentPairs(points, w, h, walkable, 1)
    expect(hasPair(pairs, 'A', 'B')).toBe(false)
  })

  it('같은 방(컴포넌트)이어도 직선이 벽을 가로지르면 잇지 않는다(ㄱ자로 꺾인 복도)', () => {
    const w = 20
    const h = 20
    // ㄱ자 복도: 세로 구간(x=2) + 가로 구간(y=15) — 둘 다 폭 3
    const walkable = buildMask(w, h, (x, y) => (x >= 1 && x <= 3 && y <= 15) || (y >= 14 && y <= 16 && x <= 18))
    const points: P[] = [
      { id: 'A', x: 2, y: 2, component: 0 }, // 세로 구간 위쪽 끝
      { id: 'B', x: 17, y: 15, component: 0 }, // 가로 구간 오른쪽 끝 — A와 직선으로는 벽을 가로지름
    ]
    const pairs = findAdjacentPairs(points, w, h, walkable, 1)
    expect(hasPair(pairs, 'A', 'B')).toBe(false)
  })
})

describe('dedupeClosePlanItems', () => {
  it('서로 다른 간선의 보간점이 거의 같은 위치로 몰리면 하나만 남긴다', () => {
    const items = [
      { x: 0, y: 0, pair: ['A', 'B'] as [string, string] },
      { x: 1, y: 0, pair: ['C', 'D'] as [string, string] }, // mPerDesignPx=1이면 1m 차이 — 중복으로 간주
      { x: 20, y: 0, pair: ['E', 'F'] as [string, string] }, // 충분히 멀어서 유지
    ]
    const result = dedupeClosePlanItems(items, 1)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.pair)).toEqual([
      ['A', 'B'],
      ['E', 'F'],
    ])
  })

  it('정상적인 균등 간격(D_MAX_M/2 이상)은 중복으로 보지 않는다', () => {
    const items = [
      { x: 0, y: 0, pair: ['A', 'B'] as [string, string] },
      { x: 3, y: 0, pair: ['A', 'B'] as [string, string] }, // mPerDesignPx=1이면 3m 차이 — 정상 최소 간격
    ]
    const result = dedupeClosePlanItems(items, 1)
    expect(result).toHaveLength(2)
  })
})
