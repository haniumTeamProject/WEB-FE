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

const TYPE_LABEL: Record<LandmarkType, string> = {
  room: '강의실/방',
  restroom: '화장실',
  facility: '편의시설',
  entrance: '출입구',
}
const TYPE_COLOR: Record<LandmarkType, string> = {
  room: '#4B70E5',
  restroom: '#29AD72',
  facility: '#8C5BD6',
  entrance: '#F2992E',
}

export default function LandmarkPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: landmarks } = useLandmarks(floorId)
  const create = useCreateLandmark(floorId)
  const update = useUpdateLandmark(floorId)
  const del = useDeleteLandmark(floorId)

  const [name, setName] = useState('')
  const [type, setType] = useState<LandmarkType>('room')

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
        <div>
          <FloorMapCanvas
            floorId={floorId}
            points={points}
            width={640}
            onMove={(id, x, y) => update.mutate({ landmarkId: id, input: { x, y } })}
          />
          <p className="mt-2 text-[13px] text-muted">
            사용자가 음성으로 말하는 목적지 후보입니다. 점을 드래그해 위치를 잡으세요.
          </p>
        </div>

        <Card className="w-[320px]">
          <h3>목적지 추가</h3>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Input label="이름" placeholder="406호" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="block">
              <span className="block text-[13px] text-muted mb-2">타입</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LandmarkType)}
                className="w-full h-12 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm"
              >
                <option value="room">강의실/방</option>
                <option value="restroom">화장실</option>
                <option value="facility">편의시설</option>
                <option value="entrance">출입구</option>
              </select>
            </label>
            <Button type="submit" disabled={!valid || create.isPending}>
              목적지 추가
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-6">
        <h3>등록된 목적지</h3>
        <div className="grid gap-2">
          {landmarks?.map((l) => (
            <div key={l.id} className="flex items-center justify-between p-3 border border-line rounded-lg">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLOR[l.type] }} />
                <span className="font-medium">{l.name}</span>
                <span className="text-[13px] text-muted">{TYPE_LABEL[l.type]}</span>
              </div>
              <Button variant="danger" style={{ height: 34, padding: '0 12px' }} onClick={() => del.mutate(l.id)}>
                삭제
              </Button>
            </div>
          ))}
          {landmarks && landmarks.length === 0 && <p className="text-muted">등록된 목적지가 없습니다.</p>}
        </div>
      </Card>
    </div>
  )
}
