import { apiClient } from '@/lib/apiClient'
import type { LoginRequest, LoginResponse, SignupRequest } from './types'

export async function login(body: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/admin/auth/login', body)
  return data
}

export async function signup(body: SignupRequest): Promise<void> {
  await apiClient.post('/admin/auth/signup', body)
}
