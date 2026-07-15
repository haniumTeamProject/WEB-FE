export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
}

export interface SignupRequest {
  email: string
  password: string
  name: string
  org: string // 소속 기관
  // officialDoc(공문 파일)은 multipart 로 별도 전송
}
