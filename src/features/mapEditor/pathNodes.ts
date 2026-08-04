export type NodeKind = 'corner' | 'connector' | 'landmark' | 'facing'
export type EdgeKind = 'wall' | 'cross'

export interface PathNode {
  id: string
  x: number
  y: number
  type: NodeKind
  concave: boolean // corner 타입에서만 의미 있음
  pairKind?: 'connector' | 'landmark' // type === 'facing'일 때만 설정 — 맞은편이 어느 종류의 입구인지
}

export interface PathEdge {
  a: string
  b: string
  type: EdgeKind
}

export interface EntrancePoint {
  x: number
  y: number
  kind: 'connector' | 'landmark'
}

type Point = [number, number]

interface ComponentInfo {
  count: number
}

function labelComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; comps: ComponentInfo[] } {
  const labels = new Int32Array(w * h).fill(-1)
  const comps: ComponentInfo[] = []
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index] || labels[index] !== -1) continue
    const componentId = comps.length
    const stack = [index]
    let count = 0
    labels[index] = componentId
    while (stack.length) {
      const current = stack.pop() as number
      const x = current % w
      count++
      for (const next of [current - 1, current + 1, current - w, current + w]) {
        if (next < 0 || next >= mask.length || Math.abs((next % w) - x) > 1) continue
        if (mask[next] && labels[next] === -1) {
          labels[next] = componentId
          stack.push(next)
        }
      }
    }
    comps.push({ count })
  }
  return { labels, comps }
}

function traceBoundary(mask: Uint8Array, w: number, h: number, labels: Int32Array, componentId: number): Point[] {
  const isForeground = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1 && labels[y * w + x] === componentId
  const segments = new Map<string, { from: Point; to: Point }>()
  const addSegment = (from: Point, to: Point) => segments.set(from.join(','), { from, to })

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isForeground(x, y)) continue
      if (!isForeground(x, y - 1)) addSegment([x, y], [x + 1, y])
      if (!isForeground(x + 1, y)) addSegment([x + 1, y], [x + 1, y + 1])
      if (!isForeground(x, y + 1)) addSegment([x + 1, y + 1], [x, y + 1])
      if (!isForeground(x - 1, y)) addSegment([x, y + 1], [x, y])
    }
  }

  const loops: Point[][] = []
  while (segments.size) {
    const first = segments.values().next().value as { from: Point; to: Point }
    const loop: Point[] = [first.from]
    let segment: { from: Point; to: Point } | undefined = first
    while (segment) {
      segments.delete(segment.from.join(','))
      loop.push(segment.to)
      segment = segments.get(segment.to.join(','))
      if (segment?.to.join(',') === loop[0].join(',')) break
    }
    if (loop.length > 3) loops.push(loop.slice(0, -1))
  }
  return loops.sort((a, b) => b.length - a.length)[0] ?? []
}

function perpendicularDistance([x, y]: Point, [x1, y1]: Point, [x2, y2]: Point): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(x - x1, y - y1)
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

function simplifyOpen(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points
  let maxDistance = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], points[0], points.at(-1) as Point)
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }
  if (maxDistance <= epsilon) return [points[0], points.at(-1) as Point]
  return [...simplifyOpen(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplifyOpen(points.slice(index), epsilon)]
}

function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 4) return points
  const pivot = points[0]
  const split = points.reduce(
    (best, point, index) =>
      Math.hypot(point[0] - pivot[0], point[1] - pivot[1]) > Math.hypot(points[best][0] - pivot[0], points[best][1] - pivot[1])
        ? index
        : best,
    1,
  )
  return [
    ...simplifyOpen(points.slice(0, split + 1), epsilon).slice(0, -1),
    ...simplifyOpen([...points.slice(split), pivot], epsilon).slice(0, -1),
  ]
}

// loop을 닫힌 폴리곤(마지막 점 → 첫 점 연결 포함)으로 보고, point에 가장 가까운 지점을 구한다.
function nearestPointOnLoop(loop: Point[], point: Point): { point: Point; segmentIndex: number; t: number; distance: number } {
  let best = { point: loop[0], segmentIndex: 0, t: 0, distance: Infinity }
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i]
    const [x2, y2] = loop[(i + 1) % loop.length]
    const dx = x2 - x1
    const dy = y2 - y1
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - x1) * dx + (point[1] - y1) * dy) / lengthSquared))
    const projected: Point = [x1 + t * dx, y1 + t * dy]
    const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1])
    if (distance < best.distance) best = { point: projected, segmentIndex: i, t, distance }
  }
  return best
}

