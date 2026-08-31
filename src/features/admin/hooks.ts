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
    // TopBar는 이 쿼리가 아니라 로그인 시 저장해둔 localStorage를 그대로 보여준다 — 여기서 쿼리만
    // invalidate하면 계정 화면 안에서는 새 값이 보여도 TopBar는 로그인 때 값 그대로 남는다(실제
    // 발견된 문제: 프로필을 저장해도 업데이트 안 된 것처럼 보임). 저장 성공 시 localStorage도 같이 갱신한다.
    onSuccess: (admin) => {
      qc.invalidateQueries({ queryKey: currentAdminKey })
      localStorage.setItem('adminEmail', admin.email)
      localStorage.setItem('adminName', admin.name)
      localStorage.setItem('adminRole', admin.role)
    },
  })
}
