// 보강비콘 자동생성: 마스크로 같은 방·복도(connected component)를 구분하고,
// 그 안에서 서로 최근접인 의미비콘끼리 짝지어 D_max(6m) 초과 구간에 균등 삽입한다.
// 한 비콘당 최근접 하나만 연결하므로, 한 지점에서 여러 방향으로 갈라지는 경우
// 한쪽 방향만 커버될 수 있다 — 정책상 분기점엔 이미 의미비콘이 있어 치명적이진 않다고 보고 남겨둔 한계.

import type { FloorMask } from '@/features/mapEditor/api'
import { MAP_DESIGN_W } from './constants'

const D_MAX_M = 6

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

// 마스크 PNG를 래스터화해 통행가능 픽셀(alpha>0)의 Uint8 버퍼로 변환
async function rasterizeMask(mask: FloorMask): Promise<{ w: number; h: number; walkable: Uint8Array }> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('마스크 이미지를 불러올 수 없습니다.'))
    img.src = mask.dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = mask.width
  canvas.height = mask.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, mask.width, mask.height)
  const data = ctx.getImageData(0, 0, mask.width, mask.height).data
  const walkable = new Uint8Array(mask.width * mask.height)
  for (let i = 0; i < walkable.length; i++) walkable[i] = data[i * 4 + 3] > 0 ? 1 : 0
  return { w: mask.width, h: mask.height, walkable }
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

// 마스크 픽셀 좌표에서 가장 가까운 통행가능 픽셀의 컴포넌트 라벨을 찾는다(벽 경계에 찍힌 점 보정용).
function componentAt(px: number, py: number, w: number, h: number, walkable: Uint8Array, labels: Int32Array): number {
  const x0 = Math.round(px)
  const y0 = Math.round(py)
  for (let r = 0; r <= 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = x0 + dx
        const y = y0 + dy
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const idx = y * w + x
        if (walkable[idx]) return labels[idx]
      }
    }
  }
  return -1
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

  // 같은 컴포넌트 안에서 서로 최근접인 짝을 구함(중복 제거)
  const pairKeys = new Set<string>()
  const pairs: [SemanticPoint, SemanticPoint][] = []
  for (const a of withComponent) {
    if (a.component === -1) continue
    let nearest: (typeof withComponent)[number] | null = null
    let nearestDist = Infinity
    for (const b of withComponent) {
      if (b.id === a.id || b.component !== a.component) continue
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d < nearestDist) {
        nearestDist = d
        nearest = b
      }
    }
    if (!nearest) continue
    const key = [a.id, nearest.id].sort().join('|')
    if (pairKeys.has(key)) continue
    pairKeys.add(key)
    pairs.push([a, nearest])
  }

  const plan: ReinforcementPlanItem[] = []
  for (const [a, b] of pairs) {
    const pixelDist = Math.hypot(a.x - b.x, a.y - b.y)
    const meters = pixelDist * mPerDesignPx
    if (meters <= D_MAX_M) continue
    const n = Math.ceil(meters / D_MAX_M) - 1
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1)
      plan.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pair: [a.id, b.id] })
    }
  }
  return plan
}
