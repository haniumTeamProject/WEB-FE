import { useMutation } from '@tanstack/react-query'
import { login, signup } from './api'
import { fetchCurrentAdmin } from '@/features/admin/api'

export function useLogin() {
  return useMutation({
    mutationFn: login,
    // 로그인 응답엔 accessToken만 있고 관리자 프로필(이메일·이름·역할)은 없다(실서버 API 명세 확인)
    // — TopBar에 쓸 정보는 토큰을 저장한 직후 /admin/me로 따로 받아온다.
    onSuccess: async (data) => {
      localStorage.setItem('accessToken', data.accessToken)
      const admin = await fetchCurrentAdmin()
      localStorage.setItem('adminEmail', admin.email)
      localStorage.setItem('adminName', admin.name)
      localStorage.setItem('adminRole', admin.role)
    },
  })
}

export function useSignup() {
  return useMutation({ mutationFn: signup })
}
