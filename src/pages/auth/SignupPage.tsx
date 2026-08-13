import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useSignup } from '@/features/auth/hooks'
import { readFileAsDataURL } from '@/lib/file'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// 소속·담당 건물 둘 다 정책(1.1 회원가입)상 필수 첨부 항목이라 와이어프레임에 없어도 유지한다.
const schema = z
  .object({
    email: z.string().min(1, '이메일을 입력하세요').email('올바른 이메일 형식이 아닙니다'),
    password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
    passwordConfirm: z.string().min(1, '비밀번호를 다시 입력하세요'),
    name: z.string().min(1, '이름을 입력하세요'),
    org: z.string().min(1, '소속 기관을 입력하세요'),
    building: z.string().min(1, '담당 건물을 입력하세요'),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: '비밀번호가 일치하지 않습니다',
    path: ['passwordConfirm'],
  })
type FormValues = z.infer<typeof schema>

// Figma "계정-회원가입 #1.2" / "회원가입 오류 #1.2b"
export default function SignupPage() {
  const navigate = useNavigate()
  const signup = useSignup()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    if (!file) {
      setFileError('기관 공문이 필요합니다. 첨부해 주세요')
      return
    }
    setFileError('')
    const officialDocUrl = await readFileAsDataURL(file)
    signup.mutate(
      {
        email: values.email,
        password: values.password,
        name: values.name,
        org: values.org,
        building: values.building,
        officialDocUrl,
      },
      {
        onSuccess: () => navigate('/pending'),
        onError: () => setError('email', { message: '이미 사용 중인 이메일입니다' }),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0 }}>회원가입</h1>
        <p style={{ color: '#8C99B3', fontSize: 14, marginTop: 4 }}>로그인 하면 모든 서비스를 이용할 수 있습니다.</p>
      </div>
      <Input label="이메일" placeholder="admin@ac.kr" error={errors.email?.message} {...register('email')} />
      <Input label="비밀번호" type="password" error={errors.password?.message} {...register('password')} />
      <Input
        label="비밀번호 확인"
        type="password"
        error={errors.passwordConfirm?.message}
        {...register('passwordConfirm')}
      />
      <Input label="이름" placeholder="Username" error={errors.name?.message} {...register('name')} />
      <Input
        label="소속 기관"
        placeholder="예: 수원대학교 시설관리팀"
        error={errors.org?.message}
        {...register('org')}
      />
      <Input
        label="담당 건물"
        placeholder="예: ICT융합대학"
        error={errors.building?.message}
        {...register('building')}
      />
      <div>
        <span style={{ display: 'block', fontSize: 13, color: '#8C99B3', marginBottom: 8 }}>
          기관 공문 (직인 포함)
        </span>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 48,
            padding: '0 16px',
            borderRadius: 8,
            border: '1px solid #DEE2EB',
            background: '#F5F7FB',
            fontSize: 14,
            cursor: 'pointer',
            color: file ? '#1A2233' : '#8C99B3',
          }}
        >
          📎 {file ? file.name : '공문 파일 업로드 (PDF/PNG)'}
          <input
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {fileError && (
          <span style={{ display: 'block', color: '#DC4C4C', fontSize: 12, marginTop: 4 }}>{fileError}</span>
        )}
      </div>
      <Button type="submit" disabled={signup.isPending}>
        {signup.isPending ? '제출 중…' : '회원가입'}
      </Button>
      <p style={{ textAlign: 'center', fontSize: 14 }}>
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </form>
  )
}
