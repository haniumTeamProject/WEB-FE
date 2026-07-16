import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Breadcrumb } from '@/components/layout/Breadcrumb'

// Figma "건물 상세" — 건물 정보 + 층 목록(상태 뱃지) + 세팅 진입
export default function BuildingDetailPage() {
  const { buildingId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)

  return (
    <div>
      <Breadcrumb
        items={[
          { label: '홈', to: '/' },
          { label: '건물 관리', to: '/buildings' },
          { label: building?.name ?? '건물 상세' },
        ]}
      />
      <h1>건물 상세</h1>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginTop: 0 }}>{building?.name ?? buildingId}</h2>
            <p style={{ color: '#8C99B3' }}>
              {building?.code} · {building?.address ?? '주소 미입력'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/buildings/${buildingId}/connectors`}>
              <Button variant="outline">수직 연결자</Button>
            </Link>
            <Link to={`/buildings/${buildingId}/floors`}>
              <Button variant="outline">층 관리</Button>
            </Link>
          </div>
        </div>

        <h3 style={{ marginTop: 24 }}>층 목록</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {floors?.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between p-3 border border-line rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">
                  {f.floor}층 · major {f.major}
                </span>
                {f.status && <StatusBadge status={f.status} />}
              </div>
              <div className="flex gap-2">
                <Link to={`/buildings/${buildingId}/floors/${f.id}/floorplan`}>
                  <Button variant="outline" style={{ height: 34, padding: '0 12px' }}>
                    설계도
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/map`}>
                  <Button variant="outline" style={{ height: 34, padding: '0 12px' }}>
                    지도 검수
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/beacons`}>
                  <Button variant="outline" style={{ height: 34, padding: '0 12px' }}>
                    비콘
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/landmarks`}>
                  <Button variant="outline" style={{ height: 34, padding: '0 12px' }}>
                    목적지
                  </Button>
                </Link>
              </div>
            </div>
          ))}
          {floors && floors.length === 0 && (
            <p style={{ color: '#8C99B3' }}>등록된 층이 없습니다. &lsquo;층 관리&rsquo;에서 추가하세요.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
