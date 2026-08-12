import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
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
import type { Beacon, BeaconType, ConnectorType } from '@/types/domain'
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
import { BEACON_TYPE_COLOR as TYPE_COLOR, BEACON_TYPE_LABEL as TYPE_LABEL } from '@/lib/constants'
import { diffImport, parseMappinProjectFile, toDesignCoords } from '@/lib/mapImport'
import type { ImportPlan } from '@/lib/mapImport'

const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as BeaconType[]).map((value) => ({
  value,
  label: TYPE_LABEL[value],
  color: TYPE_COLOR[value],
}))
const CONNECTOR_TYPE_LABEL: Record<ConnectorType, string> = { elevator: '엘리베이터', stairs: '계단' }
const PENDING_ID = '__pending__'

export default function BeaconListPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: connectors } = useConnectors(buildingId)
  const { data: beacons, isLoading: beaconsLoading, isError: beaconsError, refetch: refetchBeacons } = useBeacons(floorId)
  const create = useCreateBeacon(floorId)
  const update = useUpdateBeacon(floorId)
  const del = useDeleteBeacon(floorId)

  const [name, setName] = useState('')
  const [mac, setMac] = useState('')
  const [minor, setMinor] = useState('')
  const [type, setType] = useState<BeaconType>('semantic')
  const [connectorId, setConnectorId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importPlan, setImportPlan] = useState<ImportPlan<Beacon> | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const valid = name.trim() !== '' && minor !== '' && Number.isInteger(Number(minor)) && !!pendingPos

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || !pendingPos) return
    create.mutate(
      {
        name: name.trim(),
        mac: mac.trim() || undefined,
        minor: Number(minor),
        type,
        connectorId: type === 'semantic' ? connectorId || undefined : undefined,
        x: pendingPos.x,
        y: pendingPos.y,
      },
      {
        onSuccess: () => {
          setName('')
          setMac('')
          setMinor('')
          setType('semantic')
          setConnectorId('')
          setPendingPos(null)
        },
      },
    )
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError(null)
    try {
      const project = await parseMappinProjectFile(file)
      const sources = project.beacons.map((b) => ({
        uid: b.uid,
        label: b.id,
        ...toDesignCoords(b.x, b.y, project.origW),
      }))
      setImportPlan(diffImport(beacons ?? [], sources))
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '가져오기에 실패했습니다.')
    }
  }

  async function confirmImport() {
    if (!importPlan) return
    setImporting(true)
    try {
      let nextMinor = (beacons ?? []).reduce((max, b) => Math.max(max, b.minor), 0) + 1
      for (const source of importPlan.toCreate) {
        await create.mutateAsync({
          name: source.label,
          minor: nextMinor++,
          type: 'semantic',
          sourceUid: source.uid,
          sourceLabel: source.label,
          x: source.x,
          y: source.y,
        })
      }
      for (const { target, source } of importPlan.toUpdate) {
        await update.mutateAsync({
          beaconId: target.id,
          input: { x: source.x, y: source.y, sourceLabel: source.label },
        })
      }
      for (const target of importPlan.toDelete) {
        await del.mutateAsync(target.id)
      }
      setImportPlan(null)
    } finally {
      setImporting(false)
    }
  }

  const points: MapPoint[] = (beacons ?? [])
    .filter((b) => b.x != null && b.y != null)
    .map((b) => ({ id: b.id, x: b.x as number, y: b.y as number, color: TYPE_COLOR[b.type], label: b.name }))
  if (pendingPos) {
    points.push({
      id: PENDING_ID,
      x: pendingPos.x,
      y: pendingPos.y,
      color: '#8C99B3',
      label: name.trim() || '새 위치',
    })
  }

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
      <h1>비콘 등록</h1>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <FloorMapCanvas
            floorId={floorId}
            points={points}
            onMove={(id, x, y) => {
              if (id === PENDING_ID) setPendingPos({ x, y })
              else update.mutate({ beaconId: id, input: { x, y } })
            }}
            onCanvasClick={(x, y) => setPendingPos({ x, y })}
          />
          <div className="flex flex-wrap gap-4 mt-2 text-[13px] text-muted">
            <span style={{ color: TYPE_COLOR.semantic }}>● 의미비콘</span>
            <span style={{ color: TYPE_COLOR.reinforcement }}>● 보강비콘</span>
            <span>· 지도를 클릭해 새 비콘 위치 지정 · 점을 드래그해 위치 조정</span>
          </div>
        </div>

        <Card className="w-[320px] shrink-0">
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
            <ColorSelect label="타입" value={type} onChange={setType} options={TYPE_OPTIONS} />
            {type === 'semantic' && (
              <label className="block">
                <span className="block text-[13px] text-muted mb-2">수직연결자 (해당 시)</span>
                <select
                  value={connectorId}
                  onChange={(e) => setConnectorId(e.target.value)}
                  className="w-full h-12 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm"
                >
                  <option value="">— 선택 —</option>
                  {(['elevator', 'stairs'] as ConnectorType[]).map((connectorType) => {
                    const options = connectors?.filter((c) => c.type === connectorType) ?? []
                    if (options.length === 0) return null
                    return (
                      <optgroup key={connectorType} label={CONNECTOR_TYPE_LABEL[connectorType]}>
                        {options.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
              </label>
            )}
            <Button type="submit" disabled={!valid || create.isPending}>
              비콘 추가
            </Button>
            <p className="text-muted text-[13px]">
              {pendingPos ? '위치가 지정됐습니다. 점을 드래그해 조정할 수 있어요.' : '지도를 클릭해 배치할 위치를 먼저 지정하세요.'}
            </p>
          </form>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h3>등록된 비콘</h3>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={onImportFile}
            />
            <Button
              variant="outline"
              style={{ height: 34, padding: '0 12px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              지도 데이터 가져오기
            </Button>
          </div>
        </div>
        {importError && <p className="text-[13px] mt-2" style={{ color: '#DC4C4C' }}>{importError}</p>}
        {beaconsLoading && <AsyncState status="loading" />}
        {beaconsError && <AsyncState status="error" onRetry={() => refetchBeacons()} />}
        <div className="grid gap-2 mt-3">
          {!beaconsLoading && !beaconsError && beacons?.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-3 border border-line rounded-lg">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLOR[b.type] }} />
                <span className="font-medium">{b.name}</span>
                {b.sourceLabel && (
                  <span className="text-[11px] text-muted border border-line rounded px-1.5 py-0.5">
                    {b.sourceLabel}
                  </span>
                )}
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
                <Button
                  variant="danger"
                  style={{ height: 34, padding: '0 12px' }}
                  onClick={() => setDeleteTarget({ id: b.id, name: b.name })}
                >
                  삭제
                </Button>
              </div>
            </div>
          ))}
          {beacons && beacons.length === 0 && <AsyncState status="empty" title="등록된 비콘이 없습니다." />}
        </div>
      </Card>

      <StepFooter buildingId={buildingId} floorId={floorId} current="beacons" />

      <ConfirmDialog
        open={!!deleteTarget}
        title="비콘을 삭제할까요?"
        description={`'${deleteTarget?.name}' — 삭제하면 되돌릴 수 없습니다.`}
        pending={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) del.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })
        }}
      />

      <ConfirmDialog
        open={!!importPlan}
        title="지도 데이터를 가져올까요?"
        description={
          importPlan
            ? `생성 ${importPlan.toCreate.length} · 갱신 ${importPlan.toUpdate.length} · 삭제 ${importPlan.toDelete.length} — 기존에 입력한 이름·MAC·연결자는 유지됩니다.`
            : undefined
        }
        confirmLabel="가져오기"
        confirmVariant="primary"
        pending={importing}
        onCancel={() => setImportPlan(null)}
        onConfirm={confirmImport}
      />
    </div>
  )
}
