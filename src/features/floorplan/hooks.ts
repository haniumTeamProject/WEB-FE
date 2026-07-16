import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteFloorplan, fetchFloorplan, uploadFloorplan } from './api'

export function useFloorplan(floorId: string) {
  return useQuery({
    queryKey: ['floorplan', floorId],
    queryFn: () => fetchFloorplan(floorId),
    enabled: !!floorId,
  })
}

export function useUploadFloorplan(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (imageUrl: string) => uploadFloorplan(floorId, imageUrl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floorplan', floorId] })
      qc.invalidateQueries({ queryKey: ['buildings'] }) // 층 상태 뱃지 갱신
    },
  })
}

export function useDeleteFloorplan(floorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => deleteFloorplan(floorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['floorplan', floorId] }),
  })
}
