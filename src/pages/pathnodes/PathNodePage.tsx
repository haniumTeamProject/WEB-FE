import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Circle, Line } from 'react-konva'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask, useScale } from '@/features/mapEditor/hooks'
import { useConnectors } from '@/features/connectors/hooks'
import { useLandmarks } from '@/features/landmarks/hooks'
import { generatePathNodes } from '@/features/mapEditor/pathNodes'
import type { EntrancePoint, PathEdge, PathNode } from '@/features/mapEditor/pathNodes'
import { findShortestPath } from '@/features/mapEditor/pathfind'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const DESIGN_W = 900 // 비콘/랜드마크 좌표 기준 폭 — FloorMapCanvas.DESIGN_W와 동일

const ENTRANCE_COLOR: Record<'connector' | 'landmark', string> = {
  connector: '#2563eb',
  landmark: '#f2992e',
}

function nodeColor(node: PathNode): string {
  if (node.type === 'corner') return node.concave ? '#db2777' : '#7c3aed'
  if (node.type === 'connector' || node.type === 'landmark') return ENTRANCE_COLOR[node.type]
  // facing: 입구(연결자/랜드마크)의 맞은편이면 그 색, 코너에서 뻗어나온 맞은편이면 코너와 같은 보라
  return node.pairKind ? ENTRANCE_COLOR[node.pairKind] : '#7c3aed'
}

// 건너기(cross) 엣지가 a->b 한쪽 방향만 가능하다는 걸 점선만으로는 알기 어려워서, 화살촉 삼각형 좌표를
// 계산해 방향을 명확히 보여준다. tipX/tipY 위치에 화살촉 끝이 오도록, from->to 방향을 기준으로 그린다.
function arrowheadPoints(fromX: number, fromY: number, tipX: number, tipY: number, size: number): number[] {
  const angle = Math.atan2(tipY - fromY, tipX - fromX)
  const spread = 0.5
  return [
    tipX,
    tipY,
    tipX - size * Math.cos(angle - spread),
    tipY - size * Math.sin(angle - spread),
    tipX - size * Math.cos(angle + spread),
    tipY - size * Math.sin(angle + spread),
  ]
}

const DEFAULT_CROSSING_MAX_M = 12 // 축척 미설정 시 기본 횡단 가능 거리(대략 240px 상당)
const MIN_CORNER_CLEARANCE_M = 0.3 // 코너 횡단 좌우 최소 여유 — 이보다 벽이 가까우면 벽을 타는 걸로 보고 안 만든다
const DEFAULT_CROSS_PENALTY_M = 5 // 건너기 페널티 기본값 — 이만큼 이상 절약될 때만 건넘

function storageKey(floorId: string) {
  return `pathNodes:${floorId}`
}

interface StoredPathNodes {
  nodes: PathNode[]
  edges: PathEdge[]
  maskW: number
  maskH: number
}

function readStoredPathNodes(floorId: string): StoredPathNodes | null {
  if (!floorId) return null
  const raw = localStorage.getItem(storageKey(floorId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredPathNodes
  } catch {
    // 저장된 값이 손상된 경우 무시하고 새로 생성하도록 둔다
    return null
  }
}

// 저장된 마스크(PNG, 투명=미통행) 를 디코딩해 픽셀 단위 Uint8Array로 변환
function decodeMask(dataUrl: string, w: number, h: number): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = h
      const ctx = tmp.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data
      const mask = new Uint8Array(w * h)
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 0 ? 1 : 0
      resolve(mask)
    }
    img.src = dataUrl
  })
}

