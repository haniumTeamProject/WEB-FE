# 벽 경계 기반 경로 노드 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지도 검수 화면(`MapReviewPage.tsx`)에 "경로 노드 설치" 기능을 추가해서, 통행영역 마스크의 벽 경계를 따라가는 방식으로 경로 노드를 생성하고 화면에 표시한다.

**Architecture:** 채연이 만든 참고 구현(`map_inspection.html`)의 알고리즘(연결요소 라벨링 → Moore-neighbor 경계 추적 → Douglas-Peucker 단순화 → convex/concave 분류 → 경계 루프를 잇는 엣지)을 순수 TypeScript 함수로 이식한 뒤, 기존 `MapReviewPage.tsx`의 ref 기반 imperative canvas 패턴에 맞춰 통합한다.

**Tech Stack:** React 19 + TypeScript, `<canvas>` 2D context (Konva 아님 — 이 페이지는 순수 canvas API 사용), Vite. 저장소에 자동 테스트 프레임워크 없음 — `tsc`/`eslint` + 브라우저 수동 검증으로 확인.

## Global Constraints

- 축척(m/px), 크로싱 엣지, 모서리 단순화 UI 입력은 이번 범위에 포함하지 않는다 (스펙 참고: [2026-08-03-wall-following-path-nodes-design.md](../specs/2026-08-03-wall-following-path-nodes-design.md)).
- 노드/엣지는 픽셀 좌표만 다루며, 서버 저장은 하지 않는다 (`onSave()`는 변경하지 않음).
- `MIN_COMPONENT_PIXELS = 25`, `SIMPLIFY_EPSILON_PX = 3` 고정값 사용.
- 이 환경(Bash 도구)에서는 `node`/`npm`이 기본 PATH에 없다. 모든 실행 명령 앞에
  `export PATH="/c/Program Files/nodejs:$PATH" &&` 를 붙여서 실행한다.

---

### Task 1: 경로 노드 생성 순수 로직 모듈

**Files:**
- Create: `src/features/mapEditor/pathNodes.ts`
- Create (임시, 커밋 안 함): scratchpad 경로의 `verify_pathnodes.mjs`

**Interfaces:**
- Produces: `export interface PathNode { id: string; x: number; y: number; type: 'corner'; concave: boolean }`,
  `export interface PathEdge { a: string; b: string; type: 'wall' }`,
  `export function generatePathNodes(mask: Uint8Array, w: number, h: number): { nodes: PathNode[]; edges: PathEdge[] }`
  — Task 2가 이 세 가지를 그대로 소비한다.

- [ ] **Step 1: 합성 마스크로 알고리즘 동작을 스크래치 스크립트에서 먼저 확인**

아래 파일을 생성한다 (경로는 아무 임시 폴더나 가능, 저장소 밖에 두는 걸 권장):

