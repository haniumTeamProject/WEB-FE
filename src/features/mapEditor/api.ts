import { apiClient } from '@/lib/apiClient'

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