// segmentIndex 주변 원본 경계점들의 평균 방향(접선)을 구해 90도 회전한 법선을 반환한다.
function estimateNormal(rawLoop: Point[], segmentIndex: number): Point {
  const n = rawLoop.length
  const before = rawLoop[(segmentIndex - TANGENT_WINDOW + n) % n]
  const after = rawLoop[(segmentIndex + 1 + TANGENT_WINDOW) % n]
  const tangentX = after[0] - before[0]
  const tangentY = after[1] - before[1]
  const length = Math.hypot(tangentX, tangentY)
  if (length === 0) return [0, 0]
  return [-tangentY / length, tangentX / length]
}

// start에서 normal(또는 -normal) 방향으로 1px씩 전진하며 통행영역을 벗어나기 직전의 지점을 찾는다.
function rayCastToOppositeWall(mask: Uint8Array, w: number, h: number, start: Point, normal: Point): Point | null {
  if (normal[0] === 0 && normal[1] === 0) return null
  const maxSteps = Math.max(w, h)

  function march(dirX: number, dirY: number): Point | null {
    let x = start[0]
    let y = start[1]
    let last: Point | null = null
    for (let step = 0; step < maxSteps; step++) {
      x += dirX
      y += dirY
      const cellX = Math.floor(x)
      const cellY = Math.floor(y)
      if (cellX < 0 || cellY < 0 || cellX >= w || cellY >= h) return last
      if (mask[cellY * w + cellX] === 0) return last
      last = [x, y]
    }
    return null
  }

  return march(normal[0], normal[1]) ?? march(-normal[0], -normal[1])
}

function kindPriority(kind: NodeKind): number {
  if (kind === 'connector' || kind === 'landmark') return 2
  if (kind === 'facing') return 1
  return 0
}

const MIN_COMPONENT_PIXELS = 25
const SIMPLIFY_EPSILON_PX = 3
const MAX_SNAP_PX = 30
const MERGE_RADIUS_PX = 6
const TANGENT_WINDOW = 6
const CROSSING_MAX_PX = 100

interface LoopEntry {
  point: Point
  kind: NodeKind
  pairKind?: 'connector' | 'landmark'
  segmentIndex: number
  t: number
}

