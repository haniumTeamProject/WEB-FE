import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useBeacons, useDeleteBeacon, useUpdateBeacon } from '@/features/beacons/hooks'
import { useConnectors } from '@/features/connectors/hooks'
import type { BeaconType } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'

export default function BeaconEditPage() {
  const { buildingId = '', floorId = '', beaconId = '' } = useParams()
  const navigate = useNavigate()
  const { data: building } = useBuilding(buildingId)
  const { data: beacons, isLoading } = useBeacons(floorId)
  const { data: connectors } = useConnectors(buildingId)
  const update = useUpdateBeacon(floorId)
  const del = useDeleteBeacon(floorId)
  const beacon = beacons?.find((b) => b.id === beaconId)

  const [name, setName] = useState('')
  const [mac, setMac] = useState('')
  const [minor, setMinor] = useState('')
  const [type, setType] = useState<BeaconType>('checkpoint')
  const [connectorId, setConnectorId] = useState('')

  useEffect(() => {
    if (beacon) {
      setName(beacon.name)
      setMac(beacon.mac ?? '')
      setMinor(String(beacon.minor))
      setType(beacon.type)
      setConnectorId(beacon.connectorId ?? '')
    }
  }, [beacon])

  const backTo = `/buildings/${buildingId}/floors/${floorId}/beacons`

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    update.mutate(
      {
        beaconId,
        input: {
          name: name.trim(),
          mac: mac.trim() || undefined,
          minor: Number(minor),
          type,
          connectorId: type === 'connector' ? connectorId || undefined : undefined,
        },
      },
      { onSuccess: () => navigate(backTo) },
    )
  }

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: '비콘', to: backTo },
    { label: '편집' },
  ]

  if (isLoading) return <p className="text-muted">불러오는 중…</p>
  if (!beacon)
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <p className="text-muted">비콘을 찾을 수 없습니다.</p>
      </div>
    )

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>비콘 편집</h1>
      <Card style={{ maxWidth: 560 }}>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="고유 번호 (MAC)" placeholder="44:B1:76:1A:13:B2" value={mac} onChange={(e) => setMac(e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="block text-[13px] text-muted mb-2">major (자동)</span>
              <div className="h-12 px-4 rounded-lg border border-line bg-field text-sm flex items-center text-muted">
                {beacon.major}
              </div>
            </div>
            <Input label="minor" type="number" value={minor} onChange={(e) => setMinor(e.target.value)} />
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
          <div className="flex gap-3">
            <Button type="submit" disabled={update.isPending}>
              저장
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={del.isPending}
              onClick={() => del.mutate(beaconId, { onSuccess: () => navigate(backTo) })}
            >
              삭제
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(backTo)}>
              취소
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
