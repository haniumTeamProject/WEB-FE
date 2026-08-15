import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCreateFloor, useDeleteFloor, useFloors } from '@/features/floors/hooks'
import { useBuilding } from '@/features/buildings/hooks'
import { majorForFloor } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export default function FloorManagePage() {
  const { buildingId = '' } = useParams()
  const { data: floors, isLoading: floorsLoading, isError: floorsError, refetch: refetchFloors } = useFloors(buildingId)
  const { data: building } = useBuilding(buildingId)
  const createFloor = useCreateFloor(buildingId)
  const deleteFloor = useDeleteFloor(buildingId)
  const [floorNo, setFloorNo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null)

  const parsed = Number(floorNo)
  const isPositiveInt = floorNo !== '' && Number.isInteger(parsed) && parsed >= 1
  const isDuplicate = isPositiveInt && (floors ?? []).some((f) => f.floor === parsed)
  const valid = isPositiveInt && !isDuplicate

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    createFloor.mutate(parsed, { onSuccess: () => setFloorNo('') })
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: '홈', to: '/' },
          { label: '건물 관리', to: '/buildings' },
          { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
          { label: '층 관리' },
        ]}
      />
      <h1>층 관리</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>층 추가</h3>
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
            <Input
              label="층 번호"
              type="number"
              placeholder="4"
              value={floorNo}
              onChange={(e) => setFloorNo(e.target.value)}
            />
            <div style={{ fontSize: 13, color: '#8C99B3' }}>
              major (자동): <strong>{isPositiveInt ? majorForFloor(parsed) : '—'}</strong>
            </div>
            {isDuplicate && (
              <p style={{ fontSize: 13, color: '#DC4C4C', margin: 0 }}>이미 등록된 층입니다.</p>
            )}
            <Button type="submit" disabled={!valid || createFloor.isPending} style={{ width: 160 }}>
              층 추가
            </Button>
          </form>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>등록된 층</h3>
          {floorsLoading && <AsyncState status="loading" />}
          {floorsError && <AsyncState status="error" onRetry={() => refetchFloors()} />}
          <div style={{ display: 'grid', gap: 8 }}>
            {!floorsLoading && !floorsError && floors?.map((f) => (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  border: '1px solid #E6E8F0',
                  borderRadius: 8,
                }}
              >
                <Link
                  to={`/buildings/${buildingId}/floors/${f.id}/floorplan`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                  onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  {f.floor}층 · major {f.major}
                </Link>
                <Button
                  variant="danger"
                  style={{ height: 36, padding: '0 14px' }}
                  disabled={deleteFloor.isPending}
                  onClick={() => setDeleteTarget({ id: f.id, label: `${f.floor}층 · major ${f.major}` })}
                >
                  삭제
                </Button>
              </div>
            ))}
            {floors && floors.length === 0 && <AsyncState status="empty" title="등록된 층이 없습니다." />}
          </div>
          <p style={{ color: '#8C99B3', fontSize: 13, marginTop: 12 }}>
            major는 100+층으로 자동 부여됩니다.
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="층을 삭제할까요?"
        description={`'${deleteTarget?.label}' — 삭제하면 되돌릴 수 없습니다. 이 층의 설계도·지도 검수·목적지·비콘·경로노드가 모두 삭제됩니다.`}
        pending={deleteFloor.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteFloor.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })
        }}
      />
    </div>
  )
}