// 지도 검수에서 저장된 통행 영역 + 비콘/목적지 입구로 경로노드를 생성하고, 점을 드래그해 수정할 수 있는 마지막 단계.
// 지도 검수 단계와 분리된 별도 페이지 — 이동 결과는 층 ID 기준 localStorage에 저장(백엔드 저장은 추후 작업).
export default function PathNodePage() {
  const { buildingId = '', floorId = '' } = useParams()
  const navigate = useNavigate()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: floorplan, isLoading } = useFloorplan(floorId)
  const { data: savedMask } = useMask(floorId)
  const { data: savedScale } = useScale(floorId)
  const { data: connectors } = useConnectors(buildingId)
  const { data: landmarks } = useLandmarks(floorId)
  const [crossingMaxM, setCrossingMaxM] = useState(String(DEFAULT_CROSSING_MAX_M))
  const [minClearanceM, setMinClearanceM] = useState(String(MIN_CORNER_CLEARANCE_M))

  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(700)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [loadedImg, setLoadedImg] = useState<{ url: string; image: HTMLImageElement } | null>(null)
  useEffect(() => {
    const url = floorplan?.imageUrl
    if (!url) return
    const image = new window.Image()
    image.onload = () => setLoadedImg({ url, image })
    image.src = url
  }, [floorplan?.imageUrl])
  // 로드 완료된 이미지의 URL이 현재 floorplan URL과 다르면(층 전환 등) 이전 이미지를 그리지 않는다.
  const displayImg = loadedImg && loadedImg.url === floorplan?.imageUrl ? loadedImg.image : null

  // 저장된 수정물이 있어도 페이지에 들어오자마자 자동으로 보여주지 않는다 — '경로 노드 생성' 버튼을
  // 눌러야 비로소(저장된 게 있으면 그걸, 없으면 새로) 불러온다.
  const [nodes, setNodes] = useState<PathNode[]>([])
  const [edges, setEdges] = useState<PathEdge[]>([])
  const [maskDims, setMaskDims] = useState<{ w: number; h: number } | null>(null)
  const [generating, setGenerating] = useState(false)
  // TODO: 횡단(cross) 관련 신고가 또 들어오면 화면에서 바로 확인할 수 있게 임시로 남겨둔다.
  // 문제 없이 몇 번 확인되면 지워도 된다.
  const [genSummary, setGenSummary] = useState<string | null>(null)

  const [testMode, setTestMode] = useState(false)
  const [testStart, setTestStart] = useState<string | null>(null)
  const [testEnd, setTestEnd] = useState<string | null>(null)
  const [crossPenaltyM, setCrossPenaltyM] = useState(String(DEFAULT_CROSS_PENALTY_M))

  const stageRef = useRef<Konva.Stage>(null)
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [nodeDragging, setNodeDragging] = useState(false)
  const MIN_ZOOM = 1 // 기본 화면(맞춤 배율) 밑으로는 축소 못 하게
  const MAX_ZOOM = 6

  function zoomBy(factor: number) {
    setZoom((z) => Math.min(Math.max(z * factor, MIN_ZOOM), MAX_ZOOM))
  }
  function resetView() {
    setZoom(1)
    setStagePos({ x: 0, y: 0 })
  }
  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!stage || !pointer) return
    const pointTo = { x: (pointer.x - stagePos.x) / zoom, y: (pointer.y - stagePos.y) / zoom }
    const nextZoom = Math.min(Math.max(e.evt.deltaY > 0 ? zoom / 1.05 : zoom * 1.05, MIN_ZOOM), MAX_ZOOM)
    setZoom(nextZoom)
    setStagePos({ x: pointer.x - pointTo.x * nextZoom, y: pointer.y - pointTo.y * nextZoom })
  }

  // 층이 바뀌면 확대/이동 상태를 초기화하고, 그 층에 저장된 경로노드가 있으면 복원한다.
  // (렌더 중 상태 조정 — effect 안에서 동기 setState를 피함. https://react.dev/learn/you-might-not-need-an-effect)
  const [viewFloorId, setViewFloorId] = useState(floorId)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const historyRef = useRef<{ nodes: PathNode[]; edges: PathEdge[] }[]>([])
  const redoRef = useRef<{ nodes: PathNode[]; edges: PathEdge[] }[]>([])
  if (floorId !== viewFloorId) {
    setViewFloorId(floorId)
    resetView()
    setNodes([])
    setEdges([])
    setMaskDims(null)
  }

  // 층이 바뀌면 되돌리기/다시실행 기록도 초기화한다(ref라 렌더 중이 아니라 커밋 후 effect에서 처리).
  useEffect(() => {
    historyRef.current = []
    redoRef.current = []
  }, [floorId])

  function persist(nextNodes: PathNode[], nextEdges: PathEdge[], dims: { w: number; h: number }) {
    const payload: StoredPathNodes = { nodes: nextNodes, edges: nextEdges, maskW: dims.w, maskH: dims.h }
    localStorage.setItem(storageKey(floorId), JSON.stringify(payload))
  }

  // 지금 상태를 되돌리기 스택에 남긴다 — 다시실행 스택은 새 작업이 생겼으니 비운다.
  function pushHistory() {
    historyRef.current.push({ nodes, edges })
    if (historyRef.current.length > 20) historyRef.current.shift()
    redoRef.current = []
  }

  function undo() {
    if (!maskDims) return
    const prev = historyRef.current.pop()
    if (!prev) return
    redoRef.current.push({ nodes, edges })
    setNodes(prev.nodes)
    setEdges(prev.edges)
    persist(prev.nodes, prev.edges, maskDims)
  }

  function redo() {
    if (!maskDims) return
    const next = redoRef.current.pop()
    if (!next) return
    historyRef.current.push({ nodes, edges })
    setNodes(next.nodes)
    setEdges(next.edges)
    persist(next.nodes, next.edges, maskDims)
  }

  // 되돌리기/다시실행 키보드 단축키(Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z 또는 Ctrl+Y) — 모달이 열려있을 땐 끔
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (confirmSaveOpen) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && key === 'z') || key === 'y')) {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmSaveOpen, nodes, edges, maskDims])

  async function onGenerate() {
    if (!savedMask?.dataUrl) return
    // 화면에 아직 아무것도 안 띄운 첫 클릭이고 이전에 저장해둔 게 있으면, 새로 만들지 않고
    // 그 수정물을 그대로 불러온다 — 드래그로 고친 위치가 날아가지 않게.
    if (nodes.length === 0 && edges.length === 0) {
      const stored = readStoredPathNodes(floorId)
      if (stored) {
        setNodes(stored.nodes)
        setEdges(stored.edges)
        setMaskDims({ w: stored.maskW, h: stored.maskH })
        return
      }
    }
    if (nodes.length > 0) pushHistory() // 처음 생성은 되돌릴 이전 상태가 없으니 건너뜀
    setGenerating(true)
    try {
      const dims = { w: savedMask.width, h: savedMask.height }
      const mask = await decodeMask(savedMask.dataUrl, dims.w, dims.h)
      const maskScale = dims.w / DESIGN_W
      const entrances: EntrancePoint[] = [
        ...(connectors ?? [])
          .flatMap((c) => c.positions?.filter((p) => p.floorId === floorId) ?? [])
          .map((p) => ({ x: p.x * maskScale, y: p.y * maskScale, kind: 'connector' as const })),
        ...(landmarks ?? [])
          .filter((l) => l.x != null && l.y != null)
          .map((l) => ({ x: (l.x as number) * maskScale, y: (l.y as number) * maskScale, kind: 'landmark' as const })),
      ]
      // PathNode 좌표는 저장된 마스크와 동일한 픽셀 공간이라 축척(scaleMPerPx)을 별도 비율 보정 없이 바로 쓸 수 있다.
      const crossingM = Number(crossingMaxM)
      const crossingMaxPx =
        savedScale && Number.isFinite(crossingM) && crossingM > 0 ? crossingM / savedScale.scaleMPerPx : undefined
      // 코너(벽 끝) 횡단의 옆(수직 방향) 여유가 이 거리보다 좁으면, 벽을 타면 바로 닿는 곳이라 판단해
      // 그 방향은 횡단으로 안내하지 않는다. 이 검사는 건너기 방향과 정확히 좌우/상하인 벽만 감지하므로,
      // 벽이 사선으로 나 있으면 값을 키워야 걸러질 수 있다.
      const clearanceM = Number(minClearanceM)
      const minClearancePx =
        savedScale && Number.isFinite(clearanceM) && clearanceM >= 0 ? clearanceM / savedScale.scaleMPerPx : undefined
      // generatePathNodes는 건너기 후보를 못 찾거나 너무 멀어서 버릴 때 console.warn을 남기는데, 개발자
      // 도구를 못 여는 경우가 있어 그 내용을 화면에도 그대로 보여준다 — 문제 없이 몇 번 확인되면 지워도 된다.
      const skippedWarnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => {
        const msg = args.map(String).join(' ')
        if (msg.includes('[pathNodes]')) skippedWarnings.push(msg.replace('[pathNodes] ', ''))
        originalWarn(...args)
      }
      let n: PathNode[] = []
      let e: PathEdge[] = []
      try {
        ;({ nodes: n, edges: e } = generatePathNodes(mask, dims.w, dims.h, entrances, crossingMaxPx, minClearancePx))
      } finally {
        console.warn = originalWarn
      }
      setNodes(n)
      setEdges(e)
      setMaskDims(dims)
      persist(n, e, dims)
      const concaveCount = n.filter((node) => node.type === 'corner' && node.concave).length
      const convexCount = n.filter((node) => node.type === 'corner' && !node.concave).length
      const crossCount = e.filter((edge) => edge.type === 'cross').length
      const skippedSummary =
        skippedWarnings.length === 0
          ? '건너뛴 후보 없음'
          : `건너뛴 후보 ${skippedWarnings.length}개 (${skippedWarnings.slice(0, 5).join(' / ')}${skippedWarnings.length > 5 ? ' ...' : ''})`
      setGenSummary(
        `노드 ${n.length}개(벽 끝 ${concaveCount} · 일반 코너 ${convexCount}) · 건너기 엣지 ${crossCount}개 · ` +
          `횡단 최대거리=${crossingMaxPx ? Math.round(crossingMaxPx) + 'px' : '기본값(축척 미설정)'} · ${skippedSummary}`,
      )
    } finally {
      setGenerating(false)
    }
  }

  function onNodeMove(id: string, x: number, y: number) {
    if (!maskDims) return
    pushHistory()
    setNodes((prev) => {
      const next = prev.map((node) => (node.id === id ? { ...node, x, y } : node))
      persist(next, edges, maskDims)
      return next
    })
  }

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const scale = maskDims ? width / maskDims.w : 0
  const H = displayImg ? Math.round((displayImg.height / displayImg.width) * width) : 0

  // PathNode 좌표는 저장된 마스크와 같은 픽셀 공간이라 축척을 별도 비율 보정 없이 바로 쓸 수 있다.
  const penaltyM = Number(crossPenaltyM)
  const crossPenaltyPx =
    savedScale && Number.isFinite(penaltyM) && penaltyM >= 0 ? penaltyM / savedScale.scaleMPerPx : 0

  const testResult = useMemo(() => {
    if (!testStart || !testEnd) return null
    return findShortestPath(nodes, edges, testStart, testEnd, crossPenaltyPx)
  }, [nodes, edges, testStart, testEnd, crossPenaltyPx])
  const testDistanceM = testResult && savedScale ? testResult.distancePx * savedScale.scaleMPerPx : null

  function onNodeClickForTest(nodeId: string) {
    if (!testMode) return
    if (!testStart || (testStart && testEnd)) {
      setTestStart(nodeId)
      setTestEnd(null)
      return
    }
    setTestEnd(nodeId)
  }

  function toggleTestMode() {
    setTestMode((v) => {
      const next = !v
      if (!next) {
        setTestStart(null)
        setTestEnd(null)
      }
      return next
    })
  }

  function clearTest() {
    setTestStart(null)
    setTestEnd(null)
  }

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: floor ? `${floor.floor}층` : '층', to: `/buildings/${buildingId}/floors` },
    { label: '경로노드' },
  ]

  if (isLoading) return <p className="text-muted">불러오는 중…</p>

  if (!floorplan) {
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <h1>경로노드</h1>
        <Card>
          <p className="text-muted">설계도가 아직 없습니다. 먼저 설계도를 업로드하세요.</p>
          <Link to={`/buildings/${buildingId}/floors/${floorId}/floorplan`} className="inline-block mt-3">
            <Button>설계도 업로드</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (!savedMask?.dataUrl) {
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <h1>경로노드</h1>
        <Card>
          <p className="text-muted">지도 검수에서 통행 영역을 먼저 저장해야 경로노드를 생성할 수 있습니다.</p>
          <Link to={`/buildings/${buildingId}/floors/${floorId}/map`} className="inline-block mt-3">
            <Button>지도 검수로 이동</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>경로노드</h1>
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <div
            ref={containerRef}
            className="w-full border border-line rounded-lg overflow-hidden bg-white"
            style={{ cursor: 'grab' }}
          >
            {maskDims && (
              <Stage
                ref={stageRef}
                width={width}
                height={H}
                scaleX={zoom}
                scaleY={zoom}
                x={stagePos.x}
                y={stagePos.y}
                draggable={!nodeDragging}
                onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
                onWheel={onWheel}
              >
                <Layer listening={false}>{displayImg && <KonvaImage image={displayImg} width={width} height={H} />}</Layer>
                <Layer listening={false}>
                  {edges.map((edge) => {
                    const a = byId.get(edge.a)
                    const b = byId.get(edge.b)
                    if (!a || !b) return null
                    const ax = a.x * scale
                    const ay = a.y * scale
                    const bx = b.x * scale
                    const by = b.y * scale
                    const isCross = edge.type === 'cross'
                    return (
                      <Fragment key={`${edge.type}-${edge.a}-${edge.b}`}>
                        <Line
                          points={[ax, ay, bx, by]}
                          stroke={isCross ? '#16a34a' : '#7c3aed'}
                          strokeWidth={(isCross ? 1.6 : 1) / zoom}
                          dash={isCross ? [4 / zoom, 3 / zoom] : undefined}
                        />
                        {isCross && (
                          // 화살촉 하나만, 크고 흰 테두리를 둘러서 배경(도면 선·다른 점)과 겹쳐도
                          // 방향이 확실히 보이게 한다 — 중간 화살표는 촘촘한 교차로에서 여러 개가
                          // 겹쳐 오히려 지저분해 보여서 뺐다.
                          <Line
                            points={arrowheadPoints(ax, ay, bx, by, 11 / zoom)}
                            closed
                            fill="#16a34a"
                            stroke="#ffffff"
                            strokeWidth={1.1 / zoom}
                          />
                        )}
                      </Fragment>
                    )
                  })}
                </Layer>
                {testResult && (
                  <Layer listening={false}>
                    {testResult.path.slice(0, -1).map((id, i) => {
                      const a = byId.get(id)
                      const b = byId.get(testResult.path[i + 1])
                      if (!a || !b) return null
                      return (
                        <Line
                          key={`test-${id}-${testResult.path[i + 1]}`}
                          points={[a.x * scale, a.y * scale, b.x * scale, b.y * scale]}
                          stroke="#dc2626"
                          strokeWidth={3 / zoom}
                          lineCap="round"
                        />
                      )
                    })}
                  </Layer>
                )}
                <Layer>
                  {nodes.map((node) => {
                    const isStart = testMode && node.id === testStart
                    const isEnd = testMode && node.id === testEnd
                    return (
                      <Circle
                        key={node.id}
                        x={node.x * scale}
                        y={node.y * scale}
                        radius={(isStart || isEnd ? 9 : 7) / zoom}
                        fill={isStart ? '#16a34a' : isEnd ? '#dc2626' : node.type === 'facing' ? undefined : nodeColor(node)}
                        stroke={isStart || isEnd ? '#fff' : node.type === 'facing' ? nodeColor(node) : '#fff'}
                        strokeWidth={(isStart || isEnd ? 2 : node.type === 'facing' ? 1.6 : 1.4) / zoom}
                        draggable={!testMode}
                        onClick={() => onNodeClickForTest(node.id)}
                        onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
                          e.cancelBubble = true
                          setNodeDragging(true)
                        }}
                        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                          e.cancelBubble = true
                          onNodeMove(node.id, Math.round(e.target.x() / scale), Math.round(e.target.y() / scale))
                          setNodeDragging(false)
                        }}
                      />
                    )
                  })}
                </Layer>
              </Stage>
            )}
            {!maskDims && (
              <div className="text-muted text-sm flex items-center justify-center" style={{ height: 300 }}>
                아직 생성된 경로노드가 없습니다. 오른쪽의 &lsquo;경로 노드 생성&rsquo;을 눌러주세요.
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-[12px] text-muted">
            <span style={{ color: '#7c3aed' }}>● 코너</span>
            <span style={{ color: '#db2777' }}>● 벽 모서리(건너기 지점)</span>
            <span style={{ color: '#2563eb' }}>● 연결자 입구</span>
            <span style={{ color: '#f2992e' }}>● 목적지 출입구</span>
            <span>○ 맞은편 지점</span>
            <span style={{ color: '#16a34a' }}>┄ 횡단 엣지</span>
          </div>
        </div>

        <Card className="w-[260px] shrink-0">
          <h3>경로노드</h3>
          <p className="text-muted text-[13px] mt-2">
            비콘·목적지 입구를 기준으로 경로노드를 자동 생성합니다. 위치가 어색하면 점을 드래그해서 옮기세요.
          </p>

          <div className="mt-4">
            <span className="block text-[13px] text-muted mb-2">횡단 가능한 최대 거리</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted">최대</span>
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={crossingMaxM}
                onChange={(e) => setCrossingMaxM(e.target.value)}
                className="w-16 h-9 px-2 rounded-lg border border-line bg-field text-sm outline-none text-right"
              />
              <span className="text-[12px] text-muted">m</span>
            </div>
            {!savedScale && (
              <p className="text-[12px] text-muted mt-1">
                축척이 아직 없어 기본값(약 {DEFAULT_CROSSING_MAX_M}m 상당)으로 계산됩니다.
              </p>
            )}
          </div>

          <div className="mt-4">
            <span className="block text-[13px] text-muted mb-2">코너 횡단 좌우 최소 여유</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted">최소</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={minClearanceM}
                onChange={(e) => setMinClearanceM(e.target.value)}
                className="w-16 h-9 px-2 rounded-lg border border-line bg-field text-sm outline-none text-right"
              />
              <span className="text-[12px] text-muted">m</span>
            </div>
            <p className="text-[12px] text-muted mt-1">
              벽 끝(코너) 횡단선의 옆(좌우 또는 상하)으로 이 거리 안에 벽이 있으면, 벽을 타면 바로 닿는
              곳이라 보고 그 방향은 만들지 않습니다. 0으로 두면 끕니다. 벽이 반듯하지 않고 사선으로 나
              있으면 좌우/상하로만 재는 이 검사가 못 잡을 수 있어 값을 좀 더 키우면 도움이 됩니다.
            </p>
          </div>

          <Button className="w-full mt-4" disabled={generating} onClick={onGenerate}>
            {generating ? '생성 중…' : nodes.length ? '경로 노드 다시 생성' : '경로 노드 생성'}
          </Button>
          {genSummary && <p className="text-[11px] text-muted mt-1.5 leading-relaxed">{genSummary}</p>}

          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button
              variant="outline"
              className="whitespace-nowrap"
              style={{ padding: '0 4px', fontSize: 13 }}
              onClick={undo}
              title="실행 취소 (Ctrl+Z)"
            >
              되돌리기
            </Button>
            <Button
              variant="outline"
              className="whitespace-nowrap"
              style={{ padding: '0 4px', fontSize: 13 }}
              onClick={redo}
              title="다시 실행 (Ctrl+Shift+Z)"
            >
              다시실행
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-line">
            <span className="block text-[13px] text-muted mb-2">화면 확대/축소</span>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => zoomBy(1 / 1.3)}>
                −
              </Button>
              <Button variant="outline" onClick={resetView}>
                {Math.round(zoom * 100)}%
              </Button>
              <Button variant="outline" onClick={() => zoomBy(1.3)}>
                +
              </Button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-line">
            <span className="block text-[13px] text-muted mb-2">경로 찾기 (테스트)</span>
            <Button
              variant={testMode ? 'primary' : 'outline'}
              className="w-full"
              disabled={nodes.length === 0}
              onClick={toggleTestMode}
            >
              {testMode ? '테스트 모드 끄기' : '시작·도착 노드 클릭'}
            </Button>
            {testMode && (
              <p className="text-[12px] text-muted mt-2">
                {!testStart
                  ? '시작 노드를 클릭하세요.'
                  : !testEnd
                    ? '도착 노드를 클릭하세요.'
                    : '다시 클릭하면 시작 노드부터 새로 고를 수 있어요.'}
              </p>
            )}

            <div className="mt-3">
              <span className="block text-[13px] text-muted mb-2">건너기 페널티(이만큼 절약될 때만 건넘)</span>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted">+</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={crossPenaltyM}
                  onChange={(e) => setCrossPenaltyM(e.target.value)}
                  className="w-16 h-9 px-2 rounded-lg border border-line bg-field text-sm outline-none text-right"
                />
                <span className="text-[12px] text-muted">m</span>
              </div>
            </div>

            <Button variant="outline" className="w-full mt-3" disabled={!testStart && !testEnd} onClick={clearTest}>
              테스트 지우기
            </Button>

            {testStart && testEnd && (
              <p className="text-[13px] mt-3">
                {testResult
                  ? `거리: ${testDistanceM != null ? `약 ${testDistanceM.toFixed(1)}m` : `${Math.round(testResult.distancePx)}px`}`
                  : '두 노드 사이에 경로가 없습니다.'}
              </p>
            )}
          </div>
        </Card>
      </div>

      <StepFooter
        buildingId={buildingId}
        floorId={floorId}
        current="path-nodes"
        saveAction={{
          label: '저장',
          disabled: nodes.length === 0,
          onClick: () => setConfirmSaveOpen(true),
        }}
      />

      <ConfirmDialog
        open={confirmSaveOpen}
        title="저장하고 완료할까요?"
        description="지금까지 배치한 경로노드로 이 층의 세팅이 마무리됩니다. 이후에도 이 화면에서 다시 수정할 수 있습니다."
        confirmLabel="저장"
        confirmVariant="primary"
        onCancel={() => setConfirmSaveOpen(false)}
        onConfirm={() => {
          setConfirmSaveOpen(false)
          navigate(`/buildings/${buildingId}`)
        }}
      />
    </div>
  )
}
