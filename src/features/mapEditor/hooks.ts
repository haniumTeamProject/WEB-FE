import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMask, saveMask } from './api'
import type { FloorMask } from './api'

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
