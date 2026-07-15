import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBuilding,
  deleteBuilding,
  fetchBuilding,
  fetchBuildings,
  updateBuilding,
} from './api'
import type { UpdateBuildingInput } from './types'

export function useBuildings() {
  return useQuery({ queryKey: ['buildings'], queryFn: fetchBuildings })
}

export function useBuilding(id: string) {
  return useQuery({
    queryKey: ['buildings', id],
    queryFn: () => fetchBuilding(id),
    enabled: !!id,
  })
}

export function useCreateBuilding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createBuilding,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  })
}

export function useUpdateBuilding(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateBuildingInput) => updateBuilding(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  })
}

export function useDeleteBuilding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteBuilding,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  })
}
