// 건너기(cross) 엣지가 a->b 한쪽 방향만 가능하다는 걸 점선만으로는 알기 어려워서, 화살촉 삼각형 좌표를
// 계산해 방향을 명확히 보여준다. tipX/tipY 위치에 화살촉 끝이 오도록, from->to 방향을 기준으로 그린다.
export function arrowheadPoints(fromX: number, fromY: number, tipX: number, tipY: number, size: number): number[] {
  const angle = Math.atan2(tipY - fromY, tipX - fromX)
  const spread = 0.5
  return [
    tipX,
    tipY,
    tipX - size * Math.cos(angle - spread),
    tipY - size * Math.sin(angle - spread),
    tipX - size * Math.cos(angle + spread),
    tipY - size * Math.sin(angle + spread),
  ]
}