`verify_pathnodes.mjs`
```js
function labelComponents(mask, w, h) {
  const labels = new Int32Array(w * h).fill(-1)
  const comps = []
  for (let i = 0; i < w * h; i++) {
    if (mask[i] && labels[i] === -1) {
      const compId = comps.length
      const startX = i % w
      const startY = (i - startX) / w
      let count = 0
      const stack = [i]
      labels[i] = compId
      while (stack.length) {
        const idx = stack.pop()
        count++
        const x = idx % w
        const y = (idx - x) / w
        const neighbors = [idx - 1, idx + 1, idx - w, idx + w]
        for (const n of neighbors) {
          if (n < 0 || n >= w * h) continue
          const nx = n % w
          if (Math.abs(nx - x) > 1) continue
          if (mask[n] && labels[n] === -1) {
            labels[n] = compId
            stack.push(n)
          }
        }
      }
      comps.push({ count, startX, startY })
    }
  }
  return { labels, comps }
}

const MOORE_DIRS = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]]

function traceBoundary(mask, w, h, labels, compId, startX, startY) {
  function isFg(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    return mask[y * w + x] === 1 && labels[y * w + x] === compId
  }
  const boundary = [[startX, startY]]
  let backtrackDir = 0, cx = startX, cy = startY, steps = 0
  const maxSteps = w * h * 4 + 8
  while (steps++ < maxSteps) {
    let found = false, foundDir = -1, nx = cx, ny = cy
    for (let k = 0; k < 8; k++) {
      const dIdx = (backtrackDir + 1 + k) % 8
      const [ddx, ddy] = MOORE_DIRS[dIdx]
      const tx = cx + ddx, ty = cy + ddy
      if (isFg(tx, ty)) { found = true; foundDir = dIdx; nx = tx; ny = ty; break }
    }
    if (!found) break
    backtrackDir = (foundDir + 4) % 8
    cx = nx; cy = ny
    if (cx === startX && cy === startY) break
    boundary.push([cx, cy])
  }
  return boundary
}

function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(x - x1, y - y1)
  let t = ((x - x1) * dx + (y - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

function simplify(points, epsilon) {
  if (points.length < 3) return points
  function dp(pts, eps) {
    if (pts.length < 3) return pts
    let maxD = 0, idx = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > eps) {
      const left = dp(pts.slice(0, idx + 1), eps)
      const right = dp(pts.slice(idx), eps)
      return left.slice(0, -1).concat(right)
    }
    return [pts[0], pts[pts.length - 1]]
  }
  return dp(points, epsilon)
}

const MIN_COMPONENT_PIXELS = 25
const SIMPLIFY_EPSILON_PX = 1.2

function generatePathNodes(mask, w, h) {
  const nodes = []
  const nodeAt = new Map()
  let nid = 1
  function addNode(x, y) {
    const key = `${x},${y}`
    const existing = nodeAt.get(key)
    if (existing) return existing
    const node = { id: `N${String(nid++).padStart(2, '0')}`, x, y, type: 'corner', concave: false }
    nodes.push(node)
    nodeAt.set(key, node)
    return node
  }
  const edges = []
  const edgeSet = new Set()
  function addEdge(a, b) {
    if (a.id === b.id) return
    const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
    if (edgeSet.has(k)) return
    edgeSet.add(k)
    edges.push({ a: a.id, b: b.id, type: 'wall' })
  }
  const { labels, comps } = labelComponents(mask, w, h)
  comps.forEach((comp, compId) => {
    if (comp.count < MIN_COMPONENT_PIXELS) return
    const boundary = traceBoundary(mask, w, h, labels, compId, comp.startX, comp.startY)
    const simplified = simplify(boundary, SIMPLIFY_EPSILON_PX)
    const n = simplified.length
    const loopNodes = simplified.map(([x, y], i) => {
      const node = addNode(x, y)
      const [px, py] = simplified[(i - 1 + n) % n]
      const [nx, ny] = simplified[(i + 1) % n]
      const v1x = x - px, v1y = y - py, v2x = nx - x, v2y = ny - y
      const cross = v1x * v2y - v1y * v2x
      if (cross < 0) node.concave = true
      return node
    })
    for (let i = 0; i < loopNodes.length; i++) {
      addEdge(loopNodes[i], loopNodes[(i + 1) % loopNodes.length])
    }
  })
  return { nodes, edges }
}

// L-shape: 14x14 rectangle with a 6x6 notch bitten out of the top-right corner.
// A single reflex (concave) vertex must appear at the notch's inner corner.
{
  const w = 14, h = 14
  const mask = new Uint8Array(w * h).fill(1)
  for (let y = 0; y < 6; y++) for (let x = 8; x < 14; x++) mask[y * w + x] = 0
  const { nodes, edges } = generatePathNodes(mask, w, h)
  const concaveCount = nodes.filter((n) => n.concave).length
  console.log('L-shape nodes=%d edges=%d concave=%d', nodes.length, edges.length, concaveCount)
  if (concaveCount !== 1) throw new Error('expected exactly 1 concave vertex for an L-shape')
}

// Two disconnected walkable blobs must produce two independent loops with zero
// edges crossing between them.
{
  const w = 20, h = 10
  const mask = new Uint8Array(w * h).fill(0)
  for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) mask[y * w + x] = 1
  for (let y = 1; y < 8; y++) for (let x = 12; x < 19; x++) mask[y * w + x] = 1
  const { nodes, edges } = generatePathNodes(mask, w, h)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const crossing = edges.filter((e) => {
    const a = byId.get(e.a), b = byId.get(e.b)
    return (a.x < 10) !== (b.x < 10)
  })
  console.log('two-blobs nodes=%d edges=%d crossing=%d', nodes.length, edges.length, crossing.length)
  if (crossing.length !== 0) throw new Error('expected zero edges connecting the two separate blobs')
}

// A speck smaller than MIN_COMPONENT_PIXELS must be dropped entirely (treated as noise).
{
  const w = 10, h = 10
  const mask = new Uint8Array(w * h).fill(0)
  mask[5 * w + 5] = 1; mask[5 * w + 6] = 1; mask[6 * w + 5] = 1
  const { nodes, edges } = generatePathNodes(mask, w, h)
  console.log('speck nodes=%d edges=%d', nodes.length, edges.length)
  if (nodes.length !== 0 || edges.length !== 0) throw new Error('expected the speck to be dropped')
}

console.log('all checks passed')
```

