import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useBuildings } from '@/features/buildings/hooks'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { floorStatusBadge } from '@/lib/constants'
import { AsyncState } from '@/components/ui/AsyncState'

function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <div style={{ fontSize: 13, color: '#8C99B3' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#1A2233', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: '#8C99B3', marginTop: 4 }}>{hint}</div>}
    </Card>
  )
}

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useBuildings()
  const buildings = data ?? []
  const totalFloors = buildings.reduce((sum, b) => sum + (b.floorCount ?? 0), 0)
  const ready = buildings.filter((b) => b.status === 'ready').length
  const inProgress = buildings.length - ready

  return (
    <div>
      <Breadcrumb items={[{ label: '홈', to: '/' }, { label: '대시보드' }]} />
      <h1>대시보드</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard label="총 건물" value={buildings.length} hint="등록된 건물 수" />
        <StatCard label="총 층" value={totalFloors} hint="건물별 층 합계" />
        <StatCard label="안내 가능" value={ready} hint="세팅 완료 건물" />
        <StatCard label="세팅 필요" value={inProgress} hint="진행 중 건물" />
      </div>

      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '28px 0 12px' }}
      >
        <h2 style={{ margin: 0 }}>최근 건물</h2>
        <Link to="/buildings">건물 관리 →</Link>
      </div>

      {isLoading && <AsyncState status="loading" />}
      {isError && <AsyncState status="error" onRetry={() => refetch()} />}

      <div style={{ display: 'grid', gap: 8 }}>
        {!isLoading && !isError && buildings.slice(0, 5).map((b) => (
          <Link
            key={b.id}
            to={`/buildings/${b.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Card
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}
            >
              <span style={{ fontWeight: 600 }}>{b.name}</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: floorStatusBadge(b.status).fg,
                }}
              >
                {floorStatusBadge(b.status).label}
              </span>
            </Card>
          </Link>
        ))}
        {!isLoading && !isError && buildings.length === 0 && (
          <AsyncState
            status="empty"
            title="등록된 건물이 없습니다."
            action={
              <Link to="/buildings/new">
                <Button>건물 등록</Button>
              </Link>
            }
          />
        )}
      </div>
    </div>
  )
}
