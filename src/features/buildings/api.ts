import { apiClient } from '@/lib/apiClient'
import type { Building } from '@/types/domain'
import type { CreateBuildingInput, UpdateBuildingInput } from './types'

export async function fetchBuildings(): Promise<Building[]> {
  const { data } = await apiClient.get<Building[]>('/buildings')
  return data
}

export async function fetchBuilding(id: string): Promise<Building> {
  const { data } = await apiClient.get<Building>(`/buildings/${id}`)
  return data
}

export async function createBuilding(input: CreateBuildingInput): Promise<Building> {
  const { data } = await apiClient.post<Building>('/buildings', input)
  return data
}

export async function updateBuilding(id: string, input: UpdateBuildingInput): Promise<Building> {
  const { data } = await apiClient.patch<Building>(`/buildings/${id}`, input)
  return data
}

export async function deleteBuilding(id: string): Promise<void> {
  await apiClient.delete(`/buildings/${id}`)
}
