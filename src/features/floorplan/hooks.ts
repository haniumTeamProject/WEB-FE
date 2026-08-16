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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floorplan', floorId] })
      // 설계도를 지우면 서버가 그 설계도 기준 통행영역·축척도 같이 지운다 — 캐시도 함께 무효화한다.
      qc.invalidateQueries({ queryKey: ['mask', floorId] })
      qc.invalidateQueries({ queryKey: ['scale', floorId] })
      // 경로노드는 localStorage에 저장돼 있어 서버 삭제로는 안 지워진다 — 옛 설계도 기준 위치가 새
      // 설계도 위에 그대로 복원되지 않도록 여기서 같이 지운다.
      localStorage.removeItem(`pathNodes:${floorId}`)
    },
  })
}
