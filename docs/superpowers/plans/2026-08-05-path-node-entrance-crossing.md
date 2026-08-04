# 경로노드 — 입구·맞은편·횡단 엣지 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지도 검수 화면의 "경로 노드 설치" 기능에 정책 5.3의 나머지 요구사항 — 연결자 입구·랜드마크
출입구·그 맞은편 지점 노드, 그리고 짧은 복도에서의 횡단(cross) 엣지 — 를 추가한다.

**Architecture:** `pathNodes.ts`의 기존 벽 경계 추적/단순화/코너 분류 로직은 그대로 두고, 그 결과인
"단순화된 코너 루프"에 입구 후보(연결자 비콘·랜드마크)를 스냅·삽입하는 단계를 덧붙인다. 각 입구에서
법선 방향으로 광선을 쏴 맞은편 벽을 찾아 같은 방식으로 삽입하고, 둘 사이 거리가 짧으면 별도의
`cross` 타입 엣지로 연결한다. `MapReviewPage.tsx`는 이미 있는 비콘/랜드마크 조회 훅으로 입구 후보
좌표를 모아 새 로직에 넘기고, 결과를 캔버스에 색상으로 구분해 그린다.

**Tech Stack:** React 19 + TypeScript, `<canvas>` 2D context, Vite. 자동 테스트 프레임워크 없음 —
`tsc`/`npm run build` + 스크래치 검증 스크립트(`node`) + 브라우저 수동 검증으로 확인.

## Global Constraints

- 참조 스펙: [2026-08-05-path-node-entrance-crossing-design.md](../specs/2026-08-05-path-node-entrance-crossing-design.md)
- 축척(m/px) 없음 — 모든 거리·임계값은 캔버스 픽셀 기준
- 노드/엣지 서버 저장(영속화) 없음 — 여전히 클릭 시 재계산되는 미리보기
- 새 상수는 모두 `src/features/mapEditor/pathNodes.ts` 상단에 고정값으로 선언: `MAX_SNAP_PX = 30`,
  `MERGE_RADIUS_PX = 6`, `TANGENT_WINDOW = 6`, `CROSSING_MAX_PX = 100` (기존 `MIN_COMPONENT_PIXELS = 25`,
  `SIMPLIFY_EPSILON_PX = 3`는 변경하지 않음). UI 슬라이더는 추가하지 않는다.
- `cross` 엣지는 **입구 노드 ↔ 그 입구의 맞은편(facing) 노드 쌍**에만 생성한다. 일반 `corner` 노드
  끼리 거리가 가깝다는 이유로 생성하지 않는다.
- 스냅(30px)·맞은편 탐색 실패는 화면 에러 없이 해당 후보만 건너뛰되, `console.warn`으로 남긴다.
- 기존 `corner`/`wall` 생성 로직(라벨링 → 경계 추적 → Douglas-Peucker 단순화 → convex/concave
  분류 → 루프 엣지)은 최대한 그대로 유지하고, 추가하는 방식으로 구현한다.
- 이 환경(Bash 도구)에서는 `node`/`npm`이 기본 PATH에 없다. 모든 실행 명령 앞에
  `export PATH="/c/Program Files/nodejs:$PATH" &&` 를 붙여서 실행한다.
- `tsconfig.app.json`에 `noUnusedLocals`/`noUnusedParameters`가 켜져 있으므로, 각 태스크가 끝난
  시점에 미사용 함수/변수가 남지 않아야 한다.

---

### Task 1: `pathNodes.ts` — 입구·맞은편·횡단 엣지 로직

**Files:**
- Modify: `src/features/mapEditor/pathNodes.ts` (전체 재작성 — 기존 `labelComponents`,
  `traceBoundary`, `perpendicularDistance`, `simplifyOpen`, `simplify`는 내용 변경 없이 그대로 두고,
  새 헬퍼와 `generatePathNodes` 재작성만 추가/교체한다)
- Create (임시, 커밋 안 함): 스크래치 폴더의 `verify_pathnodes_entrance.mjs`

