import { useEffect, useRef, useState } from 'react'
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
import { FloorMapCanvas } from '@/components/map/FloorMapCanvas'
import type { MapPoint } from '@/components/map/FloorMapCanvas'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BEACON_TYPE_COLOR as TYPE_COLOR, BEACON_TYPE_LABEL as TYPE_LABEL, MAP_DESIGN_W } from '@/lib/constants'
import { D_MAX_M, planReinforcementBeacons } from '@/lib/reinforcementBeacons'
import type { ReinforcementPlanItem } from '@/lib/reinforcementBeacons'
import { parseMappinProjectFile, toDesignCoords, diffImport } from '@/lib/mapImport'
import type { ImportPlan } from '@/lib/mapImport'
import { loadBeaconDraft, saveBeaconDraft } from '@/features/beacons/beaconDraftStorage'
import type { Beacon } from '@/types/domain'

const PENDING_ID = '__pending__'

export default function BeaconListPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: beacons, isLoading: beaconsLoading, isError: beaconsError, refetch: refetchBeacons } = useBeacons(floorId)
  const { data: mask, isLoading: maskLoading } = useMask(floorId)
  const { data: scale } = useScale(floorId)
  const create = useCreateBeacon(floorId)
  const update = useUpdateBeacon(floorId)
  const del = useDeleteBeacon(floorId)

  // 의미비콘은 왼쪽, 보강비콘은 오른쪽 열로 나눠 각각 5개씩 페이지네이션한다.
  // (한 줄로 쭉 나열하면 세로로만 길어져 가로 공간이 낭비된다.)
  const semanticBeacons = (beacons ?? []).filter((b) => b.type === 'semantic')
  const reinforcementBeacons = (beacons ?? []).filter((b) => b.type === 'reinforcement')
  const semanticPage = usePagination(semanticBeacons, 5)
  const reinforcementPage = usePagination(reinforcementBeacons, 5)

  // 작성 중이던 폼은 층별 초안으로 복원한다. 축척을 설정하러 다른 화면에 다녀와도
  // 이름·MAC·minor·찍어둔 위치를 잃지 않고 이어서 등록할 수 있게 한다.
  const [name, setName] = useState(() => loadBeaconDraft(floorId)?.name ?? '')
  const [mac, setMac] = useState(() => loadBeaconDraft(floorId)?.mac ?? '')
  const [minor, setMinor] = useState(() => loadBeaconDraft(floorId)?.minor ?? '')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(
    () => loadBeaconDraft(floorId)?.pendingPos ?? null,
  )

  // 입력이 바뀔 때마다 초안을 보관한다. 등록 성공 시 폼이 비면 saveBeaconDraft가 초안을 지운다.
  useEffect(() => {
    saveBeaconDraft(floorId, { name, mac, minor, pendingPos })
  }, [floorId, name, mac, minor, pendingPos])
  const [alignSnapEnabled, setAlignSnapEnabled] = useState(true)
  const [corridorSnapEnabled, setCorridorSnapEnabled] = useState(true)

  const [reinforcePlan, setReinforcePlan] = useState<ReinforcementPlanItem[] | null>(null)
  const [reinforceError, setReinforceError] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [applyingReinforce, setApplyingReinforce] = useState(false)

  const importFileInputRef = useRef<HTMLInputElement>(null)
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

  async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change가 뜨도록
    if (!file) return
    setImportError(null)
    try {
      const project = await parseMappinProjectFile(file)
      const sources = project.beacons.map((b) => {
        const { x, y } = toDesignCoords(b.x, b.y, project.origW)
        return { uid: b.uid, label: b.id, x, y }
      })
      const plan = diffImport(beacons ?? [], sources)
      if (plan.toCreate.length === 0 && plan.toUpdate.length === 0 && plan.toDelete.length === 0) {
        setImportError('변경 사항이 없습니다 — 이미 최신 상태입니다.')
        return
      }
      setImportPlan(plan)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '가져오기에 실패했습니다.')
    }
  }

  // 지금 등록된 비콘을 mapImport.ts가 읽을 수 있는 mappinProject 형식으로 내보낸다 — 이 파일을 다시
  // "지도 데이터 가져오기"에 넣으면 그대로 복원된다(백업 겸 다른 층/환경으로 옮기는 용도).
  function onExport() {
    const payload = {
      mappinProject: true,
      origW: MAP_DESIGN_W,
      beacons: (beacons ?? [])
        .filter((b) => b.x != null && b.y != null)
        .map((b) => ({ id: b.sourceLabel ?? b.name, uid: b.sourceUid ?? b.id, x: b.x as number, y: b.y as number })),
      landmarks: [],
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `beacons-${floorId}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function confirmImportBeacons() {
    if (!importPlan) return
    setImporting(true)
    try {
      let nextMinor = (beacons ?? []).reduce((max, b) => Math.max(max, b.minor), 0) + 1
      for (const source of importPlan.toCreate) {
        await create.mutateAsync({
          name: source.label, // map-tool엔 이름이 없어 표시 라벨(B3 등)을 우선 이름으로 씀 — 목록에서 편집 가능
          minor: nextMinor++,
          type: 'semantic',
          x: source.x,
          y: source.y,
          sourceUid: source.uid,
          sourceLabel: source.label,
        })
      }
      for (const { target, source } of importPlan.toUpdate) {
        // 위치만 갱신 — 관리자가 입력한 이름·MAC·타입은 그대로 유지
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
    // 배치 중인 점 주변에 D_max(6m) 커버리지 원을 보여준다 — 마스크·축척이 있어야 실거리 환산 가능
    const maskRatio = mask ? mask.width / MAP_DESIGN_W : null
    const radiusHintPx =
      maskRatio && scale ? D_MAX_M / (maskRatio * scale.scaleMPerPx) : undefined
    points.push({
      id: PENDING_ID,
      x: pendingPos.x,
      y: pendingPos.y,
      color: '#8C99B3',
      label: name.trim() || '새 위치',
      radius: 5,
      radiusHintPx,
    })
  }

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: floor ? `${floor.floor}층` : '층', to: `/buildings/${buildingId}/floors` },
    { label: '비콘' },
  ]

  if (maskLoading) return <p className="text-muted">불러오는 중…</p>

  // 통행 영역(마스크)이 없으면 복도 중앙 스냅이 아예 동작하지 않는데, 그 상태로 비콘을 미리 찍어두면
  // 나중에 지도 검수를 마친 뒤 위치가 복도에서 벗어나 있어 다시 손봐야 한다 — 아예 먼저 하도록 막는다.
  if (!mask?.dataUrl) {
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <h1>비콘 등록</h1>
        <Card>
          <p className="text-muted">지도 검수에서 통행 영역을 먼저 저장해야 비콘을 배치할 수 있습니다.</p>
          <Link to={`/buildings/${buildingId}/floors/${floorId}/map`} className="inline-block mt-3">
            <Button>지도 검수로 이동</Button>
          </Link>
        </Card>
      </div>
    )
  }

  // 두 열이 공유하는 비콘 행. 좁아진 열 폭에 맞춰 이름·메타는 위아래로 쌓고 버튼은 오른쪽에 둔다.
  const beaconRow = (b: Beacon) => (
    <div key={b.id} className="flex items-center justify-between gap-2 p-3 border border-line rounded-lg">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TYPE_COLOR[b.type] }} />
          <span className="font-medium truncate">{b.name}</span>
          {b.sourceLabel && (
            <span className="text-[11px] text-muted border border-line rounded px-1.5 py-0.5 shrink-0">
              {b.sourceLabel}
            </span>
          )}
        </div>
        <div className="text-[13px] text-muted mt-0.5 truncate">
          {b.mac ? `${b.mac} · ` : ''}major {b.major} · minor {b.minor}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
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
  )

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
            snapToCorridorCenter={corridorSnapEnabled}
            alignSnapEnabled={alignSnapEnabled}
          />
          <div className="flex flex-wrap items-center gap-4 mt-2 text-[13px] text-muted">
            <span style={{ color: TYPE_COLOR.semantic }}>● 의미비콘</span>
            <span style={{ color: TYPE_COLOR.reinforcement }}>● 보강비콘</span>
            <span>· 지도를 클릭해 새 비콘 위치 지정 · 드래그하면 복도 중심에 자동으로 붙습니다</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-[13px]">
            <label className="flex items-center gap-2.5">
              <span className="text-muted">복도 중앙 스냅</span>
              <Toggle checked={corridorSnapEnabled} onChange={setCorridorSnapEnabled} />
            </label>
            {corridorSnapEnabled && !scale && (
              <span style={{ color: '#DC4C4C' }} className="inline-flex items-center gap-2 flex-wrap">
                ⚠ 축척 미설정 — 지도 검수에서 축척을 먼저 설정해야 복도 폭을 정확히 판단합니다
                <Link
                  to={`/buildings/${buildingId}/floors/${floorId}/map`}
                  className="text-brand font-semibold whitespace-nowrap hover:underline"
                >
                  축척 설정하러 가기 →
                </Link>
              </span>
            )}
            {corridorSnapEnabled && scale && (
              <span className="text-muted">현재 축척: 100px ≈ {(scale.scaleMPerPx * 100).toFixed(2)}m</span>
            )}
            <label className="flex items-center gap-2.5">
              <span className="text-muted">다른 비콘과 정렬 스냅</span>
              <Toggle checked={alignSnapEnabled} onChange={setAlignSnapEnabled} />
            </label>
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
              ref={importFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportFileChange}
            />
            <Button
              variant="outline"
              style={{ height: 34, padding: '0 12px' }}
              disabled={!beacons || beacons.length === 0}
              onClick={onExport}
            >
              내보내기
            </Button>
            <Button
              variant="outline"
              style={{ height: 34, padding: '0 12px' }}
              onClick={() => importFileInputRef.current?.click()}
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
        {reinforceError && <p className="text-[13px] mt-2" style={{ color: '#DC4C4C' }}>{reinforceError}</p>}
        {importError && <p className="text-[13px] mt-2" style={{ color: '#DC4C4C' }}>{importError}</p>}
        {beaconsLoading && <AsyncState status="loading" />}
        {beaconsError && <AsyncState status="error" onRetry={() => refetchBeacons()} />}
        {!beaconsLoading && !beaconsError && (
          <div className="grid grid-cols-2 gap-6 mt-4">
            {/* 왼쪽: 의미비콘 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLOR.semantic }} />
                <h4 className="text-sm font-semibold text-ink">{TYPE_LABEL.semantic}</h4>
                <span className="text-[13px] text-muted">{semanticBeacons.length}</span>
              </div>
              <div className="grid gap-2">
                {semanticPage.pageItems.map(beaconRow)}
                {semanticBeacons.length === 0 && <AsyncState status="empty" title="의미비콘이 없습니다." />}
              </div>
              <Pagination page={semanticPage.page} pageCount={semanticPage.pageCount} onChange={semanticPage.setPage} />
            </div>

            {/* 오른쪽: 보강비콘 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLOR.reinforcement }} />
                <h4 className="text-sm font-semibold text-ink">{TYPE_LABEL.reinforcement}</h4>
                <span className="text-[13px] text-muted">{reinforcementBeacons.length}</span>
              </div>
              <div className="grid gap-2">
                {reinforcementPage.pageItems.map(beaconRow)}
                {reinforcementBeacons.length === 0 && <AsyncState status="empty" title="보강비콘이 없습니다." />}
              </div>
              <Pagination
                page={reinforcementPage.page}
                pageCount={reinforcementPage.pageCount}
                onChange={reinforcementPage.setPage}
              />
            </div>
          </div>
        )}
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

      <ConfirmDialog
        open={!!importPlan}
        title="지도 데이터를 가져올까요?"
        description={
          importPlan
            ? `새로 추가 ${importPlan.toCreate.length}개 · 위치 갱신 ${importPlan.toUpdate.length}개 · 삭제 ${importPlan.toDelete.length}개. 직접 추가한 비콘은 영향받지 않습니다. 새로 추가되는 비콘의 이름·MAC은 이후 목록에서 편집할 수 있습니다.`
            : undefined
        }
        confirmLabel="가져오기"
        confirmVariant="primary"
        pending={importing}
        onCancel={() => setImportPlan(null)}
        onConfirm={confirmImportBeacons}
      />
    </div>
  )
}
