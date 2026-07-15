import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBuildings, useDeleteBuilding } from '@/features/buildings/hooks'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Breadcrumb } from '@/components/layout/Breadcrumb'

// 건물 목록/관리 — 등록·삭제·상세 진입
export default function BuildingManagePage() {
  const { data, isLoading, isError } = useBuildings()
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

      {isLoading && <p>불러오는 중…</p>}
      {isError && <p>불러오기 실패</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {data?.map((b) => (
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
          <Card style={{ textAlign: 'center', color: '#8C99B3', padding: 48 }}>
            등록된 건물이 없습니다. 우측 상단 &lsquo;건물 등록&rsquo;으로 시작하세요.
          </Card>
        )}
      </div>

      <Modal open={!!target} onClose={() => setTarget(null)}>
        <h2 style={{ marginTop: 0 }}>건물을 삭제할까요?</h2>
        <p style={{ color: '#8C99B3' }}>
          &lsquo;{target?.name}&rsquo; — 삭제하면 되돌릴 수 없습니다. 등록된 층·비콘·설계도가 모두 삭제됩니다.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <Button variant="outline" onClick={() => setTarget(null)}>
            취소
          </Button>
          <Button
            variant="danger"
            disabled={del.isPending}
            onClick={() => {
              if (target) del.mutate(target.id, { onSuccess: () => setTarget(null) })
            }}
          >
            삭제
          </Button>
        </div>
      </Modal>
    </div>
  )
}
