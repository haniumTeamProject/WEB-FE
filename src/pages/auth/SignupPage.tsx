import { Link } from 'react-router-dom'

// TODO: Figma "계정-회원가입" — 이메일/이름/비밀번호/소속 기관/기관 공문(파일 업로드) + zod 검증
export default function SignupPage() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ textAlign: 'center', margin: 0 }}>계정 생성</h1>
      <p style={{ textAlign: 'center', color: '#8C99B3' }}>회원가입 폼 (구현 예정)</p>
      <p style={{ textAlign: 'center', fontSize: 14 }}>
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </div>
  )
}
