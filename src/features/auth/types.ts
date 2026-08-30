export interface LoginRequest {
  email: string
  password: string
}

// 실서버(docs/backend-api-db-guide.md 기준) 로그인 응답은 accessToken만 내려준다 — 관리자
// 프로필(이메일·이름·역할)은 로그인 응답에 없으니 /admin/me로 별도 조회해야 한다(실제 발견된 문제:
// 로그인 응답에 없는 필드를 있다고 가정하고 읽어서 TopBar에 "undefined"가 찍혔었다).
export interface LoginResponse {
  accessToken: string
}

export interface SignupRequest {
  email: string
  password: string
  name: string
  org: string // 소속 기관
  officialDocUrl: string // 기관 공문(직인) — base64 data URL
}
