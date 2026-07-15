import { Link } from 'react-router-dom'
import { useBuildings } from '@/features/buildings/hooks'
import { Card } from '@/components/ui/Card'

export default function DashboardPage() {
  const { data, isLoading, isError } = useBuildings()

  return (
    <div>
      <h1 style={{ marginTop: 0, marginBottom: 20 }}>대시보드</h1>
      {isLoading && <p>불러오는 중…</p>}
      {isError && <p>불러오기 실패</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {data?.map((b) => (
          <Link
            key={b.id}
            to={`/buildings/${b.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{b.name}</strong>
              <span style={{ color: '#8C99B3' }}>{b.floorCount ?? 0}개 층</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