**Interfaces:**
- Produces:
  - `export type NodeKind = 'corner' | 'connector' | 'landmark' | 'facing'`
  - `export type EdgeKind = 'wall' | 'cross'`
  - `export interface PathNode { id: string; x: number; y: number; type: NodeKind; concave: boolean; pairKind?: 'connector' | 'landmark' }`
  - `export interface PathEdge { a: string; b: string; type: EdgeKind }`
  - `export interface EntrancePoint { x: number; y: number; kind: 'connector' | 'landmark' }`
  - `export function generatePathNodes(mask: Uint8Array, w: number, h: number, entrances: EntrancePoint[] = []): { nodes: PathNode[]; edges: PathEdge[] }`
  - Task 2/3이 `EntrancePoint`, `PathNode.type`, `PathNode.pairKind`, `PathEdge.type`를 그대로
    소비한다.

- [ ] **Step 1: 스크래치 검증 스크립트 작성**

임시 폴더(저장소 밖 권장)에 `verify_pathnodes_entrance.mjs`를 생성한다:

```js
// --- 기존 코너 로직 (변경 없음, pathNodes.ts와 동일) ---
function labelComponents(mask, w, h) {
  const labels = new Int32Array(w * h).fill(-1)
  const comps = []
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index] || labels[index] !== -1) continue
    const componentId = comps.length
    const stack = [index]
    let count = 0
    labels[index] = componentId
    while (stack.length) {
      const current = stack.pop()
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

function traceBoundary(mask, w, h, labels, componentId) {
  const isForeground = (x, y) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1 && labels[y * w + x] === componentId
  const segments = new Map()
  const addSegment = (from, to) => segments.set(from.join(','), { from, to })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isForeground(x, y)) continue
      if (!isForeground(x, y - 1)) addSegment([x, y], [x + 1, y])
      if (!isForeground(x + 1, y)) addSegment([x + 1, y], [x + 1, y + 1])
      if (!isForeground(x, y + 1)) addSegment([x + 1, y + 1], [x, y + 1])
      if (!isForeground(x - 1, y)) addSegment([x, y + 1], [x, y])
    }
  }
  const loops = []
  while (segments.size) {
    const first = segments.values().next().value
    const loop = [first.from]
    let segment = first
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

function perpendicularDistance([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(x - x1, y - y1)
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

function simplifyOpen(points, epsilon) {
  if (points.length < 3) return points
  let maxDistance = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], points[0], points.at(-1))
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }
  if (maxDistance <= epsilon) return [points[0], points.at(-1)]
  return [...simplifyOpen(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplifyOpen(points.slice(index), epsilon)]
}

function simplify(points, epsilon) {
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

// --- 신규 헬퍼 ---
function nearestPointOnLoop(loop, point) {
  let best = { point: loop[0], segmentIndex: 0, t: 0, distance: Infinity }
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i]
    const [x2, y2] = loop[(i + 1) % loop.length]
    const dx = x2 - x1
    const dy = y2 - y1
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - x1) * dx + (point[1] - y1) * dy) / lengthSquared))
    const projected = [x1 + t * dx, y1 + t * dy]
    const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1])
    if (distance < best.distance) best = { point: projected, segmentIndex: i, t, distance }
  }
  return best
}

const TANGENT_WINDOW = 6

function estimateNormal(rawLoop, segmentIndex) {
  const n = rawLoop.length
  const before = rawLoop[(segmentIndex - TANGENT_WINDOW + n) % n]
  const after = rawLoop[(segmentIndex + 1 + TANGENT_WINDOW) % n]
  const tangentX = after[0] - before[0]
  const tangentY = after[1] - before[1]
  const length = Math.hypot(tangentX, tangentY)
  if (length === 0) return [0, 0]
  return [-tangentY / length, tangentX / length]
}

function rayCastToOppositeWall(mask, w, h, start, normal) {
  if (normal[0] === 0 && normal[1] === 0) return null
  const maxSteps = Math.max(w, h)
  function march(dirX, dirY) {
    let x = start[0]
    let y = start[1]
    let last = null
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

function kindPriority(kind) {
  if (kind === 'connector' || kind === 'landmark') return 2
  if (kind === 'facing') return 1
  return 0
}

const MIN_COMPONENT_PIXELS = 25
const SIMPLIFY_EPSILON_PX = 3
const MAX_SNAP_PX = 30
const MERGE_RADIUS_PX = 6
const CROSSING_MAX_PX = 100

function generatePathNodes(mask, w, h, entrances = []) {
  const nodes = []
  const edges = []
  const edgeKeys = new Set()
  function addEdge(a, b, type) {
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

  const assigned = components.map(() => [])
  for (const entrance of entrances) {
    let bestComponentIndex = -1
    let bestSnap = null
    components.forEach((component, index) => {
      const snap = nearestPointOnLoop(component.rawLoop, [entrance.x, entrance.y])
      if (!bestSnap || snap.distance < bestSnap.distance) {
        bestSnap = snap
        bestComponentIndex = index
      }
    })
    if (!bestSnap || bestSnap.distance > MAX_SNAP_PX) {
      console.warn(`[pathNodes] entrance snap skipped (too far): kind=${entrance.kind} at (${entrance.x}, ${entrance.y})`)
      continue
    }
    assigned[bestComponentIndex].push({ entrance, snap: bestSnap.point, rawSegmentIndex: bestSnap.segmentIndex })
  }

  components.forEach(({ rawLoop, simplifiedLoop }, componentIndex) => {
    const entries = simplifiedLoop.map((point, index) => ({ point, kind: 'corner', segmentIndex: index, t: 0 }))

    function findOrInsert(point, kind, pairKind) {
      const existing = entries.find((entry) => Math.hypot(entry.point[0] - point[0], entry.point[1] - point[1]) <= MERGE_RADIUS_PX)
      if (existing) {
        if (kindPriority(kind) > kindPriority(existing.kind)) {
          existing.kind = kind
          existing.pairKind = pairKind
        }
        return existing
      }
      const nearest = nearestPointOnLoop(simplifiedLoop, point)
      const entry = { point, kind, pairKind, segmentIndex: nearest.segmentIndex, t: nearest.t }
      entries.push(entry)
      return entry
    }

    const pairs = []
    for (const { entrance, snap, rawSegmentIndex } of assigned[componentIndex]) {
      const entranceEntry = findOrInsert(snap, entrance.kind)
      const normal = estimateNormal(rawLoop, rawSegmentIndex)
      const facingRaw = rayCastToOppositeWall(mask, w, h, snap, normal)
      if (!facingRaw) {
        console.warn(`[pathNodes] facing point not found: kind=${entrance.kind} at (${entrance.x}, ${entrance.y})`)
        continue
      }
      const facingSnap = nearestPointOnLoop(rawLoop, facingRaw).point
      const facingEntry = findOrInsert(facingSnap, 'facing', entrance.kind)
      pairs.push({ entranceEntry, facingEntry })
    }

    entries.sort((a, b) => a.segmentIndex - b.segmentIndex || a.t - b.t)

    const entryToNode = new Map()
    const componentNodes = []
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      const previous = entries[(index - 1 + entries.length) % entries.length]
      const next = entries[(index + 1) % entries.length]
      const [x, y] = entry.point
      const concave =
        entry.kind === 'corner' &&
        (x - previous.point[0]) * (next.point[1] - y) - (y - previous.point[1]) * (next.point[0] - x) < 0
      const node = { id: `N${String(nodes.length + componentNodes.length + 1).padStart(2, '0')}`, x, y, type: entry.kind, concave }
      if (entry.kind === 'facing') node.pairKind = entry.pairKind
      entryToNode.set(entry, node)
      componentNodes.push(node)
    }
    nodes.push(...componentNodes)

    for (let index = 0; index < componentNodes.length; index++) {
      addEdge(componentNodes[index], componentNodes[(index + 1) % componentNodes.length], 'wall')
    }
    for (const { entranceEntry, facingEntry } of pairs) {
      const a = entryToNode.get(entranceEntry)
      const b = entryToNode.get(facingEntry)
      if (a.id === b.id) continue
      if (Math.hypot(a.x - b.x, a.y - b.y) <= CROSSING_MAX_PX) addEdge(a, b, 'cross')
    }
  })

  return { nodes, edges }
}

// ============ 회귀 테스트 (기존 코너 로직 그대로 동작하는지) ============

// L-shape: 오목 꼭짓점 정확히 1개, entrances=[] 이면 cross 엣지가 전혀 없어야 함
{
  const w = 14, h = 14
  const mask = new Uint8Array(w * h).fill(1)
  for (let y = 0; y < 6; y++) for (let x = 8; x < 14; x++) mask[y * w + x] = 0
  const { nodes, edges } = generatePathNodes(mask, w, h)
  const concaveCount = nodes.filter((n) => n.concave).length
  const crossCount = edges.filter((e) => e.type === 'cross').length
  console.log('L-shape nodes=%d edges=%d concave=%d cross=%d', nodes.length, edges.length, concaveCount, crossCount)
  if (concaveCount !== 1) throw new Error('expected exactly 1 concave vertex for an L-shape')
  if (crossCount !== 0) throw new Error('expected zero cross edges when there are no entrances')
  if (!edges.every((e) => e.type === 'wall')) throw new Error('expected only wall edges when there are no entrances')
}

// 분리된 두 영역은 서로 연결되지 않음
{
  const w = 20, h = 10
  const mask = new Uint8Array(w * h).fill(0)
  for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) mask[y * w + x] = 1
  for (let y = 1; y < 8; y++) for (let x = 12; x < 19; x++) mask[y * w + x] = 1
  const { nodes, edges } = generatePathNodes(mask, w, h)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const crossing = edges.filter((e) => (byId.get(e.a).x < 10) !== (byId.get(e.b).x < 10))
  console.log('two-blobs nodes=%d edges=%d crossing=%d', nodes.length, edges.length, crossing.length)
  if (crossing.length !== 0) throw new Error('expected zero edges connecting the two separate blobs')
}

// 25px 미만 speck은 무시
{
  const w = 10, h = 10
  const mask = new Uint8Array(w * h).fill(0)
  mask[5 * w + 5] = 1; mask[5 * w + 6] = 1; mask[6 * w + 5] = 1
  const { nodes, edges } = generatePathNodes(mask, w, h)
  console.log('speck nodes=%d edges=%d', nodes.length, edges.length)
  if (nodes.length !== 0 || edges.length !== 0) throw new Error('expected the speck to be dropped')
}

// ============ 신규 기능 테스트 ============

// 좁은 복도(폭 5px, < CROSSING_MAX_PX) 양쪽 벽에 입구 하나씩 두면 맞은편을 찾고 cross 엣지가 생김
{
  const w = 30, h = 10
  const mask = new Uint8Array(w * h).fill(0)
  for (let y = 2; y < 7; y++) for (let x = 0; x < 30; x++) mask[y * w + x] = 1
  const entrances = [{ x: 15, y: 2, kind: 'connector' }]
  const { nodes, edges } = generatePathNodes(mask, w, h, entrances)
  const connectorNode = nodes.find((n) => n.type === 'connector')
  const facingNode = nodes.find((n) => n.type === 'facing')
  const crossEdges = edges.filter((e) => e.type === 'cross')
  console.log(
    'narrow-corridor connector=%o facing=%o cross=%d',
    connectorNode && [connectorNode.x, connectorNode.y],
    facingNode && [facingNode.x, facingNode.y],
    crossEdges.length,
  )
  if (!connectorNode) throw new Error('expected a connector node')
  if (!facingNode) throw new Error('expected a facing node on the opposite wall')
  if (facingNode.pairKind !== 'connector') throw new Error('expected facing node pairKind to be connector')
  if (crossEdges.length !== 1) throw new Error('expected exactly 1 cross edge for the narrow corridor pair')
  const width = Math.hypot(connectorNode.x - facingNode.x, connectorNode.y - facingNode.y)
  if (width < 3 || width > 8) throw new Error(`expected facing distance close to corridor width(~5), got ${width}`)
}

// 넓은 홀(한 변 250px, > CROSSING_MAX_PX)에서는 맞은편은 찾아도 cross 엣지는 생기지 않음
{
  const w = 250, h = 250
  const mask = new Uint8Array(w * h).fill(1)
  const entrances = [{ x: 125, y: 0, kind: 'landmark' }]
  const { edges, nodes } = generatePathNodes(mask, w, h, entrances)
  const crossEdges = edges.filter((e) => e.type === 'cross')
  const landmarkNode = nodes.find((n) => n.type === 'landmark')
  console.log('wide-hall cross=%d landmark=%o', crossEdges.length, landmarkNode && [landmarkNode.x, landmarkNode.y])
  if (!landmarkNode) throw new Error('expected a landmark node even in a wide hall')
  if (crossEdges.length !== 0) throw new Error('expected zero cross edges when facing distance exceeds CROSSING_MAX_PX')
}

// 경계에서 30px 넘게 떨어진 입구 후보는 무시됨
{
  const w = 30, h = 120
  const mask = new Uint8Array(w * h).fill(0)
  for (let y = 2; y < 7; y++) for (let x = 0; x < 30; x++) mask[y * w + x] = 1
  const entrances = [{ x: 15, y: 100, kind: 'connector' }] // 복도(y:2~7)에서 90px 이상 떨어짐
  const { nodes } = generatePathNodes(mask, w, h, entrances)
  const connectorNode = nodes.find((n) => n.type === 'connector')
  console.log('far-entrance connectorNodeFound=%s', !!connectorNode)
  if (connectorNode) throw new Error('expected the far entrance to be skipped (no connector node)')
}

console.log('all checks passed')
```

