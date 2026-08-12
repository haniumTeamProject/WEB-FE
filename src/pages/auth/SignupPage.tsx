import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useSignup } from '@/features/auth/hooks'
import { readFileAsDataURL } from '@/lib/file'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

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

export default function SignupPage() {
  const navigate = useNavigate()
  const signup = useSignup()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [submitError, setSubmitError] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setSubmitError(false)
    if (!file) {
      setFileError('기관 공문 파일을 첨부하세요')
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
        onError: () => setSubmitError(true),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ textAlign: 'center', margin: 0 }}>계정 생성</h1>
      <Input label="이메일" placeholder="admin@ac.kr" error={errors.email?.message} {...register('email')} />
      <Input
        label="비밀번호"
        type="password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        label="비밀번호 확인"
        type="password"
        error={errors.passwordConfirm?.message}
        {...register('passwordConfirm')}
      />
      <Input label="이름" error={errors.name?.message} {...register('name')} />
      <Input
        label="소속 기관"
        placeholder="수원대학교 ICT융합대학"
        error={errors.org?.message}
        {...register('org')}
      />
      <Input
        label="담당 건물"
        placeholder="ICT융합대학"
        error={errors.building?.message}
        {...register('building')}
      />
      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 13, color: '#8C99B3', marginBottom: 8 }}>
          기관 공문(직인 포함)
        </span>
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {fileError && (
          <span style={{ display: 'block', color: '#DC4C4C', fontSize: 12, marginTop: 4 }}>
            {fileError}
          </span>
        )}
      </label>
      {submitError && (
        <span style={{ color: '#DC4C4C', fontSize: 13 }}>
          가입 신청에 실패했습니다. 이미 등록된 이메일인지 확인해 주세요.
        </span>
      )}
      <Button type="submit" disabled={signup.isPending}>
        {signup.isPending ? '제출 중…' : '가입 신청'}
      </Button>
      <p style={{ textAlign: 'center', fontSize: 14 }}>
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </form>
  )
}
