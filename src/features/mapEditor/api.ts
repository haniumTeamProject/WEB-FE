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
