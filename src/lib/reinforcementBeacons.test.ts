import { describe, expect, it } from 'vitest'
import { applyLocalPlacementRules, dedupeClosePlanItems, findAdjacentPairs, nearestWalkable } from './reinforcementBeacons'

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

  it('가운데 장애물을 사이에 두고 도는 두 평행한 경로는 둘 다 이어진다(실제 발견된 문제: 위쪽엔 생기고 아래쪽엔 안 생김)', () => {
    const w = 50
    const h = 30
    // 가운데 사각형 장애물(계단실) 하나를 빼고 나머진 전부 통행 가능 — 위/아래로 도는 고리형 복도.
    const walkable = buildMask(w, h, (x, y) => !(x >= 15 && x < 35 && y >= 10 && y < 20))
    const points: P[] = [
      { id: '1', x: 10, y: 5, component: 0 }, // 위쪽 왼편
      { id: '8', x: 40, y: 5, component: 0 }, // 위쪽 오른편
      { id: '4', x: 10, y: 25, component: 0 }, // 아래쪽 왼편
      { id: '7', x: 40, y: 25, component: 0 }, // 아래쪽 오른편 — 1-8과 거리가 같음
    ]
    const pairs = findAdjacentPairs(points, w, h, walkable, 1)
    expect(hasPair(pairs, '1', '8')).toBe(true)
    expect(hasPair(pairs, '4', '7')).toBe(true)
  })

  it('한 곳에 촘촘하게 몰린 비콘들은 거의 다 이어버리지 않는다(실제 발견된 문제: 6개 비콘에 15개 가능 쌍 중 12개가 걸림)', () => {
    // 트리(MST) 모양이 아니라 덩어리 형태로 몰려 있으면, "MST 트리 경로보다 살짝만 짧아도" 평행
    // 경로로 인정하는 기준이 너무 관대해서 거의 완전그래프에 가깝게 이어지던 문제.
    const w = 400
    const h = 400
    const walkable = new Uint8Array(w * h).fill(1) // 넓은 방 하나, 전부 서로 가시선 닿음
    const points: P[] = [
      { id: 'B1', x: 60, y: 160, component: 0 },
      { id: 'B4', x: 200, y: 220, component: 0 },
      { id: 'B6', x: 40, y: 190, component: 0 },
      { id: 'B7', x: 170, y: 130, component: 0 },
      { id: 'B8', x: 300, y: 60, component: 0 },
      { id: 'B9', x: 320, y: 240, component: 0 },
    ]
    const pairs = findAdjacentPairs(points, w, h, walkable, 1)
    // MST 기준 최소 5개(N-1) — 평행 경로 보완이 있어도 크게 안 넘어야 한다(예전엔 12개까지 폭증).
    expect(pairs.length).toBeLessThanOrEqual(7)
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

  it('간선의 끝점이 아닌, 그냥 근처에 있던 다른 의미비콘과 겹치면 버린다(실제 발견된 문제)', () => {
    const items = [
      { x: 10, y: 0, pair: ['A', 'B'] as [string, string] }, // A-B 간선의 보간점
    ]
    // C는 A-B 간선과 무관한 제3의 의미비콘인데, 우연히 보간점 바로 옆(1m)에 서 있다.
    const existingSemanticPoints = [{ x: 11, y: 0 }]
    const result = dedupeClosePlanItems(items, 1, existingSemanticPoints)
    expect(result).toHaveLength(0)
  })
})

describe('applyLocalPlacementRules', () => {
  it('어느 방향으로도 2m 안에 벽이 없으면(뻥 뚫린 공간 한복판) 버린다', () => {
    const w = 220
    const h = 220
    const walkable = buildMask(w, h, (x, y) => x >= 10 && x < 210 && y >= 10 && y < 210) // 200x200 방
    // 정중앙 — 어느 벽까지도 100px(scaleMPerPx=0.05 기준 5m), 근접 반경(2m=40px) 훨씬 밖
    const result = applyLocalPlacementRules(110, 110, w, h, walkable, 0.05)
    expect(result).toBeNull()
  })

  it('벽 근처(2m 이내)면 버리지 않고, 복도(방)가 넓으면(4m 이상) 원래 좌표를 그대로 돌려준다', () => {
    const w = 220
    const h = 220
    const walkable = buildMask(w, h, (x, y) => x >= 10 && x < 210 && y >= 10 && y < 210) // 200x200 방
    // 왼쪽 벽(x=9)에서 6px(0.3m) — 근접 반경 안이라 안 버려지고, 방이 넓어(10m) 좁은 복도 스냅도 안 걸림
    const result = applyLocalPlacementRules(15, 110, w, h, walkable, 0.05)
    expect(result).toEqual({ x: 15, y: 110 })
  })

  it('복도 폭(수직/수평 중 짧은 쪽)이 4m보다 좁으면 정중앙으로 스냅한다', () => {
    const w = 220
    const h = 80
    // 가로로 긴 복도: 세로 폭 60px(scaleMPerPx=0.05 기준 3m, 좁음) · 가로는 200px(10m, 넓음)
    const walkable = buildMask(w, h, (x, y) => x >= 10 && x < 210 && y >= 10 && y < 70)
    // 위쪽 벽(y=9)에서 11px만 떨어진, 세로로 치우친 위치
    const result = applyLocalPlacementRules(110, 20, w, h, walkable, 0.05)
    // 세로 복도 폭은 y=9(위 벽)~y=70(아래 벽) 사이 — 정중앙(y=39.5)으로 스냅되고 가로(x)는 안 바뀐다
    expect(result).toEqual({ x: 110, y: 39.5 })
  })
})
