import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMask, fetchPathNodes, fetchScale, saveMask, savePathNodes, saveScale } from './api'
import type { FloorMask, FloorScale, PathNodesData } from './api'

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

export function usePathNodes(floorId: string) {
  return useQuery({
    queryKey: ['pathNodes', floorId],
    queryFn: () => fetchPathNodes(floorId),
    enabled: !!floorId,
  })
}

export function useSavePathNodes(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pathNodes: PathNodesData) => savePathNodes(floorId, pathNodes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pathNodes', floorId] })
      qc.invalidateQueries({ queryKey: ['buildings'] }) // 층 상태 갱신
    },
  })
}
