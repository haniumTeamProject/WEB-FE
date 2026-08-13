import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCurrentAdmin, fetchPendingAdmins, updateAdminStatus, updateCurrentAdmin } from './api'

const currentAdminKey = ['admin', 'me']

const pendingKey = ['admin', 'accounts', 'pending']

export function usePendingAdmins() {
  return useQuery({ queryKey: pendingKey, queryFn: fetchPendingAdmins })
}

export function useApproveAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => updateAdminStatus(id, { status: 'active' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pendingKey }),
  })
}

export function useRejectAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => updateAdminStatus(id, { status: 'rejected' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pendingKey }),
  })
}

export function useCurrentAdmin() {
  return useQuery({ queryKey: currentAdminKey, queryFn: fetchCurrentAdmin })
}

export function useUpdateCurrentAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateCurrentAdmin,
    onSuccess: () => qc.invalidateQueries({ queryKey: currentAdminKey }),
  })
}
