import type { AdminRole } from '@/types/domain'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  email: string
  name: string
  role: AdminRole
}

export interface SignupRequest {
  email: string
  password: string
  name: string
  org: string // 소속 기관
  officialDocUrl: string // 기관 공문(직인) — base64 data URL
}
