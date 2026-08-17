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
  // type==='cross'일 때만 의미 있음: true면 a(입구/벽 끝)에서 b(맞은편)로만 건널 수 있다 — 벽을 만지며
  // 걷다가 안전하게 확인 가능한 지점(a)에서 출발하는 것만 안전하다는 전제라, 반대 방향(b에서 a로)은
  // b가 자기 나름의 자격(벽 끝이거나 입구)을 갖추지 않는 한 별도로 허용하지 않는다.
  directed?: boolean
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

// 횡단 후보는 대각선 방향의 벽 각도를 추정하지 않고 상하좌우 4방향만 본다 — 건물 복도가 대부분
// 격자에 맞춰져 있어서, 벽 segment 각도로 법선을 추정하는 방식보다 훨씬 예측 가능하고 안정적이다.
const CARDINAL_DIRECTIONS: Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function isWalkableAt(mask: Uint8Array, w: number, h: number, [x, y]: Point): boolean {
  const cellX = Math.floor(x)
  const cellY = Math.floor(y)
  if (cellX < 0 || cellY < 0 || cellX >= w || cellY >= h) return false
  return mask[cellY * w + cellX] === 1
}

// start에서 dir 방향으로 1px씩 전진하며 통행영역을 벗어나기 직전의 지점을 찾는다.
function castToWall(mask: Uint8Array, w: number, h: number, start: Point, dir: Point): Point | null {
  const maxSteps = Math.max(w, h)
  let x = start[0]
  let y = start[1]
  let last: Point | null = null
  for (let step = 0; step < maxSteps; step++) {
    x += dir[0]
    y += dir[1]
    const cellX = Math.floor(x)
    const cellY = Math.floor(y)
    if (cellX < 0 || cellY < 0 || cellX >= w || cellY >= h) return last
    if (mask[cellY * w + cellX] === 0) return last
    last = [x, y]
  }
  return null
}

// origin에서 dir의 수직 방향(양옆)으로 minClearancePx 이내에 벽이 있는지 본다 — 있으면 이 방향은
// 사실상 "벽을 타고 가면 바로 닿는 좁은 곳"이라, 별도 횡단 안내가 오히려 불필요한 사선/중복 안내다.
function hasWallWithin(mask: Uint8Array, w: number, h: number, origin: Point, dir: Point, maxPx: number): boolean {
  let x = origin[0]
  let y = origin[1]
  for (let step = 1; step <= maxPx; step++) {
    x += dir[0]
    y += dir[1]
    if (!isWalkableAt(mask, w, h, [x, y])) return true
  }
  return false
}

// 경로 전체에서, 옆(수직) 방향 중 "한쪽(왼쪽 또는 오른쪽 고정)"에 벽이 이 비율 이상 계속 붙어있어야
// "그냥 그 벽을 타고 쭉 가면 닿는 곳"으로 본다 — 100%로 두면 문틀·짧은 기둥처럼 아주 잠깐 스치는
// 지점 하나 때문에 정상적인 횡단(예: ELV 근처의 넓은 교차로 횡단)까지 통째로 걸러진다(실제 발견된
// 문제). 나머지 일부 구간에서만 좁아지는 정도는 "계속 같은 벽을 타고 걸을 수 있는 길"이 아니라고
// 보고 허용한다.
const HUG_RATIO_THRESHOLD = 0.85

