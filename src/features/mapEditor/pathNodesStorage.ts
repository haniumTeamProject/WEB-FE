import type { PathEdge, PathNode } from './pathNodes'

// 경로노드는 아직 백엔드 저장이 없어 층 ID 기준 localStorage에 보관한다(PathNodePage와 층별 종합 확인
// 화면이 같은 데이터를 읽어야 해서 이 형식/키를 공유 모듈로 뺐다).
export function pathNodesStorageKey(floorId: string) {
  return `pathNodes:${floorId}`
}

export interface StoredPathNodes {
  nodes: PathNode[]
  edges: PathEdge[]
  maskW: number
  maskH: number
}

export function readStoredPathNodes(floorId: string): StoredPathNodes | null {
  if (!floorId) return null
  const raw = localStorage.getItem(pathNodesStorageKey(floorId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredPathNodes
  } catch {
    // 저장된 값이 손상된 경우 무시하고 새로 생성하도록 둔다
    return null
  }
}
