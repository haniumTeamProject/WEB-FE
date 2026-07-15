import { apiClient } from '@/lib/apiClient'
import type { Building, Floor } from '@/types/domain'

export async function fetchBuildings(): Promise<Building[]> {
  const { data } = await apiClient.get<Building[]>('/buildings')
  return data
}

export async function fetchBuilding(buildingId: string): Promise<Building> {
  const { data } = await apiClient.get<Building>(`/buildings/${buildingId}`)
  return data
}

export async function fetchFloors(buildingId: string): Promise<Floor[]> {
  const { data } = await apiClient.get<Floor[]>(`/buildings/${buildingId}/floors`)
  return data
}