// origin에서 dir 방향으로 hit까지 가는 경로 전체를 따라, 왼쪽 또는 오른쪽 중 한쪽에 벽이
// minClearancePx 이내로 거의 내내(HUG_RATIO_THRESHOLD 이상) 붙어있으면 true — "복도를 따라 쭉
// 걸어가면 닿는 곳"인지 판단한다. origin(코너) 지점 하나만 보면 안 된다: 코너가 넓은 홀과 좁은 복도의
// 경계에 걸쳐 있으면 코너 자체는 옆이 넓어 보이지만, 한 걸음만 복도 쪽으로 들어가도 바로 좁아지는
// 경우를 놓친다(실제로 발견된 버그 — 복도 전체 길이만큼을 "횡단"으로 잘못 안내하게 됨).
function hugsWallAlongPath(
  mask: Uint8Array,
  w: number,
  h: number,
  origin: Point,
  dir: Point,
  hit: Point,
  minClearancePx: number,
): boolean {
  const length = Math.round(Math.hypot(hit[0] - origin[0], hit[1] - origin[1]))
  const perpendicular: Point[] = dir[0] !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]
  const totalSamples = length + 1
  return perpendicular.some((perpDir) => {
    let narrowCount = 0
    for (let step = 0; step <= length; step++) {
      const sample: Point = [origin[0] + dir[0] * step, origin[1] + dir[1] * step]
      if (hasWallWithin(mask, w, h, sample, perpDir, minClearancePx)) narrowCount++
    }
    return narrowCount / totalSamples >= HUG_RATIO_THRESHOLD
  })
}

