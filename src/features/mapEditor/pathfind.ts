import type { PathEdge, PathNode } from './pathNodes'

export interface PathfindResult {
  path: string[] // 노드 id, 시작→도착 순서
  distancePx: number // 건너기 페널티가 반영된 가중치 합(px) — 실제 이동 거리와는 다를 수 있음
}

// 다익스트라. 그래프가 작아서(수십~수백 노드) 우선순위 큐 없이 O(V^2)로 충분하다.
// 'cross' 엣지에는 crossPenaltyPx를 더해, 돌아가는 것보다 충분히 짧게 절약될 때만 건너기를 고른다.
export function findShortestPath(
  nodes: PathNode[],
  edges: PathEdge[],
  startId: string,
  endId: string,
  crossPenaltyPx: number,
): PathfindResult | null {
  if (startId === endId) return { path: [startId], distancePx: 0 }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const adjacency = new Map<string, { to: string; weight: number }[]>()
  for (const n of nodes) adjacency.set(n.id, [])
  for (const e of edges) {
    const a = byId.get(e.a)
    const b = byId.get(e.b)
    if (!a || !b) continue
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const weight = e.type === 'cross' ? dist + crossPenaltyPx : dist
    adjacency.get(a.id)?.push({ to: b.id, weight })
    // directed 엣지(건너기)는 a->b로만 — 벽 끝/입구(a)에서 출발하는 것만 안전하다는 전제라, 반대
    // 방향(b->a)까지 열어두면 b가 그 자격을 안 갖췄어도 건너기를 타고 되돌아갈 수 있게 된다.
    if (!e.directed) adjacency.get(b.id)?.push({ to: a.id, weight })
  }
  if (!adjacency.has(startId) || !adjacency.has(endId)) return null

  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  const visited = new Set<string>()
  for (const n of nodes) dist.set(n.id, Infinity)
  dist.set(startId, 0)

  while (true) {
    let current: string | null = null
    let currentDist = Infinity
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < currentDist) {
        current = id
        currentDist = d
      }
    }
    if (current === null || current === endId) break
    visited.add(current)
    for (const { to, weight } of adjacency.get(current) ?? []) {
      if (visited.has(to)) continue
      const alt = currentDist + weight
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt)
        prev.set(to, current)
      }
    }
  }

  const endDist = dist.get(endId)
  if (endDist === undefined || endDist === Infinity) return null

  const path: string[] = [endId]
  let cur = endId
  while (cur !== startId) {
    const p = prev.get(cur)
    if (!p) return null
    path.unshift(p)
    cur = p
  }
  return { path, distancePx: endDist }
}
