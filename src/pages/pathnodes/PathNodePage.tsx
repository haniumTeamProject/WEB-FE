import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Circle, Line } from 'react-konva'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask, usePathNodes, useSavePathNodes, useScale } from '@/features/mapEditor/hooks'
import { useLandmarks } from '@/features/landmarks/hooks'
import { generatePathNodes } from '@/features/mapEditor/pathNodes'
import type { EntrancePoint, PathEdge, PathNode } from '@/features/mapEditor/pathNodes'
import { findShortestPath, isCrossEdgeUsable } from '@/features/mapEditor/pathfind'
import { pathNodesStorageKey, readStoredPathNodes } from '@/features/mapEditor/pathNodesStorage'
import type { StoredPathNodes } from '@/features/mapEditor/pathNodesStorage'
import { arrowheadPoints } from '@/lib/canvasArrows'
import { pathNodeColor } from '@/features/mapEditor/pathNodeColors'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const DESIGN_W = 900 // 비콘/랜드마크 좌표 기준 폭 — FloorMapCanvas.DESIGN_W와 동일
// 캔버스 폭을 컨테이너 폭에 그대로 맞추면 아주 넓은 모니터에서는 높이도 같이 커져서(비율은 유지되니
// 찌그러지진 않지만) 전체가 지나치게 거대해진다(실제 발견된 문제, 종합확인 화면과 동일한 원인) —
// 이 이상은 안 키우도록 상한을 둔다.
const MAX_CANVAS_W = 1000