// point에서 상하좌우로 벽까지 쏴서, 횡단 가능 최대 거리 이내에 벽이 있는 방향마다 맞은편 지점을 반환한다.
// 방향마다 독립적으로 판단하므로 한 점에서 여러 방향으로 횡단 엣지가 생길 수 있다(예: 교차로,
// 또는 입구가 폭이 아닌 길이 방향으로도 열린 복도 위에 있는 경우). minClearancePx를 넘기면, 그
// 방향으로 가는 경로 전체에서 거의 내내(HUG_RATIO_THRESHOLD 이상) 옆(수직 방향)에 벽이 그 거리
// 이내로 붙어있는 경우는 제외한다 — "그냥 벽을 타면 바로 닿는 곳"이라 별도 횡단 안내가 불필요하다.
function cardinalFacingPoints(
  mask: Uint8Array,
  w: number,
  h: number,
  point: Point,
  crossingMaxPx: number,
  minClearancePx?: number,
): Point[] {
  const results: Point[] = []
  for (const dir of CARDINAL_DIRECTIONS) {
    const hit = castToWall(mask, w, h, point, dir)
    if (!hit) continue
    const distance = Math.hypot(hit[0] - point[0], hit[1] - point[1])
    if (distance > crossingMaxPx) continue
    if (minClearancePx !== undefined && hugsWallAlongPath(mask, w, h, point, dir, hit, minClearancePx)) continue
    results.push(hit)
  }
  return results
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
// 코너 횡단의 좌우 최소 여유 거리 기본값(약 0.3m 상당) — DEFAULT_CROSSING_MAX_PX와 같은 20px/m 비율로 환산.
const DEFAULT_MIN_CLEARANCE_PX = 6
// 코너 하나에서 여러 방향이 동시에 유효할 때, 가장 짧은 방향의 이 배수 이내인 것들은 "비슷한 길이"로
// 보고 전부 유지한다(1개만 남기면 실제로 둘 다 필요한 경우까지 사라짐).
const SIMILAR_LENGTH_RATIO = 1.5

interface LoopEntry {
  point: Point
  kind: NodeKind
  pairKind?: 'connector' | 'landmark'
  segmentIndex: number
  t: number
  distanceToLoop: number // point가 simplifiedLoop 경계선에서 얼마나 떨어져 있는지 — 벽선 트레이싱에 끼워도 되는지 판단용
  concave?: boolean // kind === 'corner'일 때만 의미 있음 — simplifiedLoop 원래 이웃 기준으로 미리 계산해둔다
}

export function generatePathNodes(
  mask: Uint8Array,
  w: number,
  h: number,
  entrances: EntrancePoint[] = [],
  crossingMaxPx: number = DEFAULT_CROSSING_MAX_PX,
  minClearancePx: number = DEFAULT_MIN_CLEARANCE_PX,
): { nodes: PathNode[]; edges: PathEdge[] } {
  const nodes: PathNode[] = []
  const edges: PathEdge[] = []
  const edgeKeys = new Set<string>()

  function addEdge(a: PathNode, b: PathNode, type: EdgeKind) {
    if (a.id === b.id) return
    const key = `${type}:${a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ a: a.id, b: b.id, type, directed: type === 'cross' ? true : undefined })
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

  components.forEach(({ simplifiedLoop }, componentIndex) => {
    const loopLength = simplifiedLoop.length
    const entries: LoopEntry[] = simplifiedLoop.map(([x, y], index) => {
      const [px, py] = simplifiedLoop[(index - 1 + loopLength) % loopLength]
      const [nx, ny] = simplifiedLoop[(index + 1) % loopLength]
      const concave = (x - px) * (ny - y) - (y - py) * (nx - x) < 0
      return { point: [x, y], kind: 'corner', segmentIndex: index, t: 0, distanceToLoop: 0, concave }
    })

    // axisLock: 'facing' 지점을 넣을 때, 상하좌우 캐스팅 결과가 반드시 지켜야 하는 축 좌표. 지정되면
    // 그 축이 다른 기존 노드에는 (거리가 가까워도) 절대 병합하지 않는다 — 안 그러면 다른 방향에서
    // 찾아낸, 축이 다른 노드에 흡수되면서 건너기 엣지가 사선이 되거나(안전장치에 걸려 통째로 버려짐)
    // 아예 안 생기는 원인이 된다.
    // keepSeparateFromEntrances: 입구(목적지/연결자) 자기 자신을 넣을 때만 true로 준다 — 서로 다른 두
    // 목적지가 우연히 MERGE_RADIUS_PX 이내로 가깝게 찍혀 있어도 하나로 합쳐져 버리면(예: 문 하나에 표시가
    // 2개) 둘 중 하나가 통째로 사라져 버린다. entrance는 각자 자기 노드를 반드시 가져야 하므로, 이미
    // connector/landmark인 기존 노드에는 절대 병합하지 않는다(코너/맞은편에는 그대로 병합·흡수 가능).
    // exclude: 병합에서 제외할 기존 노드(들) — 같은 출발점(origin)에서 이번에 상하좌우로 쏴서 이미
    // 찾은 다른 방향의 맞은편 노드들도 함께 넘겨야 한다. 안 그러면 복도 폭이 MERGE_RADIUS_PX보다 좁을
    // 때 위쪽 맞은편과 아래쪽 맞은편이 서로 가깝다는 이유만으로 하나로 합쳐져 버려서(위/아래는 애초에
    // 서로 다른 벽이라 절대 같은 지점일 수 없는데도) 건너기 화살표 하나가 통째로 사라지는 원인이 된다.
    function findOrInsert(
      point: Point,
      kind: NodeKind,
      pairKind?: 'connector' | 'landmark',
      exclude?: LoopEntry | LoopEntry[],
      axisLock?: { axis: 0 | 1; value: number },
      keepSeparateFromEntrances?: boolean,
    ): LoopEntry {
      const excludeList = exclude ? (Array.isArray(exclude) ? exclude : [exclude]) : []
      const existing = entries.find(
        (entry) =>
          !excludeList.includes(entry) &&
          !(keepSeparateFromEntrances && (entry.kind === 'connector' || entry.kind === 'landmark')) &&
          Math.hypot(entry.point[0] - point[0], entry.point[1] - point[1]) <= MERGE_RADIUS_PX &&
          (!axisLock || entry.point[axisLock.axis] === axisLock.value),
      )
      if (existing) {
        if (kindPriority(kind) > kindPriority(existing.kind)) {
          existing.kind = kind
          existing.pairKind = pairKind
        } else if (kind === 'facing' && existing.kind === 'facing' && pairKind === undefined) {
          // 코너의 맞은편 탐색(pairKind 없음)이 이미 어떤 입구의 맞은편으로 만들어져 있던 지점(같은
          // 위치, pairKind 있음)과 우연히 겹친 경우 — 이제 이 지점은 코너의 맞은편이기도 하므로 특정
          // 입구 하나의 색으로 칠할 수 없다. pairKind를 지워 코너 맞은편(보라색)으로 표시되게 한다
          // (실제 발견된 문제 — 코너 맞은편인데 엉뚱하게 입구 색으로 표시됨).
          existing.pairKind = undefined
        }
        return existing
      }
      const nearest = nearestPointOnLoop(simplifiedLoop, point)
      const entry: LoopEntry = {
        point,
        kind,
        pairKind,
        segmentIndex: nearest.segmentIndex,
        t: nearest.t,
        distanceToLoop: nearest.distance,
      }
      entries.push(entry)
      return entry
    }

    const pairs: { a: LoopEntry; b: LoopEntry }[] = []
    for (const { entrance, snap } of assigned[componentIndex]) {
      // 입구 원래 좌표가 통행영역 위에 있으면 거기서 그대로 쏴야, 방 안쪽에서 문을 통해 진짜 반대편
      // 벽까지 가로지르는 케이스를 놓치지 않는다. 반대로 원래 좌표가 통행 불가 지점(마스크에 안 칠해진
      // 방 등)이면, castToWall이 첫 걸음부터 실패해 4방향 다 못 찾는다 — 이때는 경계에 스냅된 지점(snap,
      // 항상 통행영역 위)에서 쏴야 맞은편을 찾을 수 있다. 노드 위치(entranceEntry)도 반드시 이거랑
      // 똑같은 값을 써야 한다 — 노드는 snap에, 맞은편 탐색은 raw에 각각 따로 기준을 두면 둘이 어긋나서
      // 건너기 엣지가 사선으로 그려지는 원인이 된다(실제로 발견된 버그).
      const facingOrigin: Point = isWalkableAt(mask, w, h, [entrance.x, entrance.y]) ? [entrance.x, entrance.y] : snap
      const entranceEntry = findOrInsert(facingOrigin, entrance.kind, undefined, undefined, undefined, true)
      // 코너처럼 minClearancePx(허깅 필터)를 같이 넘긴다 — 입구가 일직선 복도 위에 있으면 위/아래
      // (진짜 복도 폭 횡단)뿐 아니라 좌/우(복도를 따라 쭉 나가는 방향, 사실상 벽을 타면 바로 닿는
      // 곳)까지 전부 유효한 후보로 잡혀서 같은 벽에 불필요하게 여러 방향의 화살표가 생기는 문제가
      // 있었다(실제 발견된 문제). 예전엔 이 필터가 문틀 건너기까지 걸러내서 입구에는 아예 안 썼지만,
      // 지금은 경로 전체를 따라(원점 한 점이 아니라) 판단하고 대부분 좁아야만(HUG_RATIO_THRESHOLD)
      // 걸러내므로 문틀처럼 문 옆에 벽이 바짝 붙은 정상적인 케이스는 걸리지 않는다.
      const facingPoints = cardinalFacingPoints(mask, w, h, facingOrigin, crossingMaxPx, minClearancePx)
      if (facingPoints.length === 0) {
        console.warn(`[pathNodes] facing point not found: kind=${entrance.kind} at (${entrance.x}, ${entrance.y})`)
      }
      const facingEntriesSoFar: LoopEntry[] = []
      for (const facingRaw of facingPoints) {
        // facingRaw는 이미 origin에서 정확히 상하좌우로만 쏴서 찾은 지점이라 origin과 x 또는 y가
        // 정확히 같다. 예전엔 이걸 경계 폴리라인(rawLoop) 위의 "가장 가까운 점"으로 다시 스냅했는데,
        // 그 투영이 축에서 살짝 벗어나면서 화살표가 사선으로 보이던 원인이었다 — 원본 그대로 쓴다.
        // 맞은편 지점이 자기 짝인 입구 노드 자체와, 그리고 같은 입구에서 이미 찾은 다른 방향의
        // 맞은편들과도 병합되지 않도록 제외한다(좁은 복도에서 위/아래 맞은편이 서로 가까워도 둘 다
        // 살아남아야 한다 — 실제로 발견된 버그).
        const axisLock: { axis: 0 | 1; value: number } =
          facingRaw[0] === facingOrigin[0] ? { axis: 0, value: facingRaw[0] } : { axis: 1, value: facingRaw[1] }
        const facingEntry = findOrInsert(facingRaw, 'facing', entrance.kind, [entranceEntry, ...facingEntriesSoFar], axisLock)
        facingEntriesSoFar.push(facingEntry)
        pairs.push({ a: entranceEntry, b: facingEntry })
      }
    }

    // 코너 노드 중 벽 끝(concave)에서만 상하좌우로 마주보는 벽 지점을 찾아 건너기 후보로 추가한다 —
    // 벽이 안쪽으로 끝나는 지점(예: 칸막이 끝)은 실제로 손으로 더듬어 찾을 수 있는 안전한 건너기
    // 시작점이지만, 벽이 계속 이어지는 볼록 코너는 그냥 복도가 꺾이는 지점일 뿐이라 건너기 시작점으로
    // 안전하지 않다 — 여기서 건너기가 생기면 실제로는 벽을 만지는 중인데 갑자기 건너라고 안내하게 된다.
    // 입구에 이미 병합된 코너는 kind가 'connector'/'landmark'로 바뀌어 있어 여기서 자동 제외된다.
    // 코너 하나당 건너기는 "가장 가까운 맞은편과 비슷한 길이"인 방향만 남긴다 — 한 코너에서 상하좌우
    // 여러 방향이 동시에 유효하면 예전엔 전부 만들었지만, 복잡한 벽 모양(계단식 요철 등)에서 인접한
    // 코너마다 각자 여러 방향으로 건너기를 만들면서 한 지점에 화살표가 무더기로 몰리는 문제가 있었다
    // (실제 발견된 문제). 그렇다고 가장 짧은 것 딱 하나만 남기면, 길이가 비슷해서 둘 다 실제로 필요한
    // 경우(예: 교차로에서 두 방향 다 비슷하게 짧은 진짜 복도 폭 횡단)까지 하나가 사라진다(이 역시 실제
    // 발견된 문제) — 가장 짧은 길이의 SIMILAR_LENGTH_RATIO배 이내인 방향은 전부 유지한다.
    for (const cornerEntry of entries.filter((entry) => entry.kind === 'corner' && entry.concave)) {
      const facingPoints = cardinalFacingPoints(mask, w, h, cornerEntry.point, crossingMaxPx, minClearancePx)
      if (facingPoints.length === 0) continue
      const distances = facingPoints.map((p) => Math.hypot(p[0] - cornerEntry.point[0], p[1] - cornerEntry.point[1]))
      const minDistance = Math.min(...distances)
      const keptFacingPoints = facingPoints.filter((_, i) => distances[i] <= minDistance * SIMILAR_LENGTH_RATIO)
      const facingEntriesSoFar: LoopEntry[] = []
      for (const facingRaw of keptFacingPoints) {
        // facingRaw는 cornerEntry.point에서 정확히 상하좌우로만 쏴서 찾은 지점 그대로 쓴다(위 입구
        // 쪽과 같은 이유 — rawLoop에 재투영하면 축에서 벗어나 사선으로 보일 수 있다). 같은 코너에서
        // 이미 남긴 다른 방향의 맞은편들과도 병합되지 않도록 제외한다(위 입구 쪽과 같은 이유).
        const axisLock: { axis: 0 | 1; value: number } =
          facingRaw[0] === cornerEntry.point[0] ? { axis: 0, value: facingRaw[0] } : { axis: 1, value: facingRaw[1] }
        const facingEntry = findOrInsert(facingRaw, 'facing', undefined, [cornerEntry, ...facingEntriesSoFar], axisLock)
        facingEntriesSoFar.push(facingEntry)
        pairs.push({ a: cornerEntry, b: facingEntry })
      }
    }

    entries.sort((a, b) => a.segmentIndex - b.segmentIndex || a.t - b.t)

    const entryToNode = new Map<LoopEntry, PathNode>()
    const componentNodes: PathNode[] = []
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      const [x, y] = entry.point
      // concave는 원래 simplifiedLoop 이웃 기준으로 미리 계산해둔 값을 그대로 쓴다 — 입구/맞은편
      // 삽입으로 정렬 순서상 이웃이 바뀌어도, 이 지점이 실제 벽 모양상 벽 끝인지는 바뀌지 않는다.
      const concave = entry.kind === 'corner' && !!entry.concave
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

    // 벽선(폴리곤) 트레이싱은 실제로 경계 위(또는 아주 가까이)에 있는 점들끼리만 정렬 순서대로 이어야
    // 한다 — 목적지/연결자처럼 방 안쪽 깊숙이 찍힌 점이 segmentIndex/t 정렬 순서상 중간에 끼어들면,
    // 그 점의 실제 좌표(원래 찍힌 위치 그대로 씀)와 이웃 사이를 잇는 선이 방을 대각선으로 가로질러
    // 버린다(실제로 발견된 버그). 경계에서 먼 점은 메인 루프에서 빼고, 대신 가장 가까운 경계 점 하나
    // 에만 짧게 연결한다 — 문에서 방 안쪽 목적지까지 걸어 들어가는 구간으로 보면 된다.
    const onLoopIndices = entries.map((entry, index) => (entry.distanceToLoop <= MERGE_RADIUS_PX ? index : -1)).filter((i) => i !== -1)
    for (let i = 0; i < onLoopIndices.length; i++) {
      const a = componentNodes[onLoopIndices[i]]
      const b = componentNodes[onLoopIndices[(i + 1) % onLoopIndices.length]]
      addEdge(a, b, 'wall')
    }
    for (let index = 0; index < entries.length; index++) {
      if (entries[index].distanceToLoop <= MERGE_RADIUS_PX) continue
      const point = entries[index].point
      let nearestIndex = -1
      let nearestDistance = Infinity
      for (const candidateIndex of onLoopIndices) {
        const candidate = entries[candidateIndex].point
        const d = Math.hypot(candidate[0] - point[0], candidate[1] - point[1])
        if (d < nearestDistance) {
          nearestDistance = d
          nearestIndex = candidateIndex
        }
      }
      if (nearestIndex !== -1) addEdge(componentNodes[index], componentNodes[nearestIndex], 'wall')
    }
    for (const { a: entryA, b: entryB } of pairs) {
      const a = entryToNode.get(entryA)!
      const b = entryToNode.get(entryB)!
      if (a.id === b.id) continue
      // 건너기는 반드시 좌우 또는 상하로만 — 절대 사선 금지. 맞은편 지점은 origin에서 정확히 상하좌우로
      // 쏴서 찾은 값이라 원래는 축이 맞지만, findOrInsert가 이미 있는 다른 노드(다른 방향에서 찾아낸
      // 맞은편이나 근처 코너)에 6px 이내로 병합해버리면 그 기존 노드 위치가 이 축과 안 맞을 수 있다 —
      // 이런 경우를 최종적으로 걸러내는 안전장치.
      if (a.x !== b.x && a.y !== b.y) {
        console.warn(`[pathNodes] crossing edge skipped (not axis-aligned): ${a.id}(${a.x},${a.y})↔${b.id}(${b.x},${b.y})`)
        continue
      }
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
