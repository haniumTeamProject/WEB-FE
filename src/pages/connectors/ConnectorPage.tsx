import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import {
  useConnectors,
  useCreateConnector,
  useUpdateConnector,
  useDeleteConnector,
} from '@/features/connectors/hooks'
import type { Connector, ConnectorType } from '@/types/domain'
import type { Floor } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const TYPE_LABEL: Record<ConnectorType, string> = { elevator: '엘리베이터', stairs: '계단' }
// 타입별 아이콘·색 — 목록에서 텍스트를 읽지 않아도 엘리베이터/계단이 바로 구분되게.
const TYPE_COLOR: Record<ConnectorType, string> = { elevator: '#4B70E5', stairs: '#8C5BD6' }

function IconElevator({ style }: { style?: CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <rect x="5" y="3" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.3 8.7 10 6.7l1.7 2M8.3 11.3 10 13.3l1.7-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconStairs({ style }: { style?: CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <path d="M3 16h3v-3h3v-3h3v-3h3V4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconPencil({ style }: { style?: CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <path
        d="M5 15l.7-3 7.5-7.5a1.4 1.4 0 0 1 2 0l.3.3a1.4 1.4 0 0 1 0 2L8 14.3 5 15Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
function IconTrash({ style }: { style?: CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <path
        d="M6 7h8M8.3 5h3.4M7.2 7l.5 8.6c.05.85.75 1.4 1.6 1.4h1.4c.85 0 1.55-.55 1.6-1.4l.5-8.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// 모달이 열릴 때마다 새로 마운트돼야 로컬 state가 그 시점의 connector 값을 정확히 반영한다 —
// BuildingDetailPage의 EditBuildingForm과 같은 이유(Modal은 열려 있을 때만 children을 그린다).
function EditConnectorForm({
  connector,
  floors,
  buildingId,
  onClose,
}: {
  connector: Connector
  floors?: Floor[]
  buildingId: string
  onClose: () => void
}) {
  const update = useUpdateConnector(buildingId)
  const [name, setName] = useState(connector.name)
  const [type, setType] = useState<ConnectorType>(connector.type)
  const [selected, setSelected] = useState<number[]>(connector.floors)

  const toggleFloor = (f: number) =>
    setSelected((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f].sort((a, b) => a - b)))

  const valid = name.trim() !== '' && selected.length > 0

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    update.mutate(
      { connectorId: connector.id, input: { name: name.trim(), type, floors: selected } },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <h3 style={{ margin: 0 }}>연결자 수정</h3>
      <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} />
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
        </div>
      </div>
      {update.isError && <p style={{ color: '#DC4C4C', fontSize: 13 }}>수정에 실패했습니다.</p>}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Button type="submit" disabled={!valid || update.isPending}>
          {update.isPending ? '저장 중…' : '저장'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
      </div>
    </form>
  )
}

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
  const [editTarget, setEditTarget] = useState<Connector | null>(null)

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
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="flex items-center justify-center rounded-lg flex-shrink-0"
                    style={{ width: 34, height: 34, background: `${TYPE_COLOR[c.type]}22`, color: TYPE_COLOR[c.type] }}
                  >
                    {c.type === 'elevator' ? <IconElevator /> : <IconStairs />}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{c.name}</div>
                    <div className="text-[13px] text-muted">
                      {TYPE_LABEL[c.type]} · 운행층 {c.floors.join('·')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    title="수정"
                    aria-label="수정"
                    onClick={() => setEditTarget(c)}
                    className="flex items-center justify-center rounded-lg border border-line bg-white text-muted hover:bg-gray-50"
                    style={{ width: 34, height: 34 }}
                  >
                    <IconPencil />
                  </button>
                  <button
                    type="button"
                    title="삭제"
                    aria-label="삭제"
                    disabled={del.isPending}
                    onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
                    className="flex items-center justify-center rounded-lg border bg-white hover:bg-red-50"
                    style={{ width: 34, height: 34, borderColor: '#F3C6C6', color: '#DC4C4C' }}
                  >
                    <IconTrash />
                  </button>
                </div>
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

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)}>
        {editTarget && (
          <EditConnectorForm
            connector={editTarget}
            floors={floors}
            buildingId={buildingId}
            onClose={() => setEditTarget(null)}
          />
        )}
      </Modal>
    </div>
  )
}
