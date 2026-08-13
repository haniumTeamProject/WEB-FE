import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLogin } from '@/features/auth/hooks'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// Figma "계정-로그인 #1.1" / "로그인 실패 #1.1b"
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const navigate = useNavigate()
  const login = useLogin()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => navigate('/') })
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0 }}>계정 로그인</h1>
        <p style={{ color: '#8C99B3', fontSize: 14, marginTop: 4 }}>이메일과 비밀번호를 입력하세요.</p>
      </div>
      <Input
        label="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="admin@ac.kr"
      />
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: '#8C99B3' }}>비밀번호</span>
          <span style={{ fontSize: 12, color: '#8C99B3' }} title="준비 중인 기능입니다">
            비밀번호를 잊으셨나요?
          </span>
        </div>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8C99B3', cursor: 'pointer' }}>
        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
        계정 저장
      </label>
      {login.isError && (
        <p style={{ background: '#FBE6E6', color: '#DC4C4C', fontSize: 13, padding: '10px 12px', borderRadius: 8, margin: 0 }}>
          이메일 또는 비밀번호가 올바르지 않습니다.
        </p>
      )}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? '로그인 중…' : '로그인'}
      </Button>
      <p style={{ textAlign: 'center', fontSize: 14 }}>
        계정이 없나요? <Link to="/signup">회원가입</Link>
      </p>
    </form>
  )
}
