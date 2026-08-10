import { useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import {
  useCreateLandmark,
  useDeleteLandmark,
  useLandmarks,
  useUpdateLandmark,
} from '@/features/landmarks/hooks'
import type { LandmarkType } from '@/types/domain'
import { FloorMapCanvas } from '@/components/map/FloorMapCanvas'
import type { MapPoint } from '@/components/map/FloorMapCanvas'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ColorSelect } from '@/components/ui/ColorSelect'
import { LANDMARK_TYPE_COLOR as TYPE_COLOR, LANDMARK_TYPE_LABEL as TYPE_LABEL } from '@/lib/constants'

const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as LandmarkType[]).map((value) => ({
  value,
  label: TYPE_LABEL[value],
  color: TYPE_COLOR[value],
}))

export default function LandmarkPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: landmarks, isLoading: landmarksLoading, isError: landmarksError, refetch: refetchLandmarks } = useLandmarks(floorId)
  const create = useCreateLandmark(floorId)
  const update = useUpdateLandmark(floorId)
  const del = useDeleteLandmark(floorId)

  const [name, setName] = useState('')
  const [type, setType] = useState<LandmarkType>('room')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const valid = name.trim() !== ''

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    create.mutate(
      { name: name.trim(), type, x: 450, y: 280 },
      {
        onSuccess: () => {
          setName('')
          setType('room')
        },
      },
    )
  }

  const points: MapPoint[] = (landmarks ?? [])
    .filter((l) => l.x != null && l.y != null)
    .map((l) => ({ id: l.id, x: l.x as number, y: l.y as number, color: TYPE_COLOR[l.type], label: l.name }))

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: floor ? `${floor.floor}층` : '층', to: `/buildings/${buildingId}/floors` },
    { label: '목적지' },
  ]

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>목적지(랜드마크) 관리</h1>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <FloorMapCanvas
            floorId={floorId}
            points={points}
            onMove={(id, x, y) => update.mutate({ landmarkId: id, input: { x, y } })}
          />
          <p className="mt-2 text-[13px] text-muted">
            사용자가 음성으로 말하는 목적지 후보입니다. 점을 드래그해 위치를 잡으세요.
          </p>
        </div>

        <Card className="w-[320px] shrink-0">
          <h3>목적지 추가</h3>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Input label="이름" placeholder="406호" value={name} onChange={(e) => setName(e.target.value)} />
            <ColorSelect label="타입" value={type} onChange={setType} options={TYPE_OPTIONS} />
            <Button type="submit" disabled={!valid || create.isPending}>
              목적지 추가
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-6">
        <h3>등록된 목적지</h3>
        {landmarksLoading && <AsyncState status="loading" />}
        {landmarksError && <AsyncState status="error" onRetry={() => refetchLandmarks()} />}
        <div className="grid gap-2">
          {!landmarksLoading && !landmarksError && landmarks?.map((l) => (
            <div key={l.id} className="flex items-center justify-between p-3 border border-line rounded-lg">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLOR[l.type] }} />
                <span className="font-medium">{l.name}</span>
                <span className="text-[13px] text-muted">{TYPE_LABEL[l.type]}</span>
              </div>
              <Button
                variant="danger"
                style={{ height: 34, padding: '0 12px' }}
                onClick={() => setDeleteTarget({ id: l.id, name: l.name })}
              >
                삭제
              </Button>
            </div>
          ))}
          {landmarks && landmarks.length === 0 && <AsyncState status="empty" title="등록된 목적지가 없습니다." />}
        </div>
      </Card>

      <StepFooter buildingId={buildingId} floorId={floorId} current="landmarks" />

      <ConfirmDialog
        open={!!deleteTarget}
        title="목적지를 삭제할까요?"
        description={`'${deleteTarget?.name}' — 삭제하면 되돌릴 수 없습니다.`}
        pending={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) del.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })
        }}
      />
    </div>
  )
}