export function generatePathNodes(
  mask: Uint8Array,
  w: number,
  h: number,
  entrances: EntrancePoint[] = [],
): { nodes: PathNode[]; edges: PathEdge[] } {
  const nodes: PathNode[] = []
  const edges: PathEdge[] = []
  const edgeKeys = new Set<string>()

  function addEdge(a: PathNode, b: PathNode, type: EdgeKind) {
    if (a.id === b.id) return
    const key = `${type}:${a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ a: a.id, b: b.id, type })
  }

  const { labels, comps } = labelComponents(mask, w, h)

  const components = comps
    .map((component, componentId) => ({ componentId, count: component.count }))
    .filter((component) => component.count >= MIN_COMPONENT_PIXELS)
    .map(({ componentId }) => {
      const rawLoop = traceBoundary(mask, w, h, labels, componentId)
      const simplifiedLoop = simplify(rawLoop, SIMPLIFY_EPSILON_PX)
      return { rawLoop, simplifiedLoop }
    })
    .filter((component) => component.rawLoop.length > 0 && component.simplifiedLoop.length >= 3)

  // 입구 후보를 가장 가까운 컴포넌트에 배정한다(30px 초과 시 버림)
  const assigned: { entrance: EntrancePoint; snap: Point; rawSegmentIndex: number }[][] = components.map(() => [])
  for (const entrance of entrances) {
    let bestComponentIndex = -1
    let bestSnap: ReturnType<typeof nearestPointOnLoop> | null = null
    for (let index = 0; index < components.length; index++) {
      const snap = nearestPointOnLoop(components[index].rawLoop, [entrance.x, entrance.y])
      if (!bestSnap || snap.distance < bestSnap.distance) {
        bestSnap = snap
        bestComponentIndex = index
      }
    }
    if (!bestSnap || bestSnap.distance > MAX_SNAP_PX) {
      console.warn(`[pathNodes] entrance snap skipped (too far): kind=${entrance.kind} at (${entrance.x}, ${entrance.y})`)
      continue
    }
    assigned[bestComponentIndex].push({ entrance, snap: bestSnap.point, rawSegmentIndex: bestSnap.segmentIndex })
  }

  components.forEach(({ rawLoop, simplifiedLoop }, componentIndex) => {
    const entries: LoopEntry[] = simplifiedLoop.map((point, index) => ({ point, kind: 'corner', segmentIndex: index, t: 0 }))

    function findOrInsert(point: Point, kind: NodeKind, pairKind?: 'connector' | 'landmark', exclude?: LoopEntry): LoopEntry {
      const existing = entries.find(
        (entry) => entry !== exclude && Math.hypot(entry.point[0] - point[0], entry.point[1] - point[1]) <= MERGE_RADIUS_PX,
      )
      if (existing) {
        if (kindPriority(kind) > kindPriority(existing.kind)) {
          existing.kind = kind
          existing.pairKind = pairKind
        }
        return existing
      }
      const nearest = nearestPointOnLoop(simplifiedLoop, point)
      const entry: LoopEntry = { point, kind, pairKind, segmentIndex: nearest.segmentIndex, t: nearest.t }
      entries.push(entry)
      return entry
    }

    const pairs: { entranceEntry: LoopEntry; facingEntry: LoopEntry }[] = []
    for (const { entrance, snap, rawSegmentIndex } of assigned[componentIndex]) {
      const entranceEntry = findOrInsert(snap, entrance.kind)
      const normal = estimateNormal(rawLoop, rawSegmentIndex)
      const facingRaw = rayCastToOppositeWall(mask, w, h, snap, normal)
      if (!facingRaw) {
        console.warn(`[pathNodes] facing point not found: kind=${entrance.kind} at (${entrance.x}, ${entrance.y})`)
        continue
      }
      const facingSnap = nearestPointOnLoop(rawLoop, facingRaw).point
      // 맞은편 지점이 자기 짝인 입구 노드 자체와 병합되지 않도록 제외한다(좁은 복도에서 폭이
      // MERGE_RADIUS_PX보다 작으면 자기 자신과 합쳐져 버리는 문제 방지).
      const facingEntry = findOrInsert(facingSnap, 'facing', entrance.kind, entranceEntry)
      pairs.push({ entranceEntry, facingEntry })
    }

    entries.sort((a, b) => a.segmentIndex - b.segmentIndex || a.t - b.t)

    const entryToNode = new Map<LoopEntry, PathNode>()
    const componentNodes: PathNode[] = []
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      const previous = entries[(index - 1 + entries.length) % entries.length]
      const next = entries[(index + 1) % entries.length]
      const [x, y] = entry.point
      const concave =
        entry.kind === 'corner' &&
        (x - previous.point[0]) * (next.point[1] - y) - (y - previous.point[1]) * (next.point[0] - x) < 0
      const node: PathNode = {
        id: `N${String(nodes.length + componentNodes.length + 1).padStart(2, '0')}`,
        x,
        y,
        type: entry.kind,
        concave,
      }
      if (entry.kind === 'facing') node.pairKind = entry.pairKind
      entryToNode.set(entry, node)
      componentNodes.push(node)
    }
    nodes.push(...componentNodes)

    for (let index = 0; index < componentNodes.length; index++) {
      addEdge(componentNodes[index], componentNodes[(index + 1) % componentNodes.length], 'wall')
    }
    for (const { entranceEntry, facingEntry } of pairs) {
      const a = entryToNode.get(entranceEntry)!
      const b = entryToNode.get(facingEntry)!
      if (a.id === b.id) continue
      if (Math.hypot(a.x - b.x, a.y - b.y) <= CROSSING_MAX_PX) addEdge(a, b, 'cross')
    }
  })

  return { nodes, edges }
}