- [ ] **Step 2: 스크래치 스크립트 실행 — 통과 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && node verify_pathnodes_entrance.mjs`
Expected output ends with:
```
all checks passed
```
(에러가 나면 어떤 단언문이 실패했는지 메시지를 보고 위 로직을 수정 — 특히 `narrow-corridor`
케이스의 `facing distance` 범위는 복도 폭(5px) 근처인지, `wide-hall` 케이스에서 `cross=0`인지가
핵심이다.)

- [ ] **Step 3: 검증된 로직을 `src/features/mapEditor/pathNodes.ts`에 반영**

파일 맨 위 인터페이스 블록을 다음으로 교체한다:

```ts
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
```

`labelComponents`, `traceBoundary`, `perpendicularDistance`, `simplifyOpen`, `simplify` 함수는
기존 파일 그대로 둔다(수정 없음). 그 아래(기존 `simplify` 함수와 `const MIN_COMPONENT_PIXELS = 25`
사이)에 신규 헬퍼를 추가한다:

```ts
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
```

기존 `const MIN_COMPONENT_PIXELS = 25` / `const SIMPLIFY_EPSILON_PX = 3` 블록을 다음으로 교체한다:

```ts
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
```

마지막으로 기존 `export function generatePathNodes(mask, w, h) {...}` 전체를 다음으로 교체한다:

```ts
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

  const assigned: { entrance: EntrancePoint; snap: Point; rawSegmentIndex: number }[][] = components.map(() => [])
  for (const entrance of entrances) {
    let bestComponentIndex = -1
    let bestSnap: ReturnType<typeof nearestPointOnLoop> | null = null
    components.forEach((component, index) => {
      const snap = nearestPointOnLoop(component.rawLoop, [entrance.x, entrance.y])
      if (!bestSnap || snap.distance < bestSnap.distance) {
        bestSnap = snap
        bestComponentIndex = index
      }
    })
    if (!bestSnap || bestSnap.distance > MAX_SNAP_PX) {
      console.warn(`[pathNodes] entrance snap skipped (too far): kind=${entrance.kind} at (${entrance.x}, ${entrance.y})`)
      continue
    }
    assigned[bestComponentIndex].push({ entrance, snap: bestSnap.point, rawSegmentIndex: bestSnap.segmentIndex })
  }

  components.forEach(({ rawLoop, simplifiedLoop }, componentIndex) => {
    const entries: LoopEntry[] = simplifiedLoop.map((point, index) => ({ point, kind: 'corner', segmentIndex: index, t: 0 }))

    function findOrInsert(point: Point, kind: NodeKind, pairKind?: 'connector' | 'landmark'): LoopEntry {
      const existing = entries.find((entry) => Math.hypot(entry.point[0] - point[0], entry.point[1] - point[1]) <= MERGE_RADIUS_PX)
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
      const facingEntry = findOrInsert(facingSnap, 'facing', entrance.kind)
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
```

- [ ] **Step 4: 타입체크로 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit -p tsconfig.app.json`
Expected: 에러 없이 종료 (exit code 0). `noUnusedLocals`/`noUnusedParameters`가 켜져 있으므로 새
헬퍼가 전부 `generatePathNodes` 안에서 실제로 쓰이고 있는지가 특히 중요하다.

- [ ] **Step 5: 커밋**

```bash
git add src/features/mapEditor/pathNodes.ts
git commit -m "feat: generate connector/landmark entrance and facing path nodes"
```

---

### Task 2: `MapReviewPage.tsx` — 비콘·랜드마크 입구 데이터 연동

**Files:**
- Modify: `src/pages/map-editor/MapReviewPage.tsx`

**Interfaces:**
- Consumes: Task 1의 `generatePathNodes(mask, w, h, entrances?)`, `EntrancePoint { x, y, kind }`
- Consumes (기존 훅, 변경 없음): `useBeacons(floorId): { data: Beacon[] | undefined }`
  (`src/features/beacons/hooks.ts`), `useLandmarks(floorId): { data: Landmark[] | undefined }`
  (`src/features/landmarks/hooks.ts`) — 둘 다 이미 `BeaconListPage.tsx`/`LandmarkPage.tsx`에서
  쓰이고 있는 훅을 그대로 재사용한다.
- `Beacon`/`Landmark`의 `x`/`y`는 `src/types/domain.ts`에 "설계도 좌표(900 기준)"로 문서화돼 있고,
  `src/components/map/FloorMapCanvas.tsx`의 `DESIGN_W = 900`과 동일한 기준이다. `MapReviewPage`는
  `CANVAS_W = 760` 기준 캔버스를 쓰므로 `scale = dims.w / 900`로 변환해야 한다.

- [ ] **Step 1: import 추가**

`src/pages/map-editor/MapReviewPage.tsx` 최상단 import 블록(파일 1~12줄)을 다음으로 교체한다:

```ts
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask, useSaveMask } from '@/features/mapEditor/hooks'
import { useBeacons } from '@/features/beacons/hooks'
import { useLandmarks } from '@/features/landmarks/hooks'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { generatePathNodes } from '@/features/mapEditor/pathNodes'
import type { EntrancePoint, PathEdge, PathNode } from '@/features/mapEditor/pathNodes'
```

- [ ] **Step 2: 900px 기준 상수 추가**

기존 캔버스 상수 블록(파일 14~16줄)을 다음으로 교체한다:

```ts
const CANVAS_W = 760
const DESIGN_W = 900 // 비콘/랜드마크 좌표 기준 폭 — FloorMapCanvas.DESIGN_W와 동일
const FILL: [number, number, number, number] = [75, 112, 229, 120] // 이동영역(반투명 파랑)
const BARRIER_R = 4 // 벽 펜 반경(px)
```

- [ ] **Step 3: 비콘/랜드마크 훅 호출 추가**

기존 `const save = useSaveMask(floorId)` 줄(파일 27번째 줄) 바로 아래에 추가:

```ts
  const { data: beacons } = useBeacons(floorId)
  const { data: landmarks } = useLandmarks(floorId)
```

- [ ] **Step 4: `onGenerateNodes`에서 입구 후보 구성해 전달**

기존 `onGenerateNodes` 함수(파일 300~312줄)를 다음으로 교체한다:

```ts
  function onGenerateNodes() {
    const walkable = walkableRef.current
    const barriers = barrierRef.current
    if (!walkable || !barriers || !dims) return
    const effectiveMask = walkable.slice()
    for (let index = 0; index < effectiveMask.length; index++) {
      if (barriers[index]) effectiveMask[index] = 0
    }
    const scale = dims.w / DESIGN_W
    const entrances: EntrancePoint[] = [
      ...(beacons ?? [])
        .filter((b) => b.type === 'connector' && b.x != null && b.y != null)
        .map((b) => ({ x: (b.x as number) * scale, y: (b.y as number) * scale, kind: 'connector' as const })),
      ...(landmarks ?? [])
        .filter((l) => l.x != null && l.y != null)
        .map((l) => ({ x: (l.x as number) * scale, y: (l.y as number) * scale, kind: 'landmark' as const })),
    ]
    const { nodes, edges } = generatePathNodes(effectiveMask, dims.w, dims.h, entrances)
    pathNodesRef.current = nodes
    pathEdgesRef.current = edges
    redraw()
  }
```

- [ ] **Step 5: 타입체크 + 빌드로 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm run build`
Expected: `✓ built in`으로 끝나고 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/pages/map-editor/MapReviewPage.tsx
git commit -m "feat: feed connector/landmark entrances into path node generation"
```

---

### Task 3: `MapReviewPage.tsx` — 시각화 확장 + 수동 검증

**Files:**
- Modify: `src/pages/map-editor/MapReviewPage.tsx`

**Interfaces:**
- Consumes: Task 1의 `PathNode.type`(`'corner' | 'connector' | 'landmark' | 'facing'`),
  `PathNode.pairKind`, `PathEdge.type`(`'wall' | 'cross'`)

- [ ] **Step 1: 노드 색상 헬퍼 + `drawPathNodes` 확장**

기존 `drawPathNodes` 함수(파일 83~109줄)를 다음으로 교체한다:

```ts
  const ENTRANCE_COLOR: Record<'connector' | 'landmark', string> = {
    connector: '#2563eb',
    landmark: '#f2992e',
  }

  function nodeColor(node: PathNode): string {
    if (node.type === 'corner') return node.concave ? '#db2777' : '#7c3aed'
    if (node.type === 'connector' || node.type === 'landmark') return ENTRANCE_COLOR[node.type]
    return ENTRANCE_COLOR[node.pairKind ?? 'connector']
  }

  function drawPathNodes(ctx: CanvasRenderingContext2D) {
    const nodes = pathNodesRef.current
    if (!nodes.length) return
    const byId = new Map(nodes.map((node) => [node.id, node]))
    ctx.save()
    pathEdgesRef.current.forEach((edge) => {
      const a = byId.get(edge.a)
      const b = byId.get(edge.b)
      if (!a || !b) return
      ctx.beginPath()
      if (edge.type === 'cross') {
        ctx.strokeStyle = '#16a34a'
        ctx.lineWidth = 1.4
        ctx.setLineDash([4, 3])
      } else {
        ctx.strokeStyle = '#7c3aed'
        ctx.lineWidth = 1.4
        ctx.setLineDash([])
      }
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    })
    ctx.setLineDash([])
    nodes.forEach((node) => {
      ctx.beginPath()
      ctx.arc(node.x, node.y, 4, 0, Math.PI * 2)
      if (node.type === 'facing') {
        ctx.strokeStyle = nodeColor(node)
        ctx.lineWidth = 1.6
        ctx.stroke()
      } else {
        ctx.fillStyle = nodeColor(node)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    })
    ctx.restore()
  }
```

- [ ] **Step 2: 범례 추가**

기존 안내 문구(파일 397~400줄)를 다음으로 교체한다:

```tsx
          <p className="mt-2 text-[13px] text-muted">
            영역을 <strong>클릭</strong>하면 통행 영역이 채워집니다. 출입구처럼 벽이 뚫려 밖으로 샐 때는{' '}
            <strong>벽 그리기</strong>로 틈을 막은 뒤 채우세요.
          </p>
          <div className="flex flex-wrap gap-3 mt-2 text-[12px] text-muted">
            <span style={{ color: '#7c3aed' }}>● 코너</span>
            <span style={{ color: '#db2777' }}>● 벽 끝(오목)</span>
            <span style={{ color: '#2563eb' }}>● 연결자 입구</span>
            <span style={{ color: '#f2992e' }}>● 랜드마크 출입구</span>
            <span>○ 맞은편 지점</span>
            <span style={{ color: '#16a34a' }}>┄ 횡단 엣지</span>
          </div>
```

- [ ] **Step 3: 타입체크 + 빌드로 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm run build`
Expected: `✓ built in`으로 끝나고 에러 없음.

- [ ] **Step 4: 브라우저 수동 검증**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm run dev` (백그라운드 또는 별도 터미널)

1. `/buildings/:buildingId/floors/:floorId/beacons`에서 `type=엘베·계단`(connector) 비콘을 하나
   추가하고, 지도에서 드래그해 복도 벽 쪽 근처로 옮긴다.
2. `/buildings/:buildingId/floors/:floorId/landmarks`에서 목적지를 하나 추가하고, 역시 복도 벽
   쪽 근처로 옮긴다.
3. `/buildings/:buildingId/floors/:floorId/floorplan`에서 설계도가 없다면 업로드한다.
4. `/buildings/:buildingId/floors/:floorId/map`(지도 검수)에서 "영역 채우기"로 두 입구 근처를
   지나는 복도 형태로 칠한다.
5. "경로 노드 설치" 클릭.
6. 확인:
   - 1단계에서 옮긴 위치 근처에 **파란 채운 원**(연결자 입구), 2단계 위치 근처에 **주황 채운
     원**(랜드마크 출입구)이 나타나는지
   - 각 입구의 반대편 벽에 **빈 원**이 나타나는지
   - 복도가 좁으면 입구-빈 원 사이에 **초록 점선**이 나타나는지(개발자 도구 콘솔에 에러가 없어야
     함 — `console.warn`은 입구가 복도에서 멀리 떨어져 있을 때만 정상적으로 나타남)
   - 비콘/랜드마크를 등록하지 않은 다른 층에서는 기존과 동일하게 보라/분홍 코너 노드만 나오는지
     (회귀 없음)

- [ ] **Step 5: 커밋**

```bash
git add src/pages/map-editor/MapReviewPage.tsx
git commit -m "feat: visualize entrance, facing, and crossing path nodes/edges"
```
