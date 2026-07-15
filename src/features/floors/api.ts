import { apiClient } from '@/lib/apiClient'
import type { Floor } from '@/types/domain'

export async function fetchFloors(buildingId: string): Promise<Floor[]> {
  const { data } = await apiClient.get<Floor[]>(`/buildings/${buildingId}/floors`)
  return data
}

export async function createFloor(buildingId: string, floor: number): Promise<Floor> {
  const { data } = await apiClient.post<Floor>(`/buildings/${buildingId}/floors`, { floor })
  return data
}

export async function deleteFloor(buildingId: string, floorId: string): Promise<void> {
  await apiClient.delete(`/buildings/${buildingId}/floors/${floorId}`)
}
