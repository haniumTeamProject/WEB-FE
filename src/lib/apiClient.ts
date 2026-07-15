import axios from 'axios'

// 실서버 전환 시 .env 의 VITE_API_BASE_URL 만 바꾸면 됨.
// 미설정 시 '/api' → MSW(mocks) 가 가로챔.
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})

// 요청 인터셉터: 토큰 자동 첨부
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 응답 인터셉터: 401 → 로그인으로
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken')
      if (location.pathname !== '/login') location.href = '/login'
    }
    return Promise.reject(error)
  },
)
