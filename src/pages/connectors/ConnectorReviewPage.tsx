import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useConnectors } from '@/features/connectors/hooks'
import { Card } from '@/components/ui/Card'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'

// 정책 3.3: 연결자×층 매트릭스로 결손 검수 — 운행층인데 좌표(positions)가 없는 칸이 결손
export default function ConnectorReviewPage() {
  const { buildingId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const { data: connectors, isLoading, isError, refetch } = useConnectors(buildingId)

  const sortedFloors = [...(floors ?? [])].sort((a, b) => a.floor - b.floor)

  const missing = (connectors ?? []).flatMap((c) =>
    c.floors
      .filter((floorNum) => {
        const floor = sortedFloors.find((f) => f.floor === floorNum)
        return floor && !c.positions?.some((p) => p.floorId === floor.id)
      })
      .map((floorNum) => ({ connector: c, floorNum })),
  )

  const ready = !isLoading && !isError && connectors && connectors.length > 0 && sortedFloors.length > 0

  return (
    <div>
      <Breadcrumb
        items={[
          { label: '홈', to: '/' },
          { label: '건물 관리', to: '/buildings' },
          { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
          { label: '수직 연결자', to: `/buildings/${buildingId}/connectors` },
          { label: '연결자 검수' },
        ]}
      />
      <h1>연결자 검수</h1>

      <Card className="mt-4">
        <p className="text-muted text-[13px] mb-4">
          엘리베이터·계단이 각 층에 빠짐없이 등록됐는지 확인합니다.
        </p>
        {isLoading && <AsyncState status="loading" />}
        {isError && <AsyncState status="error" onRetry={() => refetch()} />}
        {ready && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-2 border-b border-line" />
                    {sortedFloors.map((f) => (
                      <th key={f.id} className="p-2 border-b border-line text-center whitespace-nowrap">
                        {f.floor}F
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {connectors!.map((c) => (
                    <tr key={c.id}>
                      <td className="p-2 border-b border-line whitespace-nowrap font-medium">{c.name}</td>
                      {sortedFloors.map((f) => {
                        if (!c.floors.includes(f.floor)) {
                          return (
                            <td key={f.id} className="p-2 border-b border-line text-center text-muted">
                              –
                            </td>
                          )
                        }
                        const placed = c.positions?.some((p) => p.floorId === f.id)
                        return (
                          <td key={f.id} className="p-2 border-b border-line text-center">
                            {placed ? (
                              <span style={{ color: '#4BAE72', fontWeight: 700 }}>✓</span>
                            ) : (
                              <Link
                                to={`/buildings/${buildingId}/floors/${f.id}/connectors`}
                                style={{ color: '#DC4C4C', fontWeight: 700 }}
                              >
                                ✗
                              </Link>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-muted text-[13px] mt-4">✓ 등록됨 · ✗ 결손(등록 필요) · – 미운행 층</p>

            {missing.length > 0 && (
              <div className="mt-3 grid gap-1">
                {missing.map(({ connector, floorNum }) => (
                  <p key={`${connector.id}-${floorNum}`} className="text-[13px]" style={{ color: '#DC4C4C' }}>
                    ※ '{connector.name}' {floorNum}층이 결손입니다. 해당 층 배치 화면에서 좌표를 지정하세요.
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        {!isLoading && !isError && !ready && (
          <p className="text-muted text-[13px]">연결자와 층이 모두 등록돼야 검수 표가 표시됩니다.</p>
        )}
      </Card>
    </div>
  )
}
