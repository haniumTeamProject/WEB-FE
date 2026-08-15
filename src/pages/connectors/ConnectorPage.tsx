import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import {
  useConnectors,
  useCreateConnector,
  useDeleteConnector,
} from '@/features/connectors/hooks'
import type { ConnectorType } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const TYPE_LABEL: Record<ConnectorType, string> = { elevator: '엘리베이터', stairs: '계단' }

export default function ConnectorPage() {
  const { buildingId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const { data: connectors, isLoading: connectorsLoading, isError: connectorsError, refetch: refetchConnectors } = useConnectors(buildingId)
  const create = useCreateConnector(buildingId)
  const del = useDeleteConnector(buildingId)

  const [name, setName] = useState('')
  const [type, setType] = useState<ConnectorType>('elevator')
  const [selected, setSelected] = useState<number[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const toggleFloor = (f: number) =>
    setSelected((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f].sort((a, b) => a - b)))

  const valid = name.trim() !== '' && selected.length > 0

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    create.mutate(
      { name: name.trim(), type, floors: selected },
      {
        onSuccess: () => {
          setName('')
          setType('elevator')
          setSelected([])
        },
      },
    )
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: '홈', to: '/' },
          { label: '건물 관리', to: '/buildings' },
          { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
          { label: '수직 연결자' },
        ]}
      />
      <h1>수직 연결자</h1>

      <div className="grid grid-cols-2 gap-6 items-start">
        {/* 추가 폼 */}
        <Card>
          <h3>연결자 추가</h3>
          <form onSubmit={onSubmit} className="grid gap-4">
            <Input
              label="이름"
              placeholder="엘리베이터 1호기"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="block">
              <span className="block text-[13px] text-muted mb-2">타입</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ConnectorType)}
                className="w-full h-12 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm outline-none"
              >
                <option value="elevator">엘리베이터</option>
                <option value="stairs">계단</option>
              </select>
            </label>
            <div>
              <span className="block text-[13px] text-muted mb-2">운행 층</span>
              <div className="flex flex-wrap gap-2">
                {floors?.map((f) => {
                  const on = selected.includes(f.floor)
                  return (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => toggleFloor(f.floor)}
                      className={`h-10 px-4 rounded-lg text-sm border ${
                        on
                          ? 'bg-brand text-white border-transparent'
                          : 'bg-white text-muted border-[#DEE2EB] hover:bg-gray-50'
                      }`}
                    >
                      {f.floor}F
                    </button>
                  )
                })}
                {floors && floors.length === 0 && (
                  <div className="text-sm">
                    <span className="text-muted">아직 등록된 층이 없습니다. </span>
                    <Link to={`/buildings/${buildingId}/floors`} className="text-brand font-semibold hover:underline">
                      층 관리에서 등록하기 →
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <Button type="submit" disabled={!valid || create.isPending} className="w-40">
              연결자 추가
            </Button>
          </form>
        </Card>

        {/* 선언된 연결자 */}
        <Card>
          <h3>선언된 연결자</h3>
          {connectorsLoading && <AsyncState status="loading" />}
          {connectorsError && <AsyncState status="error" onRetry={() => refetchConnectors()} />}
          <div className="grid gap-2">
            {!connectorsLoading && !connectorsError && connectors?.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-4 border border-line rounded-lg"
              >
                <div>
                  <div className="font-semibold text-ink">{c.name}</div>
                  <div className="text-[13px] text-muted">
                    {TYPE_LABEL[c.type]} · 운행층 {c.floors.join('·')}
                  </div>
                </div>
                <Button
                  variant="danger"
                  style={{ height: 36, padding: '0 14px' }}
                  disabled={del.isPending}
                  onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
                >
                  삭제
                </Button>
              </div>
            ))}
            {connectors && connectors.length === 0 && (
              <AsyncState status="empty" title="선언된 연결자가 없습니다." />
            )}
          </div>
          <p className="text-muted text-[13px] mt-3">
            각 층의 엘베/계단 비콘 등록 시 이 목록을 connector_id로 참조합니다 (자유입력 금지).
          </p>
        </Card>
      </div>

      <Card className="mt-6">
        <h3>연결자 검수</h3>
        <p className="text-muted text-[13px] mt-2">
          연결자×층 매트릭스로 각 층에 좌표가 빠짐없이 등록됐는지 확인하세요.
        </p>
        <Link to={`/buildings/${buildingId}/connectors/review`} className="inline-block mt-3">
          <Button variant="outline" style={{ height: 36, padding: '0 14px' }}>
            연결자 검수 →
          </Button>
        </Link>
      </Card>

      <Card className="mt-6">
        <h3>층별 배치로 이동</h3>
        <p className="text-muted text-[13px] mt-2">각 층에서 이 연결자들의 입구 좌표를 지도 위에 찍으려면 해당 층의 배치 화면으로 이동하세요.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {floors?.map((f) => (
            <Link key={f.id} to={`/buildings/${buildingId}/floors/${f.id}/connectors`}>
              <Button variant="outline" style={{ height: 36, padding: '0 14px' }}>
                {f.floor}층 배치 →
              </Button>
            </Link>
          ))}
          {floors && floors.length === 0 && <span className="text-muted text-sm">아직 등록된 층이 없습니다.</span>}
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="연결자를 삭제할까요?"
        description={`'${deleteTarget?.name}' — 삭제하면 되돌릴 수 없습니다. 이 연결자를 참조하는 층의 비콘 연결이 끊어집니다.`}
        pending={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) del.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })
        }}
      />
    </div>
  )
}
