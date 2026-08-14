import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import {
  useConnectors,
  useCreateConnector,
  useSetConnectorPosition,
  useClearConnectorPosition,
} from '@/features/connectors/hooks'
import type { ConnectorType } from '@/types/domain'
import { FloorMapCanvas } from '@/components/map/FloorMapCanvas'
import type { MapPoint } from '@/components/map/FloorMapCanvas'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'
import { AsyncState } from '@/components/ui/AsyncState'
import { CONNECTOR_COLOR } from '@/lib/constants'

const TYPE_LABEL: Record<ConnectorType, string> = { elevator: '엘리베이터', stairs: '계단' }

export default function ConnectorPlacementPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: connectors, isLoading, isError, refetch } = useConnectors(buildingId)
  const create = useCreateConnector(buildingId)
  const setPosition = useSetConnectorPosition(buildingId)
  const clearPosition = useClearConnectorPosition(buildingId)

  const [armedId, setArmedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ConnectorType>('elevator')

  const relevant = (connectors ?? []).filter((c) => floor && c.floors.includes(floor.floor))

  const points: MapPoint[] = relevant
    .map((c) => {
      const pos = c.positions?.find((p) => p.floorId === floorId)
      if (!pos) return null
      return { id: c.id, x: pos.x, y: pos.y, color: CONNECTOR_COLOR, label: c.name }
    })
    .filter((p): p is MapPoint => p !== null)

  function placeArmed(x: number, y: number) {
    if (!armedId) return
    setPosition.mutate({ connectorId: armedId, floorId, x, y }, { onSuccess: () => setArmedId(null) })
  }

  function onCreateSubmit(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !floor) return
    create.mutate(
      { name: newName.trim(), type: newType, floors: [floor.floor] },
      { onSuccess: () => { setNewName(''); setNewType('elevator') } },
    )
  }

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: floor ? `${floor.floor}층` : '층', to: `/buildings/${buildingId}/floors` },
    { label: '수직연결자' },
  ]

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>수직연결자 배치</h1>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <FloorMapCanvas
            floorId={floorId}
            points={points}
            onMove={(id, x, y) => setPosition.mutate({ connectorId: id, floorId, x, y })}
            onCanvasClick={armedId ? placeArmed : undefined}
          />
          <div className="flex flex-wrap gap-4 mt-2 text-[13px] text-muted">
            <span style={{ color: CONNECTOR_COLOR }}>● 연결자 입구</span>
            <span>
              {armedId
                ? '지도를 클릭해 선택한 연결자의 위치를 지정하세요.'
                : '왼쪽 목록에서 연결자를 선택한 뒤 지도를 클릭하세요. · 점을 드래그해 위치 조정'}
            </span>
          </div>
        </div>

        <Card className="w-[320px] shrink-0">
          <h3>이 층의 연결자</h3>
          {isLoading && <AsyncState status="loading" />}
          {isError && <AsyncState status="error" onRetry={() => refetch()} />}
          <div className="grid gap-2 mt-3">
            {!isLoading && !isError && relevant.map((c) => {
              const placed = c.positions?.find((p) => p.floorId === floorId)
              const armed = armedId === c.id
              return (
                <div
                  key={c.id}
                  className={`p-3 border rounded-lg ${armed ? 'border-brand' : 'border-line'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[13px] text-muted">
                        {TYPE_LABEL[c.type]} · {placed ? '위치 지정됨' : '위치 미지정'}
                      </div>
                    </div>
                    <Button
                      variant={armed ? 'primary' : 'outline'}
                      className="shrink-0 whitespace-nowrap"
                      style={{ height: 34, padding: '0 12px' }}
                      onClick={() => setArmedId(armed ? null : c.id)}
                    >
                      {armed ? '지도 클릭 대기' : '지도에 위치 지정'}
                    </Button>
                  </div>
                  {placed && (
                    <Button
                      variant="danger"
                      className="whitespace-nowrap"
                      style={{ height: 30, padding: '0 10px', marginTop: 8 }}
                      disabled={clearPosition.isPending}
                      onClick={() => clearPosition.mutate({ connectorId: c.id, floorId })}
                    >
                      위치 지우기
                    </Button>
                  )}
                </div>
              )
            })}
            {!isLoading && !isError && relevant.length === 0 && (
              <div>
                <AsyncState status="empty" title="이 층에 해당하는 연결자가 없습니다." />
                <form onSubmit={onCreateSubmit} className="grid gap-3 mt-2">
                  <Input
                    label="이름"
                    placeholder="엘리베이터 1호기"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <label className="block">
                    <span className="block text-[13px] text-muted mb-2">타입</span>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as ConnectorType)}
                      className="w-full h-12 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm outline-none"
                    >
                      <option value="elevator">엘리베이터</option>
                      <option value="stairs">계단</option>
                    </select>
                  </label>
                  <Button type="submit" disabled={!newName.trim() || create.isPending}>
                    이 층에 연결자 등록
                  </Button>
                </form>
                <Link
                  to={`/buildings/${buildingId}/connectors`}
                  className="block text-brand font-semibold hover:underline text-sm mt-3"
                >
                  건물 단위 연결자 관리에서 여러 층에 걸친 연결자 추가 →
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>

      <StepFooter buildingId={buildingId} floorId={floorId} current="connectors" />
    </div>
  )
}
