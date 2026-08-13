import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBuildings, useDeleteBuilding } from '@/features/buildings/hooks'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'

// 건물 목록/관리 — 등록·삭제·상세 진입
export default function BuildingManagePage() {
  const { data, isLoading, isError, refetch } = useBuildings()
  const del = useDeleteBuilding()
  const navigate = useNavigate()
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)

  return (
    <div>
      <Breadcrumb items={[{ label: '홈', to: '/' }, { label: '건물 관리' }]} />
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}
      >
        <h1 style={{ margin: 0 }}>건물 관리</h1>
        <Button onClick={() => navigate('/buildings/new')}>건물 등록</Button>
      </div>

      {isLoading && <AsyncState status="loading" />}
      {isError && <AsyncState status="error" onRetry={() => refetch()} />}

      <div style={{ display: 'grid', gap: 12 }}>
        {!isLoading && !isError && data?.map((b) => (
          <Card
            key={b.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Link
              to={`/buildings/${b.id}`}
              style={{ fontWeight: 700, color: 'inherit', textDecoration: 'none', flex: 1 }}
            >
              {b.name}
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {b.status && <StatusBadge status={b.status} />}
              <span style={{ color: '#8C99B3' }}>{b.floorCount ?? 0}개 층</span>
              <button
                onClick={() => setTarget({ id: b.id, name: b.name })}
                style={{ border: 'none', background: 'none', color: '#DC4C4C', cursor: 'pointer', fontSize: 14 }}
              >
                삭제
              </button>
            </div>
          </Card>
        ))}
        {data && data.length === 0 && (
          <div className="text-center py-10">
            <p className="font-semibold text-ink">등록된 건물이 없습니다.</p>
            <p className="text-sm text-muted mt-1">우측 상단 '건물 등록' 버튼을 이용하여 건물을 추가하세요.</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!target}
        title="건물을 삭제할까요?"
        description={`'${target?.name}' — 삭제하면 되돌릴 수 없습니다. 등록된 층·비콘·설계도가 모두 삭제됩니다.`}
        pending={del.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          if (target) del.mutate(target.id, { onSuccess: () => setTarget(null) })
        }}
      />
    </div>
  )
}
