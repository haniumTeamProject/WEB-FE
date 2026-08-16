// 드래그 중인 점을 마스크 기준 복도 중심으로 스냅.
// 현재 위치에서 상하좌우로 벽까지 레이캐스팅해, 더 좁은 쪽 축(=복도를 가로지르는 방향)의
// 양쪽 벽 사이 중점으로 스냅한다. 세로 복도면 좌우 중심(가로 스냅), 가로 복도면 상하 중심(세로 스냅).
// 한쪽이라도 벽을 못 찾으면(열린 공간) 스냅하지 않는다.

export interface SnapResult {
  x: number // 스냅된 마스크 픽셀 좌표
  y: number
  axis: 'x' | 'y' // 스냅이 적용된 축
  guide: { x1: number; y1: number; x2: number; y2: number } // 가이드 라인 양끝(마스크 픽셀, 벽에 닿은 지점)
}

function castRay(
  w: number,
  h: number,
  walkable: Uint8Array,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  maxSteps: number,
): { x: number; y: number; hit: boolean } {
  let x = x0
  let y = y0
  for (let steps = 0; steps < maxSteps; steps++) {
    x += dx
    y += dy
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return { x, y, hit: false }
    if (!walkable[yi * w + xi]) return { x, y, hit: true }
  }
  return { x, y, hit: false }
}

export function findCorridorSnap(
  w: number,
  h: number,
  walkable: Uint8Array,
  px: number,
  py: number,
): SnapResult | null {
  const xi = Math.round(px)
  const yi = Math.round(py)
  if (xi < 0 || yi < 0 || xi >= w || yi >= h || !walkable[yi * w + xi]) return null

  // 큰 방에서도 벽을 찾을 수 있도록 마스크 전체 크기만큼은 레이캐스팅한다(고정 스텝 수로는 넓은 공간에서 못 찾음).
  const maxSteps = Math.max(w, h)
  const left = castRay(w, h, walkable, px, py, -1, 0, maxSteps)
  const right = castRay(w, h, walkable, px, py, 1, 0, maxSteps)
  const up = castRay(w, h, walkable, px, py, 0, -1, maxSteps)
  const down = castRay(w, h, walkable, px, py, 0, 1, maxSteps)

  const hSpan = left.hit && right.hit ? Math.hypot(right.x - left.x, right.y - left.y) : Infinity
  const vSpan = up.hit && down.hit ? Math.hypot(down.x - up.x, down.y - up.y) : Infinity
  if (!Number.isFinite(hSpan) && !Number.isFinite(vSpan)) return null

  if (hSpan <= vSpan) {
    return {
      x: (left.x + right.x) / 2,
      y: py,
      axis: 'x',
      guide: { x1: left.x, y1: left.y, x2: right.x, y2: right.y },
    }
  }
  return {
    x: px,
    y: (up.y + down.y) / 2,
    axis: 'y',
    guide: { x1: up.x, y1: up.y, x2: down.x, y2: down.y },
  }
}
