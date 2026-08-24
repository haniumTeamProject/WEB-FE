import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { AuthCardShell } from '@/components/layout/AuthCardShell'

// Figma "계정-오류 #1.4" 참고 — 앱 전역 404(잘못된 URL 등)에 공통으로 쓰인다. AuthLayout 바깥의
// 캐치올 라우트(path: '*')라 <Outlet/>을 못 쓰므로, 같은 배경 쉘(AuthCardShell)을 직접 감싼다.
export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <AuthCardShell>
      <div style={{ display: 'grid', gap: 24, justifyItems: 'center', textAlign: 'center' }}>
        <BrowserWindow404 />
        <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>계정을 찾을 수 없습니다.</p>
        <Button onClick={() => navigate(-1)}>이전으로 돌아가기</Button>
      </div>
    </AuthCardShell>
  )
}

// 피그마 일러스트(작은 브라우저 창 안에 주황색 404) 대체 — 이미지 에셋 없이 순수 CSS로 흉내낸다.
function BrowserWindow404() {
  return (
    <div style={{ width: 220, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(75,112,229,0.25)' }}>
      <div style={{ height: 18, background: '#DCEBFF', display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px' }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: '#F2992E' }} />
        <span style={{ width: 6, height: 6, borderRadius: 999, background: '#4BAE72' }} />
        <span style={{ width: 6, height: 6, borderRadius: 999, background: '#4B70E5' }} />
      </div>
      <div style={{ background: '#4B70E5', padding: '28px 0', display: 'grid', placeItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 40, fontWeight: 800, color: '#F2992E', letterSpacing: 1 }}>404</span>
        <span style={{ width: 60, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.6)' }} />
        <span style={{ display: 'flex', gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.6)' }} />
          <span style={{ width: 5, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.6)' }} />
          <span style={{ width: 5, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.6)' }} />
        </span>
      </div>
    </div>
  )
}
