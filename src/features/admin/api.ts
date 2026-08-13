import { apiClient } from '@/lib/apiClient'
import type { Admin } from '@/types/domain'
import type { UpdateAdminProfileInput, UpdateAdminStatusInput } from './types'

export async function fetchPendingAdmins(): Promise<Admin[]> {
  const { data } = await apiClient.get<Admin[]>('/admin/accounts', {
    params: { status: 'pending' },
  })
  return data
}

export async function updateAdminStatus(id: string, input: UpdateAdminStatusInput): Promise<Admin> {
  const { data } = await apiClient.patch<Admin>(`/admin/accounts/${id}`, input)
  return data
}

export async function fetchCurrentAdmin(): Promise<Admin> {
  const { data } = await apiClient.get<Admin>('/admin/me')
  return data
}

export async function updateCurrentAdmin(input: UpdateAdminProfileInput): Promise<Admin> {
  const { data } = await apiClient.patch<Admin>('/admin/me', input)
  return data
}
