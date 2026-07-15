import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFloor, deleteFloor, fetchFloors } from './api'

export function useFloors(buildingId: string) {
  return useQuery({
    queryKey: ['buildings', buildingId, 'floors'],
    queryFn: () => fetchFloors(buildingId),
    enabled: !!buildingId,
  })
}

export function useCreateFloor(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (floor: number) => createFloor(buildingId, floor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings', buildingId, 'floors'] }),
  })
}

export function useDeleteFloor(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (floorId: string) => deleteFloor(buildingId, floorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings', buildingId, 'floors'] }),
  })
}