- [ ] **Step 2: 스크래치 스크립트 실행 — 통과 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && node verify_pathnodes.mjs`
Expected output ends with:
```
all checks passed
```
(만약 `throw` 에러가 나면 위 로직을 다시 확인 — L자 모양은 concave 정확히 1개, 분리된 두 영역은 서로 연결된 엣지가 0개, 25px 미만 영역은 완전히 무시되어야 한다.)

- [ ] **Step 3: 검증된 로직을 타입이 있는 실제 모듈로 작성**

Create `src/features/mapEditor/pathNodes.ts`:
```ts
// 통행영역 마스크의 벽 경계를 따라가는 방식으로 경로 노드를 생성한다.
// (채연이 만든 참고 구현의 알고리즘을 이식 — 연결요소 라벨링 → Moore-neighbor
// 경계 추적 → Douglas-Peucker 단순화 → convex/concave 분류 → 경계를 잇는 엣지)

export interface PathNode {
  id: string
  x: number
  y: number
  type: 'corner'
  concave: boolean // true = 벽이 끝나는 지점(움푹 들어간 모서리)
}

export interface PathEdge {
  a: string
  b: string
  type: 'wall'
}

type Point = [number, number]

interface ComponentInfo {
  count: number
  startX: number
  startY: number
}

function labelComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; comps: ComponentInfo[] } {
  const labels = new Int32Array(w * h).fill(-1)
  const comps: ComponentInfo[] = []
  for (let i = 0; i < w * h; i++) {
    if (mask[i] && labels[i] === -1) {
      const compId = comps.length
      const startX = i % w
      const startY = (i - startX) / w
      let count = 0
      const stack = [i]
      labels[i] = compId
      while (stack.length) {
        const idx = stack.pop() as number
        count++
        const x = idx % w
        const y = (idx - x) / w
        const neighbors = [idx - 1, idx + 1, idx - w, idx + w]
        for (const n of neighbors) {
          if (n < 0 || n >= w * h) continue
          const nx = n % w
          if (Math.abs(nx - x) > 1) continue
          if (mask[n] && labels[n] === -1) {
            labels[n] = compId
            stack.push(n)
          }
        }
      }
      comps.push({ count, startX, startY })
    }
  }
  return { labels, comps }
}

const MOORE_DIRS: Point[] = [
  [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1],
]

function traceBoundary(
  mask: Uint8Array,
  w: number,
  h: number,
  labels: Int32Array,
  compId: number,
  startX: number,
  startY: number,
): Point[] {
  function isFg(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    return mask[y * w + x] === 1 && labels[y * w + x] === compId
  }
  const boundary: Point[] = [[startX, startY]]
  let backtrackDir = 0
  let cx = startX
  let cy = startY
  let steps = 0
  const maxSteps = w * h * 4 + 8
  while (steps++ < maxSteps) {
    let found = false
    let foundDir = -1
    let nx = cx
    let ny = cy
    for (let k = 0; k < 8; k++) {
      const dIdx = (backtrackDir + 1 + k) % 8
      const [ddx, ddy] = MOORE_DIRS[dIdx]
      const tx = cx + ddx
      const ty = cy + ddy
      if (isFg(tx, ty)) {
        found = true
        foundDir = dIdx
        nx = tx
        ny = ty
        break
      }
    }
    if (!found) break
    backtrackDir = (foundDir + 4) % 8
    cx = nx
    cy = ny
    if (cx === startX && cy === startY) break
    boundary.push([cx, cy])
  }
  return boundary
}

