import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Providers } from '@/app/providers'

// 개발 모드 + VITE_USE_MOCK !== 'false' 일 때만 MSW(가짜 API) 기동.
// 실서버(Spring Boot) 붙일 땐 .env.local 에서 VITE_USE_MOCK=false 로 끄면 됨.
async function enableMocking() {
  if (!import.meta.env.DEV) return
  if (import.meta.env.VITE_USE_MOCK === 'false') return
  const { worker } = await import('@/mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers />
    </StrictMode>,
  )
})
