import type { NodeKind } from './pathNodes'

export const PATH_NODE_ENTRANCE_COLOR: Record<'connector' | 'landmark', string> = {
  connector: '#2563eb',
  landmark: '#f2992e',
}

export function pathNodeColor(node: { type: NodeKind; concave: boolean; pairKind?: 'connector' | 'landmark' }): string {
  if (node.type === 'corner') return node.concave ? '#db2777' : '#7c3aed'
  if (node.type === 'connector' || node.type === 'landmark') return PATH_NODE_ENTRANCE_COLOR[node.type]
  // facing: 입구(연결자/랜드마크)의 맞은편이면 그 색, 코너에서 뻗어나온 맞은편이면 코너와 같은 보라
  return node.pairKind ? PATH_NODE_ENTRANCE_COLOR[node.pairKind] : '#7c3aed'
}
