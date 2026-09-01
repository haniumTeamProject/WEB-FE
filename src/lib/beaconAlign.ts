// 드래그 중인 점을 근처 다른 비콘과 정렬(Figma류 스마트 가이드).
// x·y 두 축을 독립적으로 본다 — 각 축마다 임계값 내 "가장 가까운" 비콘 하나에만 스냅하고 보조선을
// 하나만 그린다(같은 축에 여러 비콘이 있어도 선 다발을 만들지 않는다). 두 축이 동시에 걸리면
// 세로+가로 보조선이 십자로 만나 "행/열 동시" 정렬을 보여준다.

export interface GuideLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface BeaconGuidesResult {
  snapX: number | null // 스냅할 x(가장 가까운 비콘의 x), 없으면 null
  snapY: number | null // 스냅할 y, 없으면 null
  xGuide: GuideLine | null // snapX 위의 세로 보조선(대상 비콘 ↔ 현재 지점)
  yGuide: GuideLine | null // snapY 위의 가로 보조선
}

// dragBoundFunc가 넘기는 좌표는 줌(확대) 영향을 안 받는 레이어 기준값이라, 기본 화면 배율에서 실제
// 화면상 몇 픽셀에 불과해 마우스로 맞추기 어렵다는 피드백에 따라 넉넉하게 잡았다(호출부는 줌 보정값을 넘긴다).
const DEFAULT_THRESHOLD_PX = 12

export function findBeaconGuides(
  x: number,
  y: number,
  others: { x: number; y: number }[],
  threshold = DEFAULT_THRESHOLD_PX,
): BeaconGuidesResult {
  let bestX: { other: { x: number; y: number }; delta: number } | null = null
  let bestY: { other: { x: number; y: number }; delta: number } | null = null
  for (const o of others) {
    const dx = Math.abs(x - o.x)
    const dy = Math.abs(y - o.y)
    if (dx <= threshold && (!bestX || dx < bestX.delta)) bestX = { other: o, delta: dx }
    if (dy <= threshold && (!bestY || dy < bestY.delta)) bestY = { other: o, delta: dy }
  }

  const snapX = bestX ? bestX.other.x : null
  const snapY = bestY ? bestY.other.y : null
  // 십자 보조선은 실제 스냅된 지점(snapX/snapY)에서 만나야 하므로, 반대 축이 스냅됐으면 그 값을 끝점으로 쓴다.
  const endX = snapX ?? x
  const endY = snapY ?? y

  return {
    snapX,
    snapY,
    xGuide: bestX ? { x1: snapX as number, y1: bestX.other.y, x2: snapX as number, y2: endY } : null,
    yGuide: bestY ? { x1: bestY.other.x, y1: snapY as number, x2: endX, y2: snapY as number } : null,
  }
}
