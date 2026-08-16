// 드래그 중인 점을 근처 다른 비콘과 같은 x 또는 y로 스냅(Figma류 정렬 가이드).
// 두 축 중 임계값 이내로 더 가까운(작은 차이) 축 하나를 스냅하되, 그 축으로 근접한 다른 점이
// 여럿이면 전부에게 가이드선을 그려 보여준다(비콘이 여러 개 겹쳐 있을 때 한 점만 표시되던 문제).

export interface AlignResult {
  x: number
  y: number
  axis: 'x' | 'y' // 스냅이 적용된(고정된) 축
  guides: { x1: number; y1: number; x2: number; y2: number }[]
}

// dragBoundFunc가 넘기는 좌표는 줌(확대) 영향을 안 받는 레이어 기준값이라, 6px는 기본 화면 배율에서
// 실제 화면상 몇 픽셀에 불과해 마우스로 정확히 맞추기 어렵다는 피드백에 따라 넉넉하게 올렸다.
const DEFAULT_THRESHOLD_PX = 12

export function findBeaconAlign(
  x: number,
  y: number,
  others: { x: number; y: number }[],
  threshold = DEFAULT_THRESHOLD_PX,
): AlignResult | null {
  let best: { axis: 'x' | 'y'; delta: number; other: { x: number; y: number } } | null = null
  for (const other of others) {
    const dx = Math.abs(x - other.x)
    const dy = Math.abs(y - other.y)
    if (dx <= threshold && (!best || dx < best.delta)) best = { axis: 'x', delta: dx, other }
    if (dy <= threshold && (!best || dy < best.delta)) best = { axis: 'y', delta: dy, other }
  }
  if (!best) return null

  if (best.axis === 'x') {
    const snappedX = best.other.x
    // 드래그 중인 좌표가 아니라 스냅 대상 좌표(snappedX) 기준으로 걸러야 한다. 드래그 좌표 기준으로 걸러버리면
    // 비콘이 촘촘한 지도에서 snappedX와 실제로는 다른 x를 가진 비콘까지 "근처에 있다"는 이유로 매칭돼,
    // 가이드선이 대상과 어긋난 대각선으로 그려지고(정렬처럼 안 보임) 드래그할 때마다 매칭 집합이 흔들린다.
    const matches = others.filter((o) => Math.abs(o.x - snappedX) <= threshold)
    return {
      x: snappedX,
      y,
      axis: 'x',
      guides: matches.map((o) => ({ x1: snappedX, y1: o.y, x2: snappedX, y2: y })),
    }
  }
  const snappedY = best.other.y
  const matches = others.filter((o) => Math.abs(o.y - snappedY) <= threshold)
  return {
    x,
    y: snappedY,
    axis: 'y',
    guides: matches.map((o) => ({ x1: o.x, y1: snappedY, x2: x, y2: snappedY })),
  }
}
