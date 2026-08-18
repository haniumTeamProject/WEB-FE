import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useFloorplan } from '@/features/floorplan/hooks'
import {
  useCreateLandmark,
  useDeleteLandmark,
  useLandmarks,
  useUpdateLandmark,
} from '@/features/landmarks/hooks'
import { FloorMapCanvas } from '@/components/map/FloorMapCanvas'
import type { MapPoint } from '@/components/map/FloorMapCanvas'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { CategorySelect } from '@/components/ui/CategorySelect'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LANDMARK_COLOR, LANDMARK_CATEGORIES, MAP_DESIGN_W } from '@/lib/constants'
import { parseMappinProjectFile, toDesignCoords, diffImport } from '@/lib/mapImport'
import type { ImportPlan } from '@/lib/mapImport'
import type { Landmark } from '@/types/domain'

const PENDING_ID = '__pending__'

export default function LandmarkPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: floorplan, isLoading: floorplanLoading } = useFloorplan(floorId)
  const { data: landmarks, isLoading: landmarksLoading, isError: landmarksError, refetch: refetchLandmarks } = useLandmarks(floorId)
  const create = useCreateLandmark(floorId)
  const update = useUpdateLandmark(floorId)
  const del = useDeleteLandmark(floorId)

  // 목록을 지도상 위치 기준 왼쪽→오른쪽으로 정렬한다(x 오름차순, x가 같으면 위→아래).
  // 관리자가 도면을 훑는 순서와 목록 순서가 일치해 어떤 목적지인지 찾기 쉽다.
  // 위치가 아직 없는 목적지는 맨 뒤로 보낸다.
  const orderedLandmarks = [...(landmarks ?? [])].sort((a, b) => {
    const ax = a.x ?? Infinity
    const bx = b.x ?? Infinity
    if (ax !== bx) return ax - bx
    return (a.y ?? Infinity) - (b.y ?? Infinity)
  })

  // 목록은 5개씩 나눠 보여준다.
  const landmarkPage = usePagination(orderedLandmarks, 5)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)

  const importFileInputRef = useRef<HTMLInputElement>(null)
  const [importPlan, setImportPlan] = useState<ImportPlan<Landmark> | null>(null)
  const [importNameByUid, setImportNameByUid] = useState<Map<string, string>>(new Map())
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const valid = name.trim() !== '' && !!pendingPos

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || !pendingPos) return
    create.mutate(
      { name: name.trim(), category: category.trim() || undefined, x: pendingPos.x, y: pendingPos.y },
      {
        onSuccess: () => {
          setName('')
          setCategory('')
          setPendingPos(null)
        },
      },
    )
  }

  async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change가 뜨도록
    if (!file) return
    setImportError(null)
    try {
      const project = await parseMappinProjectFile(file)
      const nameByUid = new Map(project.landmarks.map((l) => [l.uid, l.name]))
      const sources = project.landmarks.map((l) => {
        const { x, y } = toDesignCoords(l.x, l.y, project.origW)
        return { uid: l.uid, label: l.id, x, y }
      })
      const plan = diffImport(landmarks ?? [], sources)
      if (plan.toCreate.length === 0 && plan.toUpdate.length === 0 && plan.toDelete.length === 0) {
        setImportError('변경 사항이 없습니다 — 이미 최신 상태입니다.')
        return
      }
      setImportNameByUid(nameByUid)
      setImportPlan(plan)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '가져오기에 실패했습니다.')
    }
  }

  // 지금 등록된 목적지를 mapImport.ts가 읽을 수 있는 mappinProject 형식으로 내보낸다 — 이 파일을 다시
  // "지도 데이터 가져오기"에 넣으면 그대로 복원된다(백업 겸 다른 층/환경으로 옮기는 용도).
  function onExport() {
    const payload = {
      mappinProject: true,
      origW: MAP_DESIGN_W,
      beacons: [],
      landmarks: (landmarks ?? [])
        .filter((l) => l.x != null && l.y != null)
        .map((l) => ({
          id: l.sourceLabel ?? l.name,
          uid: l.sourceUid ?? l.id,
          x: l.x as number,
          y: l.y as number,
          name: l.name,
        })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `landmarks-${floorId}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function confirmImport() {
    if (!importPlan) return
    setImporting(true)
    try {
      for (const source of importPlan.toCreate) {
        await create.mutateAsync({
          name: importNameByUid.get(source.uid) ?? source.label,
          x: source.x,
          y: source.y,
          sourceUid: source.uid,
          sourceLabel: source.label,
        })
      }
      for (const { target, source } of importPlan.toUpdate) {
        await update.mutateAsync({
          landmarkId: target.id,
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

  const categoryOptions = Array.from(
    new Set([...LANDMARK_CATEGORIES, ...(landmarks ?? []).map((l) => l.category).filter((c): c is string => !!c)]),
  )

  const points: MapPoint[] = (landmarks ?? [])
    .filter((l) => l.x != null && l.y != null)
    .map((l) => ({ id: l.id, x: l.x as number, y: l.y as number, color: LANDMARK_COLOR, label: l.name }))
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
    { label: '목적지' },
  ]

  if (floorplanLoading) return <p className="text-muted">불러오는 중…</p>

  if (!floorplan) {
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <h1>목적지 관리</h1>
        <Card>
          <p className="text-muted">설계도가 아직 없습니다. 먼저 설계도를 업로드하세요.</p>
          <Link to={`/buildings/${buildingId}/floors/${floorId}/floorplan`} className="inline-block mt-3">
            <Button>설계도 업로드</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>목적지 관리</h1>
      <p className="text-muted text-[13px] -mt-3 mb-5">
        ① 목적지 이름은 평면도 상 표기를 그대로 쓰는 것을 원칙으로 한다.
        <br />② 제1원칙 적용이 불가능할 경우 최대한 비슷하게 유지한다.
      </p>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <FloorMapCanvas
            floorId={floorId}
            points={points}
            onMove={(id, x, y) => {
              if (id === PENDING_ID) setPendingPos({ x, y })
              else update.mutate({ landmarkId: id, input: { x, y } })
            }}
            onCanvasClick={(x, y) => setPendingPos({ x, y })}
          />
          <p className="mt-2 text-[13px] text-muted">
            사용자가 음성으로 말하는 목적지 후보입니다. 지도를 클릭해 새 목적지 위치를 지정하고, 점을 드래그해 위치를
            조정하세요.
          </p>
        </div>

        <Card className="w-[320px] shrink-0">
          <h3>목적지 추가</h3>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Input label="이름" placeholder="406호" value={name} onChange={(e) => setName(e.target.value)} />
            <CategorySelect
              label="카테고리"
              placeholder="강의실"
              value={category}
              onChange={setCategory}
              options={categoryOptions}
            />
            <Button type="submit" disabled={!valid || create.isPending}>
              목적지 추가
            </Button>
            <p className="text-muted text-[13px]">
              {pendingPos ? '위치가 지정됐습니다. 점을 드래그해 조정할 수 있어요.' : '지도를 클릭해 배치할 위치를 먼저 지정하세요.'}
            </p>
          </form>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h3>등록된 목적지</h3>
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
              disabled={!landmarks || landmarks.length === 0}
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
          </div>
        </div>
        {importError && <p className="text-[13px] mt-2" style={{ color: '#DC4C4C' }}>{importError}</p>}
        {landmarksLoading && <AsyncState status="loading" />}
        {landmarksError && <AsyncState status="error" onRetry={() => refetchLandmarks()} />}
        <div className="grid gap-2 mt-3">
          {!landmarksLoading && !landmarksError && landmarkPage.pageItems.map((l) => (
            <div key={l.id} className="flex items-center justify-between p-3 border border-line rounded-lg">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: LANDMARK_COLOR }} />
                <span className="font-medium">{l.name}</span>
                {l.sourceLabel && (
                  <span className="text-[11px] text-muted border border-line rounded px-1.5 py-0.5">
                    {l.sourceLabel}
                  </span>
                )}
                {l.category && <span className="text-[13px] text-muted">{l.category}</span>}
              </div>
              <div className="flex gap-2">
                <Link to={`/buildings/${buildingId}/floors/${floorId}/landmarks/${l.id}`}>
                  <Button variant="outline" style={{ height: 34, padding: '0 12px' }}>
                    편집
                  </Button>
                </Link>
                <Button
                  variant="danger"
                  style={{ height: 34, padding: '0 12px' }}
                  onClick={() => setDeleteTarget({ id: l.id, name: l.name })}
                >
                  삭제
                </Button>
              </div>
            </div>
          ))}
          {landmarks && landmarks.length === 0 && <AsyncState status="empty" title="등록된 목적지가 없습니다." />}
        </div>
        {!landmarksLoading && !landmarksError && (
          <Pagination page={landmarkPage.page} pageCount={landmarkPage.pageCount} onChange={landmarkPage.setPage} />
        )}
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

      <ConfirmDialog
        open={!!importPlan}
        title="지도 데이터를 가져올까요?"
        description={
          importPlan
            ? `새로 추가 ${importPlan.toCreate.length}개 · 위치 갱신 ${importPlan.toUpdate.length}개 · 삭제 ${importPlan.toDelete.length}개. 직접 추가한 목적지는 영향받지 않습니다.`
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
