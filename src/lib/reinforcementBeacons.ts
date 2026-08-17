// 보강비콘 자동생성: 마스크로 같은 방·복도(connected component)를 구분하고,
// 그 안에서 의미비콘들을 최소 신장 트리(MST)로 이어 D_max(6m) 초과 구간에 균등 삽입한다.

import type { FloorMask } from '@/features/mapEditor/api'
import { MAP_DESIGN_W } from './constants'
import { rasterizeMask } from './maskRaster'

export const D_MAX_M = 6

export interface SemanticPoint {
  id: string
  x: number // 설계도 좌표(900 기준)
  y: number
}

export interface ReinforcementPlanItem {
  x: number
  y: number
  pair: [string, string] // 근거가 된 두 의미비콘 id
}

// flood-fill 라벨링 — 4방향 연결(좌우 인덱스가 행을 넘어가며 랩어라운드하지 않도록 x 차이를 검사)
function labelComponents(w: number, h: number, walkable: Uint8Array): Int32Array {
  const labels = new Int32Array(w * h).fill(-1)
  let next = 0
  const stack: number[] = []
  for (let start = 0; start < walkable.length; start++) {
    if (!walkable[start] || labels[start] !== -1) continue
    const label = next++
    stack.push(start)
    labels[start] = label
    while (stack.length) {
      const idx = stack.pop() as number
      const x = idx % w
      const neighbors = [idx - 1, idx + 1, idx - w, idx + w]
      for (const n of neighbors) {
        if (n < 0 || n >= walkable.length) continue
        if (Math.abs((n % w) - x) > 1) continue
        if (!walkable[n] || labels[n] !== -1) continue
        labels[n] = label
        stack.push(n)
      }
    }
  }
  return labels
}

// 마스크 픽셀 좌표에서 가장 가까운 통행가능 픽셀을 찾는다(벽 위·경계에 찍힌 점 보정용). 반경 내에 없으면 null.
export function nearestWalkable(
  px: number,
  py: number,
  w: number,
  h: number,
  walkable: Uint8Array,
): { x: number; y: number } | null {
  const x0 = Math.round(px)
  const y0 = Math.round(py)
  for (let r = 0; r <= 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = x0 + dx
        const y = y0 + dy
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        if (walkable[y * w + x]) return { x, y }
      }
    }
  }
  return null
}

// 마스크 픽셀 좌표에서 가장 가까운 통행가능 픽셀의 컴포넌트 라벨을 찾는다(벽 경계에 찍힌 점 보정용).
function componentAt(px: number, py: number, w: number, h: number, walkable: Uint8Array, labels: Int32Array): number {
  const nearest = nearestWalkable(px, py, w, h, walkable)
  return nearest ? labels[nearest.y * w + nearest.x] : -1
}

// a→b 직선이 통행 영역을 벗어나지 않는지 본다(좌표는 설계도 900 기준, ratio로 마스크 픽셀로 환산).
// 복도가 살짝 휘어 직선이 벽을 스치는 정도는 허용해야 하므로(완전히 곧은 직선 복도가 드묾), 표본점
// 중 10%까지는 벽에 걸려도 눈감아준다 — 그보다 많이 벗어나면 실제로 다른 방을 가로지르는 것으로 본다.
const VISIBILITY_BLOCKED_TOLERANCE = 0.1

function isVisible(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  w: number,
  h: number,
  walkable: Uint8Array,
  ratio: number,
): boolean {
  const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) * ratio))
  let blocked = 0
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = Math.round((ax + (bx - ax) * t) * ratio)
    const y = Math.round((ay + (by - ay) * t) * ratio)
    if (x < 0 || y < 0 || x >= w || y >= h || !walkable[y * w + x]) blocked++
  }
  return blocked / (steps + 1) <= VISIBILITY_BLOCKED_TOLERANCE
}

