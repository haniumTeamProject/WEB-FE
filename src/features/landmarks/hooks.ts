import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLandmark, deleteLandmark, fetchLandmarks, updateLandmark } from './api'
import type { CreateLandmarkInput, UpdateLandmarkInput } from './api'

const key = (floorId: string) => ['floors', floorId, 'landmarks']

export function useLandmarks(floorId: string) {
  return useQuery({
    queryKey: key(floorId),
    queryFn: () => fetchLandmarks(floorId),
    enabled: !!floorId,
  })
}

export function useCreateLandmark(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLandmarkInput) => createLandmark(floorId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(floorId) }),
  })
}

export function useUpdateLandmark(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { landmarkId: string; input: UpdateLandmarkInput }) =>
      updateLandmark(floorId, vars.landmarkId, vars.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(floorId) }),
  })
}

export function useDeleteLandmark(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (landmarkId: string) => deleteLandmark(floorId, landmarkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(floorId) }),
  })
}