const DEFAULT_CROSSING_MAX_M = 3 // 축척 미설정 시 기본 횡단 가능 거리(대략 60px 상당)
const MIN_CORNER_CLEARANCE_M = 0.3 // 코너 횡단 좌우 최소 여유 — 이보다 벽이 가까우면 벽을 타는 걸로 보고 안 만든다
const DEFAULT_CROSS_PENALTY_M = 5 // 건너기 페널티 기본값 — 이만큼 이상 절약될 때만 건넘

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
// 지도 검수 단계와 분리된 별도 페이지 — 편집 중에는 새로고침에 대비해 층 ID 기준 localStorage에도
// 임시로 남기지만, 실제 저장소는 서버다: '저장' 버튼을 눌러야 GET/PUT /floors/:floorId/path-nodes로
// DB에 반영되고, 다음에 들어올 때는(다른 브라우저·다른 관리자여도) 그 저장된 값을 최우선으로 불러온다.
export default function PathNodePage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: floorplan, isLoading } = useFloorplan(floorId)
  const { data: savedMask } = useMask(floorId)
  const { data: savedScale } = useScale(floorId)
  const { data: landmarks } = useLandmarks(floorId)
  const { data: savedPathNodes } = usePathNodes(floorId)
  const savePathNodesMutation = useSavePathNodes(floorId)
  const [crossingMaxM, setCrossingMaxM] = useState(String(DEFAULT_CROSSING_MAX_M))
  const [minClearanceM, setMinClearanceM] = useState(String(MIN_CORNER_CLEARANCE_M))

  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(700)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(Math.min(MAX_CANVAS_W, Math.round(el.getBoundingClientRect().width)))
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.min(MAX_CANVAS_W, Math.round(w)))
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
  // 자동 생성 결과에 섞여 나오는 불필요한 노드(예: 코너 근처의 잘못된 맞은편 지점)를 직접 지울 수
  // 있게 하는 모드 — 테스트 모드와 동시에 켜두면 클릭 동작이 겹치므로 서로 배타적으로 켠다.
  const [deleteMode, setDeleteMode] = useState(false)
  // 대각선 벽 근처처럼 자동 판정으로는 걸러낼 수 없는 횡단 엣지를, 노드는 그대로 두고 엣지 하나만
  // 관리자가 직접 지울 수 있게 하는 모드 — 다른 모드와 배타적으로 켠다.
  const [edgeDeleteMode, setEdgeDeleteMode] = useState(false)

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
    localStorage.setItem(pathNodesStorageKey(floorId), JSON.stringify(payload))
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
    // 그 수정물을 그대로 불러온다 — 드래그로 고친 위치가 날아가지 않게. 서버에 저장된 값이 최우선(다른
    // 브라우저·다른 관리자가 저장한 것도 포함)이고, 서버에 아직 아무것도 없을 때만 이 브라우저에 남은
    // localStorage 임시 초안(저장 버튼을 안 누르고 나간 경우 등)을 대신 불러온다.
    if (nodes.length === 0 && edges.length === 0) {
      if (savedPathNodes) {
        setNodes(savedPathNodes.nodes)
        setEdges(savedPathNodes.edges)
        setMaskDims({ w: savedPathNodes.maskW, h: savedPathNodes.maskH })
        return
      }
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

  // 노드를 지우면 그 노드에 연결된 엣지(벽선·건너기)도 같이 지운다 — 안 그러면 존재하지 않는
  // 노드를 가리키는 엣지가 남아 그래프가 깨진다. 되돌리기(Ctrl+Z)로 실수해도 복구할 수 있다.
  function deleteNode(id: string) {
    if (!maskDims) return
    pushHistory()
    const nextNodes = nodes.filter((node) => node.id !== id)
    const nextEdges = edges.filter((edge) => edge.a !== id && edge.b !== id)
    setNodes(nextNodes)
    setEdges(nextEdges)
    persist(nextNodes, nextEdges, maskDims)
  }

  // 노드는 그대로 두고, 자동 생성이 걸러내지 못한 횡단 엣지 하나만 지운다(예: 대각선 벽 근처처럼
  // 자동 판정이 못 잡는 경우). type까지 같이 비교해야, 우연히 같은 두 노드 사이에 벽선과 횡단이
  // 둘 다 있는 경우 엉뚱한 쪽이 지워지지 않는다.
  function deleteEdge(target: PathEdge) {
    if (!maskDims) return
    pushHistory()
    const nextEdges = edges.filter(
      (edge) => !(edge.type === target.type && ((edge.a === target.a && edge.b === target.b) || (edge.a === target.b && edge.b === target.a))),
    )
    setEdges(nextEdges)
    persist(nodes, nextEdges, maskDims)
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

  // 진단: 시작 노드에서 도달 가능한 노드 집합(방향 엣지 반영). 도달 못 하는 노드는 흐리게 표시해
  // 그래프가 어디서 끊겼는지 눈으로 드러낸다. "경로 없음"이 뜰 때 원인 위치를 바로 보이게 하는 용도.
  // findShortestPath와 같은 규칙(목적지 건너기는 그 목적지가 실제 출발지일 때만 사용 가능)을 여기서도
  // 똑같이 적용한다 — 안 그러면 실제 경로 탐색은 절대 쓰지 않을 건너기인데, 진단에서는 도달 가능한
  // 것처럼(흐려지지 않고) 표시되는 불일치가 생긴다(실제 발견된 문제).
  const reachableFromStart = useMemo(() => {
    if (!testMode || !testStart) return null
    const adj = new Map<string, string[]>()
    for (const n of nodes) adj.set(n.id, [])
    for (const e of edges) {
      const a = byId.get(e.a)
      if (e.type === 'cross' && a && !isCrossEdgeUsable(a, testStart)) continue
      adj.get(e.a)?.push(e.b)
      if (!e.directed) adj.get(e.b)?.push(e.a)
    }
    const seen = new Set<string>([testStart])
    const stack = [testStart]
    while (stack.length) {
      const cur = stack.pop()!
      for (const nx of adj.get(cur) ?? []) if (!seen.has(nx)) { seen.add(nx); stack.push(nx) }
    }
    return seen
  }, [testMode, testStart, nodes, edges])

  // 진단: 그래프가 물리적으로 몇 조각인지(무방향 기준). 1이 아니면 층이 끊긴 것 — 조각이 다른
  // 두 노드 사이엔 경로가 없다. 통행 영역(마스크)이 갈라졌거나 잇는 건너기 엣지가 빠진 결과다.
  const componentCount = useMemo(() => {
    if (nodes.length === 0) return 0
    const adj = new Map<string, string[]>()
    for (const n of nodes) adj.set(n.id, [])
    for (const e of edges) {
      adj.get(e.a)?.push(e.b)
      adj.get(e.b)?.push(e.a)
    }
    const seen = new Set<string>()
    let count = 0
    for (const n of nodes) {
      if (seen.has(n.id)) continue
      count++
      const stack = [n.id]
      seen.add(n.id)
      while (stack.length) {
        const cur = stack.pop()!
        for (const nx of adj.get(cur) ?? []) if (!seen.has(nx)) { seen.add(nx); stack.push(nx) }
      }
    }
    return count
  }, [nodes, edges])

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
    setDeleteMode(false)
    setEdgeDeleteMode(false)
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

  function toggleDeleteMode() {
    setTestMode(false)
    setTestStart(null)
    setTestEnd(null)
    setEdgeDeleteMode(false)
    setDeleteMode((v) => !v)
  }

  function toggleEdgeDeleteMode() {
    setTestMode(false)
    setTestStart(null)
    setTestEnd(null)
    setDeleteMode(false)
    setEdgeDeleteMode((v) => !v)
  }

  function onNodeClick(nodeId: string) {
    if (edgeDeleteMode) return
    if (deleteMode) {
      deleteNode(nodeId)
      return
    }
    onNodeClickForTest(nodeId)
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
              // 캔버스 폭에 상한(MAX_CANVAS_W)을 두면서 컨테이너는 그보다 넓을 수 있게 됐다 — 가운데
              // 정렬 없이 두면 오른쪽에 빈 공간만 남고 캔버스가 왼쪽에 붙어 보인다(실제 발견된 문제).
              // Stage에 style prop을 직접 줘도 Konva가 wrapper div의 style을 자체적으로 다시 써버려서
              // 안 먹는다 — 대신 순수 div로 감싸서 그 div를 가운데 정렬한다.
              <div style={{ width, margin: '0 auto' }}>
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
                <Layer listening={edgeDeleteMode}>
                  {edges.map((edge) => {
                    const a = byId.get(edge.a)
                    const b = byId.get(edge.b)
                    if (!a || !b) return null
                    const ax = a.x * scale
                    const ay = a.y * scale
                    const bx = b.x * scale
                    const by = b.y * scale
                    const isCross = edge.type === 'cross'
                    const isEdgeClickable = isCross && edgeDeleteMode
                    const onEdgeClick = isEdgeClickable
                      ? (e: Konva.KonvaEventObject<MouseEvent>) => {
                          e.cancelBubble = true
                          deleteEdge(edge)
                        }
                      : undefined
                    const onEdgeEnter = (e: Konva.KonvaEventObject<MouseEvent>) => {
                      if (isEdgeClickable) e.target.getStage()!.container().style.cursor = 'pointer'
                    }
                    const onEdgeLeave = (e: Konva.KonvaEventObject<MouseEvent>) => {
                      if (isEdgeClickable) e.target.getStage()!.container().style.cursor = 'default'
                    }
                    return (
                      <Fragment key={`${edge.type}-${edge.a}-${edge.b}`}>
                        <Line
                          points={[ax, ay, bx, by]}
                          stroke={isCross ? '#16a34a' : '#7c3aed'}
                          strokeWidth={(isCross ? 1.6 : 1) / zoom}
                          dash={isCross ? [4 / zoom, 3 / zoom] : undefined}
                          listening={edgeDeleteMode ? isCross : false}
                          hitStrokeWidth={isEdgeClickable ? 16 / zoom : undefined}
                          onClick={onEdgeClick}
                          onMouseEnter={onEdgeEnter}
                          onMouseLeave={onEdgeLeave}
                        />
                        {isCross && (
                          // 화살촉 하나만, 크고 흰 테두리를 둘러서 배경(도면 선·다른 점)과 겹쳐도
                          // 방향이 확실히 보이게 한다 — 중간 화살표는 촘촘한 교차로에서 여러 개가
                          // 겹쳐 오히려 지저분해 보여서 뺐다.
                          // 화살촉 크기를 고정값(11px)으로 두면, 복도가 좁아 건너기 거리가 화면상
                          // 그보다 짧을 때 화살촉 뒤쪽 밑변이 시작점(흔히 그 자신도 벽에 붙어있는
                          // 입구/코너)을 지나쳐 벽과 겹쳐 보인다 — 건너기 길이에 비례해 상한을 둔다.
                          // 엣지 삭제 모드에서는 화살촉도 클릭 대상이다 — 얇은 점선보다 훨씬 넓어서
                          // 클릭하기 쉽다.
                          <Line
                            points={arrowheadPoints(ax, ay, bx, by, Math.min(11 / zoom, Math.hypot(bx - ax, by - ay) * 0.4))}
                            closed
                            fill="#16a34a"
                            stroke="#ffffff"
                            strokeWidth={1.1 / zoom}
                            listening={edgeDeleteMode}
                            onClick={onEdgeClick}
                            onMouseEnter={onEdgeEnter}
                            onMouseLeave={onEdgeLeave}
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
                        opacity={reachableFromStart && !reachableFromStart.has(node.id) ? 0.18 : 1}
                        x={node.x * scale}
                        y={node.y * scale}
                        radius={(isStart || isEnd ? 9 : node.type === 'facing' ? 9 : 7) / zoom}
                        fill={isStart ? '#16a34a' : isEnd ? '#dc2626' : node.type === 'facing' ? undefined : pathNodeColor(node)}
                        stroke={isStart || isEnd ? '#fff' : node.type === 'facing' ? pathNodeColor(node) : '#fff'}
                        strokeWidth={(isStart || isEnd ? 2 : node.type === 'facing' ? 2 : 1.4) / zoom}
                        draggable={!testMode && !deleteMode && !edgeDeleteMode}
                        onClick={() => onNodeClick(node.id)}
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
              </div>
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
            <span style={{ color: '#f2992e' }}>● 목적지 출입구</span>
            <span>○ 맞은편 지점</span>
            <span style={{ color: '#16a34a' }}>┄ 횡단 엣지</span>
          </div>
        </div>

        <Card className="w-[260px] shrink-0">
          <h3>경로노드</h3>
          <div className="flex items-center gap-1.5 mt-2 text-[13px] text-muted">
            <span>사용법</span>
            <InfoTooltip text="비콘·목적지 입구를 기준으로 경로노드를 자동 생성합니다. 위치가 어색하면 점을 드래그해서 옮기세요." />
          </div>

          <div className="mt-4">
            <span className="flex items-center gap-1.5 text-[13px] text-muted mb-2">
              횡단 가능한 최대 거리
              <InfoTooltip text="복도 건너편까지의 거리가 이 값보다 멀면 횡단 엣지를 만들지 않아요. 값을 키우면 넓은 홀이나 로비도 건너뛸 수 있게 되고, 줄이면 폭이 좁은 곳에서만 횡단 엣지가 생겨요." />
            </span>
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
            <span className="flex items-center gap-1.5 text-[13px] text-muted mb-2">
              벽 근접 판정 거리
              <InfoTooltip text="코너의 횡단 엣지 옆에 벽이 이미 가까이 있으면, 굳이 안 건너도 벽을 타고 갈 수 있으니 그 방향으로는 횡단 엣지를 만들지 않아요. 값을 높이면 더 멀리 있는 벽까지 '가깝다'고 보기 때문에 횡단 엣지가 더 적게 생기고, 0으로 두면 이 기능이 꺼져서 벽 바로 옆에서도 다 생겨요. 벽이 비스듬히 나 있는 경우엔 잘 못 걸러낼 수 있으니, 그럴 땐 거리를 좀 더 늘려보세요." />
            </span>
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
          </div>

          <Button className="w-full mt-4" disabled={generating} onClick={onGenerate}>
            {generating ? '생성 중…' : nodes.length ? '경로 노드 다시 생성' : '경로 노드 생성'}
          </Button>
          {genSummary && <p className="text-[11px] text-muted mt-1.5 leading-relaxed">{genSummary}</p>}
          {componentCount > 1 && (
            <p className="text-[12px] mt-2 leading-relaxed" style={{ color: '#DC4C4C' }}>
              ⚠ 그래프가 {componentCount}조각으로 끊겨 있습니다 — 조각이 다른 두 지점 사이엔 경로가 없습니다.
              노드를 지우다 이렇게 됐다면 되돌리기(←)로 복구하세요.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button
              variant="outline"
              className="whitespace-nowrap"
              style={{ padding: '0 4px', fontSize: 13 }}
              onClick={undo}
              title="실행 취소 (Ctrl+Z)"
            >
              ← 되돌리기
            </Button>
            <Button
              variant="outline"
              className="whitespace-nowrap"
              style={{ padding: '0 4px', fontSize: 13 }}
              onClick={redo}
              title="다시 실행 (Ctrl+Shift+Z)"
            >
              다시실행 →
            </Button>
          </div>

          <Button
            variant={deleteMode ? 'danger' : 'outline'}
            className="w-full mt-2"
            disabled={nodes.length === 0}
            onClick={toggleDeleteMode}
          >
            {deleteMode ? '노드 삭제 모드 끄기' : '노드 삭제 모드'}
          </Button>
          {deleteMode && (
            <p className="text-[12px] text-muted mt-1.5">
              지울 노드를 클릭하세요. 실수하면 되돌리기(Ctrl+Z)로 복구할 수 있어요.
            </p>
          )}

          <Button
            variant={edgeDeleteMode ? 'danger' : 'outline'}
            className="w-full mt-2"
            disabled={edges.filter((e) => e.type === 'cross').length === 0}
            onClick={toggleEdgeDeleteMode}
          >
            {edgeDeleteMode ? '건너기 엣지 삭제 모드 끄기' : '건너기 엣지 삭제 모드'}
          </Button>
          {edgeDeleteMode && (
            <p className="text-[12px] text-muted mt-1.5">
              대각선 벽 근처처럼 자동으로 안 걸러지는 건너기 화살표를 직접 클릭해서 지우세요. 노드는
              그대로 남습니다. 실수하면 되돌리기(Ctrl+Z)로 복구할 수 있어요.
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-line">
            <span className="block text-[13px] text-muted mb-2">화면 확대/축소</span>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => zoomBy(1 / 1.3)}>
                −
              </Button>
              <Button
                variant="outline"
                className="whitespace-nowrap"
                style={{ padding: '0 4px' }}
                onClick={resetView}
              >
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
            {testMode && testStart && reachableFromStart && (
              <p className="text-[12px] text-muted mt-1">
                시작점에서 도달 가능 {reachableFromStart.size} / 전체 {nodes.length}개
                {reachableFromStart.size < nodes.length && ' (도달 불가 노드는 흐리게 표시)'}
              </p>
            )}

            <div className="mt-3">
              <span className="flex items-center gap-1.5 text-[13px] text-muted mb-2">
                건너기 페널티
                <InfoTooltip text="직진 경로가 이 거리만큼 절약될 때만 횡단(건너기)을 선택합니다. 값을 키우면 웬만큼 이득이 커야만 건너고, 낮추면 조금만 가까워도 건넙니다." />
              </span>
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
        pending={savePathNodesMutation.isPending}
        onCancel={() => setConfirmSaveOpen(false)}
        onConfirm={() => {
          if (!maskDims) return
          savePathNodesMutation.mutate(
            { nodes, edges, maskW: maskDims.w, maskH: maskDims.h },
            {
              onSuccess: () => {
                setConfirmSaveOpen(false)
              },
            },
          )
        }}
      />
    </div>
  )
}
