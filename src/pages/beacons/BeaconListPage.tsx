import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useConnectors } from '@/features/connectors/hooks'
import {
  useBeacons,
  useCreateBeacon,
  useDeleteBeacon,
  useUpdateBeacon,
} from '@/features/beacons/hooks'
import type { BeaconType } from '@/types/domain'
import { FloorMapCanvas } from '@/components/map/FloorMapCanvas'
import type { MapPoint } from '@/components/map/FloorMapCanvas'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'

const TYPE_LABEL: Record<BeaconType, string> = {
  anchor: '앵커',
  checkpoint: '체크포인트',
  connector: '엘베·계단',
}
const TYPE_COLOR: Record<BeaconType, string> = {
  anchor: '#4B70E5',
  checkpoint: '#29AD72',
  connector: '#F2992E',
}

export default function BeaconListPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: connectors } = useConnectors(buildingId)
  const { data: beacons } = useBeacons(floorId)
  const create = useCreateBeacon(floorId)
  const update = useUpdateBeacon(floorId)
  const del = useDeleteBeacon(floorId)

  const [name, setName] = useState('')
  const [mac, setMac] = useState('')
  const [minor, setMinor] = useState('')
  const [type, setType] = useState<BeaconType>('checkpoint')
  const [connectorId, setConnectorId] = useState('')

  const valid = name.trim() !== '' && minor !== '' && Number.isInteger(Number(minor))

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    create.mutate(
      {
        name: name.trim(),
        mac: mac.trim() || undefined,
        minor: Number(minor),
        type,
        connectorId: type === 'connector' ? connectorId || undefined : undefined,
        x: 450,
        y: 280,
      },
      {
        onSuccess: () => {
          setName('')
          setMac('')
          setMinor('')
          setType('checkpoint')
          setConnectorId('')
        },
      },
    )
  }

  const points: MapPoint[] = (beacons ?? [])
    .filter((b) => b.x != null && b.y != null)
    .map((b) => ({ id: b.id, x: b.x as number, y: b.y as number, color: TYPE_COLOR[b.type], label: b.name }))

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: floor ? `${floor.floor}층` : '층', to: `/buildings/${buildingId}/floors` },
    { label: '비콘' },
  ]

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>비콘·체크포인트 등록</h1>

      <div className="flex gap-6 items-start">
        <div>
          <FloorMapCanvas
            floorId={floorId}
            points={points}
            width={640}
            onMove={(id, x, y) => update.mutate({ beaconId: id, input: { x, y } })}
          />
          <div className="flex flex-wrap gap-4 mt-2 text-[13px] text-muted">
            <span style={{ color: TYPE_COLOR.anchor }}>● 앵커</span>
            <span style={{ color: TYPE_COLOR.checkpoint }}>● 체크포인트</span>
            <span style={{ color: TYPE_COLOR.connector }}>● 엘베·계단</span>
            <span>· 점을 드래그해 위치 조정</span>
          </div>
        </div>

        <Card className="w-[320px]">
          <h3>비콘 추가</h3>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Input label="이름" placeholder="중앙 갈림길" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="고유 번호 (MAC)"
              placeholder="44:B1:76:1A:13:B2"
              value={mac}
              onChange={(e) => setMac(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[13px] text-muted mb-2">major</span>
                <div className="h-12 px-4 rounded-lg border border-line bg-field text-sm flex items-center text-muted">
                  {floor?.major ?? '—'}
                </div>
              </div>
              <Input label="minor" type="number" placeholder="10" value={minor} onChange={(e) => setMinor(e.target.value)} />
            </div>
            <label className="block">
              <span className="block text-[13px] text-muted mb-2">타입</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as BeaconType)}
                className="w-full h-12 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm"
              >
                <option value="anchor">앵커</option>
                <option value="checkpoint">체크포인트</option>
                <option value="connector">엘베·계단</option>
              </select>
            </label>
            {type === 'connector' && (
              <label className="block">
                <span className="block text-[13px] text-muted mb-2">연결자</span>
                <select
                  value={connectorId}
                  onChange={(e) => setConnectorId(e.target.value)}
                  className="w-full h-12 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm"
                >
                  <option value="">— 선택 —</option>
                  {connectors?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button type="submit" disabled={!valid || create.isPending}>
              비콘 추가
            </Button>
            <p className="text-muted text-[13px]">추가 후 지도에서 점을 드래그해 위치를 잡으세요.</p>
          </form>
        </Card>
      </div>

      <Card className="mt-6">
        <h3>등록된 비콘</h3>
        <div className="grid gap-2">
          {beacons?.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-3 border border-line rounded-lg">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLOR[b.type] }} />
                <span className="font-medium">{b.name}</span>
                <span className="text-[13px] text-muted">
                  {b.mac ? `${b.mac} · ` : ''}major {b.major} · minor {b.minor} · {TYPE_LABEL[b.type]}
                  {b.connectorId ? ` · ${connectors?.find((c) => c.id === b.connectorId)?.name ?? b.connectorId}` : ''}
                </span>
              </div>
              <div className="flex gap-2">
                <Link to={`/buildings/${buildingId}/floors/${floorId}/beacons/${b.id}`}>
                  <Button variant="outline" style={{ height: 34, padding: '0 12px' }}>
                    편집
                  </Button>
                </Link>
                <Button variant="danger" style={{ height: 34, padding: '0 12px' }} onClick={() => del.mutate(b.id)}>
                  삭제
                </Button>
              </div>
            </div>
          ))}
          {beacons && beacons.length === 0 && <p className="text-muted">등록된 비콘이 없습니다.</p>}
        </div>
        <Link
          to={`/buildings/${buildingId}/floors/${floorId}/landmarks`}
          className="inline-block mt-4 text-sm"
        >
          목적지(랜드마크) 관리 →
        </Link>
      </Card>
    </div>
  )
}
