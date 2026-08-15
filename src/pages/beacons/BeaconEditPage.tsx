import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useBeacons, useDeleteBeacon, useUpdateBeacon } from '@/features/beacons/hooks'
import type { Beacon } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BEACON_TYPE_LABEL } from '@/lib/constants'

export default function BeaconEditPage() {
  const { buildingId = '', floorId = '', beaconId = '' } = useParams()
  const navigate = useNavigate()
  const { data: building } = useBuilding(buildingId)
  const { data: beacons, isLoading, isError, refetch } = useBeacons(floorId)
  const update = useUpdateBeacon(floorId)
  const del = useDeleteBeacon(floorId)
  const beacon = beacons?.find((b) => b.id === beaconId)

  const backTo = `/buildings/${buildingId}/floors/${floorId}/beacons`

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: '비콘', to: backTo },
    { label: '편집' },
  ]

  if (isLoading)
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <AsyncState status="loading" />
      </div>
    )
  if (isError)
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <AsyncState status="error" onRetry={() => refetch()} />
      </div>
    )
  if (!beacon)
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <AsyncState status="empty" title="비콘을 찾을 수 없습니다." />
      </div>
    )

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>비콘 편집</h1>
      {/* beacon.id로 key를 줘 비콘이 바뀌면 폼이 다시 마운트되며 필드를 새로 초기화한다(useEffect로 동기화하지 않음) */}
      <BeaconEditForm
        key={beacon.id}
        beacon={beacon}
        onSubmit={(input) => update.mutate({ beaconId, input }, { onSuccess: () => navigate(backTo) })}
        onDelete={() => del.mutate(beaconId, { onSuccess: () => navigate(backTo) })}
        onCancel={() => navigate(backTo)}
        submitting={update.isPending}
        deleting={del.isPending}
      />
    </div>
  )
}

function BeaconEditForm({
  beacon,
  onSubmit,
  onDelete,
  onCancel,
  submitting,
  deleting,
}: {
  beacon: Beacon
  onSubmit: (input: {
    name: string
    mac: string | undefined
    minor: number
  }) => void
  onDelete: () => void
  onCancel: () => void
  submitting: boolean
  deleting: boolean
}) {
  const [name, setName] = useState(beacon.name)
  const [mac, setMac] = useState(beacon.mac ?? '')
  const [minor, setMinor] = useState(String(beacon.minor))
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name: name.trim(),
      mac: mac.trim() || undefined,
      minor: Number(minor),
    })
  }

  return (
    <Card style={{ maxWidth: 560, margin: '0 auto' }}>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="고유 번호 (MAC)" placeholder="44:B1:76:1A:13:B2" value={mac} onChange={(e) => setMac(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-[13px] text-muted mb-2">major (자동)</span>
            <div className="h-12 px-4 rounded-lg border border-line bg-field text-sm flex items-center text-muted">
              {beacon.major}
            </div>
          </div>
          <Input label="minor" type="number" value={minor} onChange={(e) => setMinor(e.target.value)} />
        </div>
        <div>
          <span className="block text-[13px] text-muted mb-2">타입</span>
          <div className="h-12 px-4 rounded-lg border border-line bg-field text-sm flex items-center text-muted">
            {BEACON_TYPE_LABEL[beacon.type]}
            {beacon.type === 'reinforcement' && ' (자동생성 — 비콘 목록에서 다시 계산하세요)'}
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            저장
          </Button>
          <Button type="button" variant="danger" disabled={deleting} onClick={() => setConfirmDeleteOpen(true)}>
            삭제
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="비콘을 삭제할까요?"
        description={`'${beacon.name}' — 삭제하면 되돌릴 수 없습니다.`}
        pending={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={onDelete}
      />
    </Card>
  )
}
