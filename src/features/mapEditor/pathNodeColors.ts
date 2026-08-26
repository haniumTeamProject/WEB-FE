import type { NodeKind } from './pathNodes'

export const PATH_NODE_ENTRANCE_COLOR: Record<'connector' | 'landmark', string> = {
  connector: '#2563eb',
  landmark: '#f2992e',
}

export function pathNodeColor(node: { type: NodeKind; concave: boolean; pairKind?: 'connector' | 'landmark' }): string {
  if (node.type === 'corner') return node.concave ? '#db2777' : '#7c3aed'
  if (node.type === 'connector' || node.type === 'landmark') return PATH_NODE_ENTRANCE_COLOR[node.type]
  // facing: 입구(연결자/랜드마크)의 맞은편이면 그 색. 그 외(pairKind 없음)는 코너의 맞은편인데,
  // 코너 맞은편은 오목 코너(concave=핑크, '벽 모서리·건너기 지점')에서만 생성되므로(pathNodes.ts 참고)
  // 그 짝인 핑크와 같은 색으로 칠한다 — 볼록 코너(보라)는 애초에 맞은편을 만들지 않는다.
  return node.pairKind ? PATH_NODE_ENTRANCE_COLOR[node.pairKind] : '#db2777'
}
