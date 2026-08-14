import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMask, fetchScale, saveMask, saveScale } from './api'
import type { FloorMask, FloorScale } from './api'

export function useMask(floorId: string) {
  return useQuery({
    queryKey: ['mask', floorId],
    queryFn: () => fetchMask(floorId),
    enabled: !!floorId,
  })
}

export function useSaveMask(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mask: FloorMask) => saveMask(floorId, mask),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mask', floorId] })
      qc.invalidateQueries({ queryKey: ['buildings'] }) // 층 상태 갱신
    },
  })
}

export function useScale(floorId: string) {
  return useQuery({
    queryKey: ['scale', floorId],
    queryFn: () => fetchScale(floorId),
    enabled: !!floorId,
  })
}

export function useSaveScale(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scale: FloorScale) => saveScale(floorId, scale),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scale', floorId] })
      qc.invalidateQueries({ queryKey: ['buildings'] }) // 층 상태 갱신
    },
  })
}
