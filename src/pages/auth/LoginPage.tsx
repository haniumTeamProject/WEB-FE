import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLogin } from '@/features/auth/hooks'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const login = useLogin()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => navigate('/') })
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ textAlign: 'center', margin: 0 }}>계정 로그인</h1>
      <Input label="이메일" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@ac.kr" />
      <Input
        label="비밀번호"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {login.isError && (
        <span style={{ color: '#DC4C4C', fontSize: 13 }}>이메일 또는 비밀번호가 올바르지 않습니다.</span>
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
