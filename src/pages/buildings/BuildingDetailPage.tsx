import { useParams } from 'react-router-dom'
import { useBuilding, useFloors } from '@/features/buildings/hooks'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'

// Figma "건물 상세" — 건물 정보 + 층 목록(상태 뱃지) + 세팅 진입
export default function BuildingDetailPage() {
  const { buildingId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>건물 상세</h1>
      <Card>
        <h2 style={{ marginTop: 0 }}>{building?.name ?? buildingId}</h2>
        <p style={{ color: '#8C99B3' }}>{building?.address}</p>
        <h3>층 목록</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {floors?.map((f) => (
            <div
              key={f.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>
                {f.floor}층 · major {f.major}
              </span>
              {f.status && <StatusBadge status={f.status} />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
