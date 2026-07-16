import { apiClient } from '@/lib/apiClient'
import type { Floorplan } from '@/types/domain'

export async function fetchFloorplan(floorId: string): Promise<Floorplan | null> {
  const { data } = await apiClient.get<Floorplan | null>(`/floors/${floorId}/floorplan`)
  return data
}

export async function uploadFloorplan(floorId: string, imageUrl: string): Promise<Floorplan> {
  const { data } = await apiClient.put<Floorplan>(`/floors/${floorId}/floorplan`, { imageUrl })
  return data
}

export async function deleteFloorplan(floorId: string): Promise<void> {
  await apiClient.delete(`/floors/${floorId}/floorplan`)
}
