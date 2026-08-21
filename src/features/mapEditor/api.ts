import { apiClient } from '@/lib/apiClient'
import type { PathEdge, PathNode } from './pathNodes'

// 이동영역 마스크 = 채워진 영역을 담은 PNG(투명 배경) + 원본 캔버스 크기
export interface FloorMask {
  width: number
  height: number
  dataUrl: string
}

export async function fetchMask(floorId: string): Promise<FloorMask | null> {
  const { data } = await apiClient.get<FloorMask | null>(`/floors/${floorId}/mask`)
  return data
}

export async function saveMask(floorId: string, mask: FloorMask): Promise<void> {
  await apiClient.put(`/floors/${floorId}/mask`, mask)
}

// 축척 = 도면 1px가 실제로 몇 m인지의 비율. 두 점 클릭 + 실거리 입력으로 계산해 저장한다.
export interface FloorScale {
  scaleMPerPx: number
}

export async function fetchScale(floorId: string): Promise<FloorScale | null> {
  const { data } = await apiClient.get<FloorScale | null>(`/floors/${floorId}/scale`)
  return data
}

export async function saveScale(floorId: string, scale: FloorScale): Promise<void> {
  await apiClient.put(`/floors/${floorId}/scale`, scale)
}

// 경로노드 = 코너/입구(연결자·목적지)의 맞은편(facing) 포함 전체 노드 + 벽선·횡단 엣지를 한 덩어리로
// 저장한다. 종류별로 나눠 저장하지 않는 이유: PathNodePage가 애초에 노드/엣지를 하나의 그래프로
// 다루고(드래그로 옮기거나 지울 때도 종류 구분 없이 같은 배열을 갱신), 불러올 때도 층 하나 분량을
// 통째로 복원해야 화면에 다시 정확히 그릴 수 있다 — 쪼개 저장하면 조회할 때 여러 번 합쳐야 하고,
// 노드 하나가 사라지면 그와 연결된 엣지도 같이 정리해야 하는 등 일관성 관리가 번거로워진다.
export interface PathNodesData {
  nodes: PathNode[]
  edges: PathEdge[]
  maskW: number
  maskH: number
}

export async function fetchPathNodes(floorId: string): Promise<PathNodesData | null> {
  const { data } = await apiClient.get<PathNodesData | null>(`/floors/${floorId}/path-nodes`)
  return data
}

export async function savePathNodes(floorId: string, pathNodes: PathNodesData): Promise<void> {
  await apiClient.put(`/floors/${floorId}/path-nodes`, pathNodes)
}
