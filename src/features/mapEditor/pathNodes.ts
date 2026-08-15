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

const FACING_T_MARGIN = 0.02

// point가 진짜로 "마주보고" 있는 벽 segment을 찾는다. 문틀 옆기둥(jamb)처럼 point에 유클리드
// 거리는 가깝지만 투영점이 segment 끝(모서리)에 걸리는 경우는 제외한다 — 그런 모서리를 기준으로
// 법선을 구하면 통로를 가로지르는 방향이 아니라 문틀을 따라가는 방향이 나와, 입구와 맞은편 지점이
// 사실상 같은 문턱 선 위에 찍히는 문제가 생긴다. 투영점이 segment 내부(t가 0과 1 사이)에 오는,
// 즉 그 벽을 수직으로 마주보는 segment만 후보로 삼고 그중 가장 가까운 것을 고른다.
function nearestFacingSegment(
  loop: Point[],
  point: Point,
): { segmentIndex: number; projected: Point; distance: number } | null {
  let best: { segmentIndex: number; projected: Point; distance: number } | null = null
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i]
    const [x2, y2] = loop[(i + 1) % loop.length]
    const dx = x2 - x1
    const dy = y2 - y1
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) continue
    const t = ((point[0] - x1) * dx + (point[1] - y1) * dy) / lengthSquared
    if (t <= FACING_T_MARGIN || t >= 1 - FACING_T_MARGIN) continue
    const projected: Point = [x1 + t * dx, y1 + t * dy]
    const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1])
    if (!best || distance < best.distance) best = { segmentIndex: i, projected, distance }
  }
  return best
}

// simplifiedLoop의 해당 segment 방향(접선)을 구해 90도 회전한 법선을 반환한다.
// 원본(1px 단위) 경계에서 작은 창으로 접선을 구하면 방·복도가 붙어있는 지점의 문턱같은
// 미세한 요철에 걸려 엉뚱한 방향이 나올 수 있다 — 이미 노이즈를 정리한 simplifiedLoop의
// segment를 쓰면 그 지점 벽의 "진짜" 방향에 훨씬 안정적으로 근접한다.
function estimateNormal(simplifiedLoop: Point[], segmentIndex: number): Point {
  const [x1, y1] = simplifiedLoop[segmentIndex]
  const [x2, y2] = simplifiedLoop[(segmentIndex + 1) % simplifiedLoop.length]
  const tangentX = x2 - x1
  const tangentY = y2 - y1
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
const MAX_SNAP_PX = 50
const MERGE_RADIUS_PX = 6
// 축척이 아직 없을 때(호출부에서 crossingMaxPx를 안 넘겼을 때)의 기본값 — 작업 캔버스 폭(~760px) 기준으로 가늠한 값.
const DEFAULT_CROSSING_MAX_PX = 240

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
  crossingMaxPx: number = DEFAULT_CROSSING_MAX_PX,
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

  // 입구 후보를 가장 가까운 컴포넌트에 배정한다(50px 초과 시 버림)
  const assigned: { entrance: EntrancePoint; snap: Point }[][] = components.map(() => [])
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
    assigned[bestComponentIndex].push({ entrance, snap: bestSnap.point })
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

    const pairs: { a: LoopEntry; b: LoopEntry }[] = []
    for (const { entrance, snap } of assigned[componentIndex]) {
      const entranceEntry = findOrInsert(snap, entrance.kind)
      // 문틀 옆기둥 같은 모서리에 snap이 정확히 걸려 있으면(distance=0) 그 모서리에 인접한 아주 짧은
      // segment이 "가장 가까운" 것으로 잡혀 법선이 엉뚱한 방향(통로를 가로지르지 않고 문턱을 따라가는
      // 방향)으로 나올 수 있다 — 먼저 원본 입구 좌표 기준으로 진짜 마주보는 segment을 찾는다.
      // 이때 레이도 모서리(snap)가 아니라 그 segment 위의 실제 투영점에서 쏴야 한다 — 모서리에서
      // 쏘면 방향이 맞아도 모서리와 맞닿은 다른 벽을 따라 미끄러지듯 나아가 결국 같은 문턱 근처에서
      // 멈출 수 있다. 마주보는 segment을 못 찾으면(흔치 않은 경우) 기존 방식대로 모서리에서 쏜다.
      const facingSegment = nearestFacingSegment(simplifiedLoop, [entrance.x, entrance.y])
      const rayStart = facingSegment?.projected ?? snap
      const normal = facingSegment
        ? estimateNormal(simplifiedLoop, facingSegment.segmentIndex)
        : estimateNormal(simplifiedLoop, nearestPointOnLoop(simplifiedLoop, snap).segmentIndex)
      const facingRaw = rayCastToOppositeWall(mask, w, h, rayStart, normal)
      if (!facingRaw) {
        console.warn(`[pathNodes] facing point not found: kind=${entrance.kind} at (${entrance.x}, ${entrance.y})`)
        continue
      }
      const facingSnap = nearestPointOnLoop(rawLoop, facingRaw).point
      // 맞은편 지점이 자기 짝인 입구 노드 자체와 병합되지 않도록 제외한다(좁은 복도에서 폭이
      // MERGE_RADIUS_PX보다 작으면 자기 자신과 합쳐져 버리는 문제 방지).
      const facingEntry = findOrInsert(facingSnap, 'facing', entrance.kind, entranceEntry)
      pairs.push({ a: entranceEntry, b: facingEntry })
    }

    // 코너 노드(오목·볼록 모두)에서도 마주보는 벽 지점을 찾아 건너기 후보로 추가한다.
    // 입구에 이미 병합된 코너는 kind가 'connector'/'landmark'로 바뀌어 있어 여기서 자동 제외된다.
    // 실제 엣지로 남을지는 아래에서 crossingMaxPx로 다시 거른다(넓은 방의 코너는 자연히 걸러짐).
    for (const cornerEntry of entries.filter((entry) => entry.kind === 'corner')) {
      const normal = estimateNormal(simplifiedLoop, cornerEntry.segmentIndex)
      const facingRaw = rayCastToOppositeWall(mask, w, h, cornerEntry.point, normal)
      if (!facingRaw) continue
      const facingSnap = nearestPointOnLoop(rawLoop, facingRaw).point
      const facingEntry = findOrInsert(facingSnap, 'facing', undefined, cornerEntry)
      pairs.push({ a: cornerEntry, b: facingEntry })
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
    for (const { a: entryA, b: entryB } of pairs) {
      const a = entryToNode.get(entryA)!
      const b = entryToNode.get(entryB)!
      if (a.id === b.id) continue
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (distance <= crossingMaxPx) {
        addEdge(a, b, 'cross')
      } else {
        console.warn(
          `[pathNodes] crossing edge skipped (too wide): ${a.id}↔${b.id} distance=${Math.round(distance)}px > ${crossingMaxPx}px`,
        )
      }
    }
  })

  return { nodes, edges }
}
