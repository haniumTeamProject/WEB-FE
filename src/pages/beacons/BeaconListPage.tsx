import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import {
  useBeacons,
  useCreateBeacon,
  useDeleteBeacon,
  useUpdateBeacon,
} from '@/features/beacons/hooks'
import { useMask, useScale } from '@/features/mapEditor/hooks'
import type { Beacon } from '@/types/domain'
import { FloorMapCanvas } from '@/components/map/FloorMapCanvas'
import type { MapPoint } from '@/components/map/FloorMapCanvas'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BEACON_TYPE_COLOR as TYPE_COLOR, BEACON_TYPE_LABEL as TYPE_LABEL } from '@/lib/constants'
import { diffImport, parseMappinProjectFile, toDesignCoords } from '@/lib/mapImport'
import type { ImportPlan } from '@/lib/mapImport'
import { planReinforcementBeacons } from '@/lib/reinforcementBeacons'
import type { ReinforcementPlanItem } from '@/lib/reinforcementBeacons'

const PENDING_ID = '__pending__'

export default function BeaconListPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: beacons, isLoading: beaconsLoading, isError: beaconsError, refetch: refetchBeacons } = useBeacons(floorId)
  const { data: mask } = useMask(floorId)
  const { data: scale } = useScale(floorId)
  const create = useCreateBeacon(floorId)
  const update = useUpdateBeacon(floorId)
  const del = useDeleteBeacon(floorId)

  const [name, setName] = useState('')
  const [mac, setMac] = useState('')
  const [minor, setMinor] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importPlan, setImportPlan] = useState<ImportPlan<Beacon> | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const [reinforcePlan, setReinforcePlan] = useState<ReinforcementPlanItem[] | null>(null)
  const [reinforceError, setReinforceError] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [applyingReinforce, setApplyingReinforce] = useState(false)

  const valid = name.trim() !== '' && minor !== '' && Number.isInteger(Number(minor)) && !!pendingPos

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || !pendingPos) return
    create.mutate(
      {
        name: name.trim(),
        mac: mac.trim() || undefined,
        minor: Number(minor),
        type: 'semantic',
        x: pendingPos.x,
        y: pendingPos.y,
      },
      {
        onSuccess: () => {
          setName('')
          setMac('')
          setMinor('')
          setPendingPos(null)
        },
      },
    )
  }

  async function onPlanReinforce() {
    if (!mask || !scale) return
    setReinforceError(null)
    setPlanning(true)
    try {
      const semanticPoints = (beacons ?? [])
        .filter((b) => b.type === 'semantic' && b.x != null && b.y != null)
        .map((b) => ({ id: b.id, x: b.x as number, y: b.y as number }))
      const plan = await planReinforcementBeacons(semanticPoints, mask, scale.scaleMPerPx)
      const hasExisting = (beacons ?? []).some((b) => b.type === 'reinforcement')
      if (plan.length === 0 && !hasExisting) {
        setReinforceError('간격이 6m를 넘는 구간이 없어 보강비콘이 필요하지 않습니다.')
        return
      }
      setReinforcePlan(plan)
    } catch (err) {
      setReinforceError(err instanceof Error ? err.message : '계산에 실패했습니다.')
    } finally {
      setPlanning(false)
    }
  }

  async function confirmReinforce() {
    if (!reinforcePlan) return
    setApplyingReinforce(true)
    try {
      const existingReinforcement = (beacons ?? []).filter((b) => b.type === 'reinforcement')
      for (const b of existingReinforcement) {
        await del.mutateAsync(b.id)
      }
      let nextMinor =
        (beacons ?? [])
          .filter((b) => !existingReinforcement.includes(b))
          .reduce((max, b) => Math.max(max, b.minor), 0) + 1
      for (let i = 0; i < reinforcePlan.length; i++) {
        const item = reinforcePlan[i]
        await create.mutateAsync({
          name: `보강비콘 ${i + 1}`,
          minor: nextMinor++,
          type: 'reinforcement',
          x: item.x,
          y: item.y,
        })
      }
      setReinforcePlan(null)
    } finally {
      setApplyingReinforce(false)
    }
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
    .map((b) => ({
      id: b.id,
      x: b.x as number,
      y: b.y as number,
      color: TYPE_COLOR[b.type],
      label: b.name,
      draggable: b.type === 'semantic', // 보강비콘은 자동계산된 위치라 드래그로 옮기지 않는다
      radius: 5,
    }))
  if (pendingPos) {
    points.push({
      id: PENDING_ID,
      x: pendingPos.x,
      y: pendingPos.y,
      color: '#8C99B3',
      label: name.trim() || '새 위치',
      radius: 5,
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
          <div className="flex gap-2">
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
            <Button
              variant="outline"
              style={{ height: 34, padding: '0 12px' }}
              disabled={!mask || !scale || planning}
              onClick={onPlanReinforce}
            >
              {planning ? '계산 중…' : '보강비콘 자동생성'}
            </Button>
          </div>
        </div>
        {(!mask || !scale) && (
          <p className="text-[13px] text-muted mt-2">
            보강비콘 자동생성은 지도 검수(마스크)와 축척 설정을 먼저 완료해야 사용할 수 있습니다.
          </p>
        )}
        {importError && <p className="text-[13px] mt-2" style={{ color: '#DC4C4C' }}>{importError}</p>}
        {reinforceError && <p className="text-[13px] mt-2" style={{ color: '#DC4C4C' }}>{reinforceError}</p>}
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
            ? `생성 ${importPlan.toCreate.length} · 갱신 ${importPlan.toUpdate.length} · 삭제 ${importPlan.toDelete.length} — 기존에 입력한 이름·MAC은 유지됩니다.`
            : undefined
        }
        confirmLabel="가져오기"
        confirmVariant="primary"
        pending={importing}
        onCancel={() => setImportPlan(null)}
        onConfirm={confirmImport}
      />

      <ConfirmDialog
        open={!!reinforcePlan}
        title="보강비콘을 자동생성할까요?"
        description={
          reinforcePlan
            ? `기존 보강비콘 ${(beacons ?? []).filter((b) => b.type === 'reinforcement').length}개를 삭제하고, 새로 ${reinforcePlan.length}개를 생성합니다. 위치는 자동계산되며 이름·MAC은 이후 목록에서 편집할 수 있습니다.`
            : undefined
        }
        confirmLabel="생성"
        confirmVariant="primary"
        pending={applyingReinforce}
        onCancel={() => setReinforcePlan(null)}
        onConfirm={confirmReinforce}
      />
    </div>
  )
}
