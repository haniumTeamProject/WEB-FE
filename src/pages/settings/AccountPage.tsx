import { useState } from 'react'
import { useCurrentAdmin, useUpdateCurrentAdmin } from '@/features/admin/hooks'
import type { Admin } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { AsyncState } from '@/components/ui/AsyncState'

// Figma "계정 #9.2" — 프로필 + 비밀번호 변경
export default function AccountPage() {
  const { data: admin, isLoading, isError, refetch } = useCurrentAdmin()

  return (
    <div>
      <h1>계정</h1>
      <Card className="mt-6">
        <h3>프로필</h3>
        {isLoading && <AsyncState status="loading" />}
        {isError && <AsyncState status="error" onRetry={() => refetch()} />}
        {/* admin.id로 key를 줘 대상이 바뀌면 폼이 다시 마운트되며 필드를 새로 초기화한다(useEffect로 동기화하지 않음) */}
        {admin && <AccountForm key={admin.id} admin={admin} />}
      </Card>
    </div>
  )
}

function AccountForm({ admin }: { admin: Admin }) {
  const update = useUpdateCurrentAdmin()

  const [name, setName] = useState(admin.name)
  const [email, setEmail] = useState(admin.email)
  const [org, setOrg] = useState(admin.org)
  const [saved, setSaved] = useState(false)

  function onSave() {
    update.mutate(
      { name: name.trim(), email: email.trim(), org: org.trim() },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      },
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="이메일" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="소속 기관" value={org} onChange={(e) => setOrg(e.target.value)} />
        <Input label="역할" value={admin.role === 'super_admin' ? '슈퍼관리자' : '관리자'} disabled />
      </div>
      {/* 비밀번호 변경 흐름(별도 화면)은 아직 없어 버튼만 배치 — 클릭해도 동작 없음 */}
      <Button type="button" variant="outline" className="mt-6" disabled title="준비 중인 기능입니다">
        비밀번호 변경
      </Button>
      <div>
        <Button className="mt-3" disabled={update.isPending} onClick={onSave}>
          저장
        </Button>
      </div>
      {saved && <p className="text-[13px] text-muted mt-2">저장됐습니다.</p>}
    </>
  )
}
