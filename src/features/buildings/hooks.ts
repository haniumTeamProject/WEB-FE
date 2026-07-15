import { useQuery } from '@tanstack/react-query'
import { fetchBuilding, fetchBuildings, fetchFloors } from './api'

export function useBuildings() {
  return useQuery({ queryKey: ['buildings'], queryFn: fetchBuildings })
}

export function useBuilding(buildingId: string) {
  return useQuery({
    queryKey: ['buildings', buildingId],
    queryFn: () => fetchBuilding(buildingId),
    enabled: !!buildingId,
  })
}

export function useFloors(buildingId: string) {
  return useQuery({
    queryKey: ['buildings', buildingId, 'floors'],
    queryFn: () => fetchFloors(buildingId),
    enabled: !!buildingId,
  })
}
