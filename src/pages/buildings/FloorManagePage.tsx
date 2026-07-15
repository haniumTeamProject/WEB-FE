import { useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useCreateFloor, useDeleteFloor, useFloors } from '@/features/floors/hooks'
import { useBuilding } from '@/features/buildings/hooks'
import { majorForFloor } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'

export default function FloorManagePage() {
  const { buildingId = '' } = useParams()
  const { data: floors } = useFloors(buildingId)
  const { data: building } = useBuilding(buildingId)
  const createFloor = useCreateFloor(buildingId)
  const deleteFloor = useDeleteFloor(buildingId)
  const [floorNo, setFloorNo] = useState('')

  const parsed = Number(floorNo)
  const valid = floorNo !== '' && Number.isInteger(parsed) && parsed >= 1

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
              major (자동): <strong>{valid ? majorForFloor(parsed) : '—'}</strong>
            </div>
            <Button type="submit" disabled={!valid || createFloor.isPending} style={{ width: 160 }}>
              층 추가
            </Button>
          </form>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>등록된 층</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {floors?.map((f) => (
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
                <span>
                  {f.floor}층 · major {f.major}
                </span>
                <Button
                  variant="danger"
                  style={{ height: 36, padding: '0 14px' }}
                  disabled={deleteFloor.isPending}
                  onClick={() => deleteFloor.mutate(f.id)}
                >
                  삭제
                </Button>
              </div>
            ))}
            {floors && floors.length === 0 && (
              <p style={{ color: '#8C99B3' }}>등록된 층이 없습니다.</p>
            )}
          </div>
          <p style={{ color: '#8C99B3', fontSize: 13, marginTop: 12 }}>
            major는 100+층으로 자동 부여됩니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