function perpDist(p: Point, a: Point, b: Point): number {
  const [x, y] = p
  const [x1, y1] = a
  const [x2, y2] = b
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(x - x1, y - y1)
  let t = ((x - x1) * dx + (y - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points
  function dp(pts: Point[], eps: number): Point[] {
    if (pts.length < 3) return pts
    let maxD = 0
    let idx = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > eps) {
      const left = dp(pts.slice(0, idx + 1), eps)
      const right = dp(pts.slice(idx), eps)
      return left.slice(0, -1).concat(right)
    }
    return [pts[0], pts[pts.length - 1]]
  }
  return dp(points, epsilon)
}

const MIN_COMPONENT_PIXELS = 25
const SIMPLIFY_EPSILON_PX = 3

export function generatePathNodes(
  mask: Uint8Array,
  w: number,
  h: number,
): { nodes: PathNode[]; edges: PathEdge[] } {
  const nodes: PathNode[] = []
  const nodeAt = new Map<string, PathNode>()
  let nid = 1
  function addNode(x: number, y: number): PathNode {
    const key = `${x},${y}`
    const existing = nodeAt.get(key)
    if (existing) return existing
    const node: PathNode = { id: `N${String(nid++).padStart(2, '0')}`, x, y, type: 'corner', concave: false }
    nodes.push(node)
    nodeAt.set(key, node)
    return node
  }

  const edges: PathEdge[] = []
  const edgeSet = new Set<string>()
  function addEdge(a: PathNode, b: PathNode) {
    if (a.id === b.id) return
    const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
    if (edgeSet.has(k)) return
    edgeSet.add(k)
    edges.push({ a: a.id, b: b.id, type: 'wall' })
  }

  const { labels, comps } = labelComponents(mask, w, h)
  comps.forEach((comp, compId) => {
    if (comp.count < MIN_COMPONENT_PIXELS) return
    const boundary = traceBoundary(mask, w, h, labels, compId, comp.startX, comp.startY)
    const simplified = simplify(boundary, SIMPLIFY_EPSILON_PX)
    const n = simplified.length
    const loopNodes = simplified.map(([x, y], i) => {
      const node = addNode(x, y)
      const [px, py] = simplified[(i - 1 + n) % n]
      const [nx, ny] = simplified[(i + 1) % n]
      const v1x = x - px
      const v1y = y - py
      const v2x = nx - x
      const v2y = ny - y
      const cross = v1x * v2y - v1y * v2x
      if (cross < 0) node.concave = true
      return node
    })
    for (let i = 0; i < loopNodes.length; i++) {
      addEdge(loopNodes[i], loopNodes[(i + 1) % loopNodes.length])
    }
  })

  return { nodes, edges }
}
```

- [ ] **Step 4: 타입체크로 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit -p tsconfig.app.json`
Expected: 에러 없이 종료 (exit code 0).

- [ ] **Step 5: 커밋**

```bash
git add src/features/mapEditor/pathNodes.ts
git commit -m "feat: add wall-following path node generation logic"
```

---

### Task 2: MapReviewPage에 "경로 노드 설치" 통합

**Files:**
- Modify: `src/pages/map-editor/MapReviewPage.tsx`

**Interfaces:**
- Consumes: `generatePathNodes(mask: Uint8Array, w: number, h: number): { nodes: PathNode[]; edges: PathEdge[] }`,
  `PathNode { id, x, y, type: 'corner', concave }`, `PathEdge { a, b, type: 'wall' }` — all from Task 1's
  `src/features/mapEditor/pathNodes.ts`.

- [ ] **Step 1: import 추가**

`src/pages/map-editor/MapReviewPage.tsx` 최상단 import 블록(파일 1~10줄)에 추가:
```ts
import { generatePathNodes } from '@/features/mapEditor/pathNodes'
import type { PathNode, PathEdge } from '@/features/mapEditor/pathNodes'
```

- [ ] **Step 2: 노드/엣지 ref 추가**

`barrierRef` 선언 바로 아래(기존 32번째 줄 `const barrierRef = useRef<Uint8Array | null>(null)` 다음)에 추가:
```ts
  const pathNodesRef = useRef<PathNode[]>([])
  const pathEdgesRef = useRef<PathEdge[]>([])
```

- [ ] **Step 3: 마스크가 바뀔 때마다 노드를 무효화하도록 `rebuildMask()` 맨 앞에 초기화 추가**

기존 `rebuildMask()`(파일 40~63줄)의 첫 줄에 추가해서, 마스크를 실제로 다시 그리는 모든 경로(채우기/지우개, 벽 그리기 완료, undo, 전체 지우기, 새 이미지 로드)에서 공통으로 이전 노드를 지운다:
```ts
  function rebuildMask() {
    pathNodesRef.current = []
    pathEdgesRef.current = []
    const mask = maskCanvasRef.current
    const base = baseCanvasRef.current
    const wk = walkableRef.current
    const br = barrierRef.current
    if (!mask || !base || !wk || !br) return
    // ...(이하 기존 코드 그대로)
```

- [ ] **Step 4: 노드/엣지를 그리는 함수 추가 + `redraw()`에서 호출**

`redraw()` 함수(파일 65~74줄) 바로 뒤에 새 함수를 추가하고, `redraw()` 본문 마지막에 호출을 추가한다:

```ts
  function redraw() {
    const cv = canvasRef.current
    const base = baseCanvasRef.current
    const mask = maskCanvasRef.current
    if (!cv || !base) return
    const ctx = cv.getContext('2d')!
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(base, 0, 0)
    if (mask) ctx.drawImage(mask, 0, 0)
    drawPathNodes(ctx)
  }

  function drawPathNodes(ctx: CanvasRenderingContext2D) {
    const nodes = pathNodesRef.current
    const edges = pathEdgesRef.current
    if (!nodes.length) return
    const byId = new Map(nodes.map((n) => [n.id, n]))
    ctx.save()
    ctx.strokeStyle = '#7c3aed'
    ctx.lineWidth = 1.4
    edges.forEach((e) => {
      const a = byId.get(e.a)
      const b = byId.get(e.b)
      if (!a || !b) return
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    })
    nodes.forEach((n) => {
      ctx.beginPath()
      ctx.arc(n.x, n.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = n.concave ? '#db2777' : '#7c3aed'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    })
    ctx.restore()
  }
```

- [ ] **Step 5: "경로 노드 설치" 클릭 핸들러 추가**

`onSave()` 함수(파일 265~287줄) 바로 앞에 추가:
```ts
  function onGenerateNodes() {
    const wk = walkableRef.current
    if (!wk || !dims) return
    const { nodes, edges } = generatePathNodes(wk, dims.w, dims.h)
    pathNodesRef.current = nodes
    pathEdgesRef.current = edges
    redraw()
  }
```

- [ ] **Step 6: 도구 패널에 버튼 추가**

기존 "되돌리기"/"전체 지우기" 버튼 그룹(파일 378~385줄)과 저장 버튼 사이에 추가:
```tsx
          <div className="grid gap-2 mt-4">
            <Button variant="outline" onClick={undo}>
              되돌리기
            </Button>
            <Button variant="outline" onClick={clearAll}>
              전체 지우기
            </Button>
          </div>
          <Button variant="outline" className="w-full mt-4" onClick={onGenerateNodes}>
            경로 노드 설치
          </Button>
          <Button className="w-full mt-4" disabled={save.isPending} onClick={onSave}>
```
(마지막 줄은 기존 저장 버튼의 시작 태그 — 그 위에 새 버튼만 끼워 넣는다.)

- [ ] **Step 7: 타입체크 + 빌드로 확인**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm run build`
Expected: `✓ built in`으로 끝나고 에러 없음 (baseline에서 이미 이 명령으로 정상 빌드됨을 확인함).

- [ ] **Step 8: 브라우저 수동 검증**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm run dev` (백그라운드로 실행하거나 별도 터미널)

먼저 `/buildings/:buildingId/floors/:floorId/floorplan` 에서 평면도를 업로드한 뒤, 지도 검수 화면
`/buildings/:buildingId/floors/:floorId/map` (`router.tsx:57`에서 확인한 실제 라우트)으로 이동해:

1. "영역 채우기"로 오목한 모서리가 생기도록 ㄱ자 형태로 복도를 칠함 (예: 가로로 한 번, 세로로 한 번 채워서 겹치게)
2. "경로 노드 설치" 클릭
3. 보라색 점들이 칠해진 영역의 **가장자리(벽 경계)** 를 따라 찍히는지 확인 (영역 중앙이 아님)
4. ㄱ자의 안쪽 꺾이는 지점에 분홍색 점(concave/벽 끝)이 하나 나타나는지 확인
5. "지우개"나 "벽 그리기"로 마스크를 조금 바꾼 뒤, 이전 노드/선이 화면에서 사라지는지(무효화) 확인

Expected: 3~5번 모두 설계 문서의 테스트 계획과 일치.

- [ ] **Step 9: 커밋**

```bash
git add src/pages/map-editor/MapReviewPage.tsx
git commit -m "feat: generate wall-following path nodes in map review page"
```