// 같은 컴포넌트(방·복도) 안에서 의미비콘들을 잇는 최소 신장 트리(MST)를 구한다. 비콘이 N개면 항상
// 정확히 N-1개(또는 그 이하, 가시선 그래프가 끊긴 경우)의 간선만 생긴다 — 그래프가 아니라 트리라서,
// 촘촘한 구역에서 "서로 가시선 닿는 쌍을 전부" 이어버려 보강비콘이 여러 겹으로 겹쳐 생기는 문제가
// 애초에 생기지 않는다(실제 발견된 문제: "생기긴 하는데 막 2개씩 생기고 너무 많이 생겨").
// 예전엔 비콘마다 자기 최근접 하나만 이었는데, 그러면 교차로처럼 한 지점에서 여러 방향으로 갈라지는
// 곳은 한쪽만 이어지고 나머지가 통째로 빠지는 문제가 있었다 — MST는 별 모양 위상에서도(중심에서
// 갈라지는 게 가장 싼 트리이므로) 모든 방향이 자연스럽게 이어진다. 후보 간선은 가시선(벽을 안
// 가로지름)이 있는 쌍으로만 제한한다.
export function findAdjacentPairs<T extends { id: string; x: number; y: number; component: number }>(
  points: T[],
  w: number,
  h: number,
  walkable: Uint8Array,
  ratio: number,
): [T, T][] {
  const componentIds = [...new Set(points.map((p) => p.component))].filter((c) => c !== -1)
  const result: [T, T][] = []
  for (const compId of componentIds) {
    const group = points.filter((p) => p.component === compId)
    if (group.length < 2) continue

    const candidates: { a: T; b: T; dist: number }[] = []
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (a.x === b.x && a.y === b.y) continue
        if (!isVisible(a.x, a.y, b.x, b.y, w, h, walkable, ratio)) continue
        candidates.push({ a, b, dist: Math.hypot(a.x - b.x, a.y - b.y) })
      }
    }
    candidates.sort((x, y) => x.dist - y.dist)

    // Kruskal's MST — union-find로 사이클(불필요한 중복 연결) 방지
    const parent = new Map<string, string>()
    for (const p of group) parent.set(p.id, p.id)
    function find(id: string): string {
      const p = parent.get(id) as string
      if (p === id) return id
      const root = find(p)
      parent.set(id, root)
      return root
    }
    for (const { a, b } of candidates) {
      const rootA = find(a.id)
      const rootB = find(b.id)
      if (rootA === rootB) continue
      parent.set(rootA, rootB)
      result.push([a, b])
    }
  }
  return result
}

// 서로 다른 간선의 보간점이 nearestWalkable 보정(좁은 복도에서 벽에 걸린 점을 통로 쪽으로 당김)
// 때문에 우연히 거의 같은 위치로 몰릴 수 있다 — 실질적으로 같은 지점을 중복 표시하는 것이므로,
// 이미 채택한 점과 이 거리보다 가까우면 나중 점은 버린다. 한 간선 안에서 균등 삽입되는 점끼리는
// 항상 D_MAX_M/2(3m) 이상 떨어지므로, 그보다 확실히 작은 값으로 잡아 정상 간격은 건드리지 않는다.
const MIN_REINFORCEMENT_SPACING_M = 2

export function dedupeClosePlanItems(
  items: ReinforcementPlanItem[],
  mPerDesignPx: number,
): ReinforcementPlanItem[] {
  const kept: ReinforcementPlanItem[] = []
  for (const item of items) {
    const tooClose = kept.some(
      (k) => Math.hypot(item.x - k.x, item.y - k.y) * mPerDesignPx < MIN_REINFORCEMENT_SPACING_M,
    )
    if (tooClose) continue
    kept.push(item)
  }
  return kept
}

// scaleMPerPx는 지도검수 캔버스(마스크 픽셀) 기준으로 캘리브레이션된 값이라,
// 비콘의 설계도 좌표(900 기준)와는 스케일이 다르다 — mask.width/900 비율로 보정해 실거리를 구한다.
export async function planReinforcementBeacons(
  semanticPoints: SemanticPoint[],
  mask: FloorMask,
  scaleMPerPx: number,
): Promise<ReinforcementPlanItem[]> {
  if (semanticPoints.length < 2) return []
  const { w, h, walkable } = await rasterizeMask(mask)
  const labels = labelComponents(w, h, walkable)
  const ratio = w / MAP_DESIGN_W // mask px per 설계도 px
  const mPerDesignPx = ratio * scaleMPerPx

  const withComponent = semanticPoints.map((p) => ({
    ...p,
    component: componentAt(p.x * ratio, p.y * ratio, w, h, walkable, labels),
  }))

  const pairs = findAdjacentPairs(withComponent, w, h, walkable, ratio)

  const plan: ReinforcementPlanItem[] = []
  for (const [a, b] of pairs) {
    const pixelDist = Math.hypot(a.x - b.x, a.y - b.y)
    const meters = pixelDist * mPerDesignPx
    if (meters <= D_MAX_M) continue
    const n = Math.ceil(meters / D_MAX_M) - 1
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1)
      const rawX = a.x + (b.x - a.x) * t
      const rawY = a.y + (b.y - a.y) * t
      // 직선 보간이라 복도가 휘는 구간에서는 벽 위에 찍힐 수 있다 — 통행 가능 픽셀로 보정한다.
      const corrected = nearestWalkable(rawX * ratio, rawY * ratio, w, h, walkable)
      const x = corrected ? corrected.x / ratio : rawX
      const y = corrected ? corrected.y / ratio : rawY
      plan.push({ x, y, pair: [a.id, b.id] })
    }
  }
  return dedupeClosePlanItems(plan, mPerDesignPx)
}
