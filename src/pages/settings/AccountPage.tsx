import { useState } from 'react'
import { useUpdateCurrentAdmin } from '@/features/admin/hooks'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// Figma "계정 #9.2" — 프로필 + 비밀번호 변경
export default function AccountPage() {
  const update = useUpdateCurrentAdmin()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [org, setOrg] = useState('')
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
    <div>
      <h1>계정</h1>
      <Card className="mt-6">
        <h3>프로필</h3>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="이메일" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="소속 기관" value={org} onChange={(e) => setOrg(e.target.value)} />
          <Input label="역할" placeholder="관리자" />
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
      </Card>
    </div>
  )
}
