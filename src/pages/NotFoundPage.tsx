import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

// Figma "계정-오류 #1.4" 참고 — 앱 전역 404(잘못된 URL 등)에 공통으로 쓰인다.
export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', gap: 16 }}>
      <div>
        <div style={{ fontSize: 56, fontWeight: 800, color: '#F2992E' }}>404</div>
        <p style={{ fontWeight: 700, marginTop: 8 }}>페이지를 찾을 수 없습니다.</p>
      </div>
      <Button onClick={() => navigate(-1)}>이전으로 돌아가기</Button>
    </div>
  )
}
