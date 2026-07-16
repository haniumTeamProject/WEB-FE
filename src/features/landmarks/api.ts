import { apiClient } from '@/lib/apiClient'
import type { Landmark, LandmarkType } from '@/types/domain'

export interface CreateLandmarkInput {
  name: string
  type: LandmarkType
  x?: number
  y?: number
}

export type UpdateLandmarkInput = Partial<{ name: string; type: LandmarkType; x: number; y: number }>

export async function fetchLandmarks(floorId: string): Promise<Landmark[]> {
  const { data } = await apiClient.get<Landmark[]>(`/floors/${floorId}/landmarks`)
  return data
}

export async function createLandmark(
  floorId: string,
  input: CreateLandmarkInput,
): Promise<Landmark> {
  const { data } = await apiClient.post<Landmark>(`/floors/${floorId}/landmarks`, input)
  return data
}

export async function updateLandmark(
  floorId: string,
  landmarkId: string,
  input: UpdateLandmarkInput,
): Promise<Landmark> {
  const { data } = await apiClient.patch<Landmark>(
    `/floors/${floorId}/landmarks/${landmarkId}`,
    input,
  )
  return data
}

export async function deleteLandmark(floorId: string, landmarkId: string): Promise<void> {
  await apiClient.delete(`/floors/${floorId}/landmarks/${landmarkId}`)
}
