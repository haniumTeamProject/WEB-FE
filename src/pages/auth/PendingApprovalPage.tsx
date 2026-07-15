import { Link } from 'react-router-dom'

// Figma "승인 대기" — 공문 검토 중 안내
export default function PendingApprovalPage() {
  return (
    <div style={{ textAlign: 'center', display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>승인 대기 중입니다</h1>
      <p style={{ color: '#8C99B3' }}>
        제출하신 기관 공문(직인)을 검토하고 있습니다. 승인 완료 시 이메일로 안내드립니다.
      </p>
      <Link to="/login">로그인 화면으로</Link>
    </div>
  )
}
