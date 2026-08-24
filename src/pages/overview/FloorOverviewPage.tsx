import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Circle, Line, RegularPolygon } from 'react-konva'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask, usePathNodes } from '@/features/mapEditor/hooks'
import { snapEntrancesToWalls } from '@/features/mapEditor/pathNodes'
import { useBeacons } from '@/features/beacons/hooks'
import { useLandmarks } from '@/features/landmarks/hooks'
import { arrowheadPoints } from '@/lib/canvasArrows'
import { rasterizeMask } from '@/lib/maskRaster'
import type { RasterizedMask } from '@/lib/maskRaster'
import { MAP_DESIGN_W as DESIGN_W } from '@/lib/constants'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'

const MIN_ZOOM = 1
const MAX_ZOOM = 6
// 캔버스 폭을 컨테이너 폭에 그대로 맞추면, 화면이 아주 넓은 모니터에서는 높이도 같은 비율로 커져서
// (원본 비율은 항상 지켜지므로 찌그러지진 않지만) 그림 전체가 지나치게 거대해져 스크롤을 많이 해야
// 한다(팀원 실제 발견). 이 이상은 안 키우도록 상한을 둔다.
const MAX_CANVAS_W = 1000
// 각자의 편집 화면(비콘 등록·목적지 관리·경로노드)은 세부 종류(의미/보강 비콘, 코너/벽
// 끝/맞은편 등)를 색으로 구분해서 보여주지만, 여기 종합확인은 "다 같이 겹쳐 놓고 큰 그림만 훑어보는"
// 용도라 그 세부 구분이 오히려 산만하다(실제 요청) — 비콘·목적지·경로노드, 큰 카테고리 3가지
// 색으로만 묶는다.
const OVERVIEW_BEACON_COLOR = '#29AD72' // 의미비콘 + 보강비콘 공통
const OVERVIEW_ENTRANCE_COLOR = '#f2992e' // 목적지 입구
const OVERVIEW_PATH_NODE_COLOR = '#7c3aed' // 경로노드: 벽선·건너기·코너·벽 끝·맞은편 공통

// InfoTooltip처럼 "?" 아이콘을 따로 두지 않고, 라벨·토글 전체(부모에 group 클래스가 있어야 함)에
// 마우스를 올리면 뜨는 설명 말풍선 — 비활성화된 토글 바로 옆이 아니라 "그 토글 영역 자체"에 마우스를
// 올렸을 때 뜨길 원한다는 요청(disabled 버튼도 CSS :hover 자체는 정상 반응한다, 막히는 건 클릭뿐).
function ToggleHint({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 bottom-[calc(100%+6px)] z-20 w-56 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-2 text-[12px] leading-snug text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100"
    >
      {text}
    </span>
  )
}

// 준성님 요청: 비콘·랜드마크·경로노드·설계도를 한 화면에서 같이 확인할 수 있는 층별 마지막 종합 확인
// 화면. 편집은 안 하고 보기 전용이라, 각 데이터를 켜고 끌 수 있는 토글만 둔다.
export default function FloorOverviewPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: floorplan } = useFloorplan(floorId)
  const { data: mask } = useMask(floorId)
  const { data: beacons } = useBeacons(floorId)
  const { data: landmarks } = useLandmarks(floorId)

  // 경로노드 화면과 항상 같은 값을 보도록(다른 브라우저·다른 관리자가 저장한 것도 포함), localStorage가
  // 아니라 서버에 저장된 값을 그대로 쓴다.
  const { data: stored } = usePathNodes(floorId)

  const [showMask, setShowMask] = useState(true)
  const [showBeacons, setShowBeacons] = useState(true)
  const [showEntrances, setShowEntrances] = useState(true)
  const [showPathNodes, setShowPathNodes] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [width, setWidth] = useState(700)
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [loadedMaskImg, setLoadedMaskImg] = useState<HTMLImageElement | null>(null)
  const [displayImg, setDisplayImg] = useState<HTMLImageElement | null>(null)
  const [rasterized, setRasterized] = useState<RasterizedMask | null>(null)

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

  useEffect(() => {
    const url = floorplan?.imageUrl
    if (!url) return
    const image = new window.Image()
    image.onload = () => setDisplayImg(image)
    image.src = url
  }, [floorplan?.imageUrl])

  // 통행영역(마스크)을 비콘 배치 화면과 같은 반투명 파랑으로 겹쳐 보여준다.
  useEffect(() => {
    const url = mask?.dataUrl
    if (!url) {
      setLoadedMaskImg(null)
      return
    }
    const image = new window.Image()
    image.onload = () => setLoadedMaskImg(image)
    image.src = url
  }, [mask?.dataUrl])

  // 목적지·연결자 마커를 벽에 붙은 위치로 보여주려면 통행영역을 픽셀 단위로 알아야 한다(아래
  // snapEntrancesToWalls 호출용) — 화면 표시용 반투명 이미지(loadedMaskImg)와는 별개로 래스터화한다.
  useEffect(() => {
    let cancelled = false
    if (!mask) {
      setRasterized(null)
      return
    }
    rasterizeMask(mask).then((r) => {
      if (!cancelled) setRasterized(r)
    })
    return () => {
      cancelled = true
    }
  }, [mask])

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

  const H = displayImg ? Math.round((displayImg.height / displayImg.width) * width) : 0
  // 노드 반지름·선 굵기는 X/zoom(줌으로 확대/축소해도 화면 크기 고정)뿐 아니라 X*scale/zoom로 이
  // scale도 곱해야 한다 — 벽선·설계도 이미지는 컨테이너 폭이 넓어지면 같이 커지는데, scale 없이
  // zoom만 반영하면 마커는 화면 픽셀 기준으로 고정돼서 창을 키울수록 지도만 커지고 마커는 그대로라
  // 상대적으로 점점 작아 보인다(실제 발견된 문제).
  const scale = width / DESIGN_W
  // 경로노드는 설계도(900) 좌표가 아니라 저장 당시 마스크 픽셀 좌표라, 같은 화면에 겹치려면 그 비율만큼
  // 설계도 좌표계로 환산해야 한다(PathNodePage가 반대 방향으로 하는 변환의 역).
  const pathNodeToDesign = stored ? DESIGN_W / stored.maskW : 1
  // 목적지를 설계도(900) 좌표에서 마스크 픽셀 좌표로 바꾸는 비율 — PathNodePage의
  // onGenerate가 쓰는 maskScale과 같다.
  const maskScale = rasterized ? rasterized.w / DESIGN_W : 1

  // 등록된 게 하나도 없으면 토글을 켜고 꺼도 화면에 아무 변화가 없어서, 관리자 입장에선 눌리는지 안
  // 눌리는지도 헷갈린다(실제 요청: "비콘이랑 목적지 둘 다 안 했는데 버튼이 눌리네") — 통행
  // 영역·경로노드처럼 데이터가 아예 없을 땐 꺼서, 먼저 등록부터 해야 한다는 걸 명확히 한다.
  const hasBeacons = (beacons ?? []).some((b) => b.x != null && b.y != null)
  const hasEntrances = (landmarks ?? []).some((l) => l.x != null && l.y != null)

  // 목적지는 관리자가 찍은 원래 좌표가 아니라, 경로노드처럼 정리된(벽에 붙은) 모습으로 보여
  // 달라는 요청 — 저장된 경로노드 그래프에 기대는 대신(관리자가 아직 '저장'을 안 눌렀으면 그 그래프
  // 자체가 없어서 하나도 안 붙어보이는 문제가 있었다), 지금 마스크를 그대로 써서 그때그때 다시
  // 계산한다. generatePathNodes의 실제 경로 그래프는 벽에서 WALL_SPLICE_MAX_PX보다 멀면 스냅하지
  // 않지만(관리자가 정밀하게 찍었다고 기대할 수 없는 목적지가 방 안쪽 깊숙이 있을 때, 억지로 먼 벽에
  // 붙이면 오히려 위치가 왜곡되는 걸 막기 위함), 여기 종합확인은 순전히 보여주기용이라 그 거리 제한
  // 없이 무조건 가장 가까운 벽으로 붙인다 — 그래야 실제로 벽에서 떨어져 있던 목적지도 항상 "벽에
  // 붙은" 정리된 모습으로 보인다(실제 요청: "벽에 안 붙었잖아").
  const snappedLandmarkPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    const entries = (landmarks ?? [])
      .filter((l) => l.x != null && l.y != null)
      .map((l) => ({ id: l.id, x: l.x as number, y: l.y as number }))
    if (!rasterized || entries.length === 0) {
      entries.forEach((e) => map.set(e.id, { x: e.x, y: e.y }))
      return map
    }
    const points = entries.map((e) => ({ x: e.x * maskScale, y: e.y * maskScale }))
    const snapped = snapEntrancesToWalls(rasterized.walkable, rasterized.w, rasterized.h, points, Infinity)
    entries.forEach((e, i) => map.set(e.id, { x: snapped[i].x / maskScale, y: snapped[i].y / maskScale }))
    return map
  }, [landmarks, rasterized, maskScale])

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: floor ? `${floor.floor}층` : '층', to: `/buildings/${buildingId}/floors` },
    { label: '종합 확인' },
  ]

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>종합 확인</h1>
      <p className="text-muted text-[13px] mt-2">수정사항들을 한 화면에서 확인합니다. 여기서는 수정할 수 없어요.</p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4">
        <label className="group relative flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: '#378ADD' }}>
            ● 통행 영역
          </span>
          <Toggle checked={showMask} onChange={setShowMask} disabled={!mask} />
          {/* 비활성화된 토글을 그냥 눌러보면 왜 안 켜지는지 알 방법이 없다 — 라벨·토글 어디에 마우스를
              올려도(disabled 버튼도 :hover는 정상 반응한다) 먼저 해야 할 단계를 알려준다(실제 요청). */}
          {!mask && <ToggleHint text="지도 검수에서 통행 영역을 먼저 저장해야 켤 수 있어요." />}
        </label>
        <label className="group relative flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: OVERVIEW_BEACON_COLOR }}>
            ◆ 비콘
          </span>
          <Toggle checked={showBeacons} onChange={setShowBeacons} disabled={!hasBeacons} />
          {!hasBeacons && <ToggleHint text="비콘을 먼저 등록해야 켤 수 있어요." />}
        </label>
        <label className="group relative flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: OVERVIEW_ENTRANCE_COLOR }}>
            ● 목적지
          </span>
          <Toggle checked={showEntrances} onChange={setShowEntrances} disabled={!hasEntrances} />
          {!hasEntrances && <ToggleHint text="목적지를 먼저 등록해야 켤 수 있어요." />}
        </label>
        <label className="group relative flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: OVERVIEW_PATH_NODE_COLOR }}>
            ● 경로노드
          </span>
          <Toggle checked={showPathNodes} onChange={setShowPathNodes} disabled={!stored} />
          {!stored && <ToggleHint text="경로노드 페이지에서 경로 노드를 먼저 저장해야 켤 수 있어요." />}
        </label>
      </div>

      <div ref={containerRef} className="mt-3 rounded-xl border border-line overflow-hidden bg-field" style={{ height: H || 400 }}>
        {!floorplan && <p className="text-muted text-sm p-4">설계도가 아직 없습니다.</p>}
        {floorplan && (
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
              draggable
              onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
              onWheel={onWheel}
            >
            <Layer listening={false}>{displayImg && <KonvaImage image={displayImg} width={width} height={H} />}</Layer>
            <Layer listening={false}>
              {showMask && loadedMaskImg && <KonvaImage image={loadedMaskImg} width={width} height={H} opacity={0.45} />}
            </Layer>

            {showPathNodes && stored && (
              <Layer listening={false}>
                {stored.edges.map((edge) => {
                  const a = stored.nodes.find((n) => n.id === edge.a)
                  const b = stored.nodes.find((n) => n.id === edge.b)
                  if (!a || !b) return null
                  const ax = a.x * pathNodeToDesign * scale
                  const ay = a.y * pathNodeToDesign * scale
                  const bx = b.x * pathNodeToDesign * scale
                  const by = b.y * pathNodeToDesign * scale
                  const isCross = edge.type === 'cross'
                  return (
                    <Fragment key={`${edge.type}-${edge.a}-${edge.b}`}>
                      <Line
                        points={[ax, ay, bx, by]}
                        stroke={OVERVIEW_PATH_NODE_COLOR}
                        strokeWidth={((isCross ? 1.6 : 1) * scale) / zoom}
                        dash={isCross ? [(4 * scale) / zoom, (3 * scale) / zoom] : undefined}
                      />
                      {isCross && (
                        <Line
                          points={arrowheadPoints(ax, ay, bx, by, Math.min((11 * scale) / zoom, Math.hypot(bx - ax, by - ay) * 0.4))}
                          closed
                          fill={OVERVIEW_PATH_NODE_COLOR}
                          stroke="#ffffff"
                          strokeWidth={(1.1 * scale) / zoom}
                        />
                      )}
                    </Fragment>
                  )
                })}
                {stored.nodes
                  // 경로노드의 landmark 종류는 실제 등록된 목적지와 같은 자리를
                  // 가리키는 점이라, 그 점을 따로 또 그리면 목적지 마커 위에 겹쳐서 어느 게
                  // 뭔지 구분이 안 된다(실제 발견된 문제) — 그 점들은 목적지 토글로 이미
                  // 보이므로 여기서는 코너·맞은편만 그린다. 선(벽선·건너기)은 좌표를 그대로 쓰므로
                  // 영향 없다.
                  .filter((node) => node.type !== 'landmark')
                  .map((node) => (
                    <Circle
                      key={node.id}
                      x={node.x * pathNodeToDesign * scale}
                      y={node.y * pathNodeToDesign * scale}
                      radius={(5 * scale) / zoom}
                      fill={node.type === 'facing' ? undefined : OVERVIEW_PATH_NODE_COLOR}
                      stroke={node.type === 'facing' ? OVERVIEW_PATH_NODE_COLOR : '#fff'}
                      strokeWidth={(1.2 * scale) / zoom}
                    />
                  ))}
              </Layer>
            )}

            <Layer listening={false}>
              {showEntrances &&
                (landmarks ?? [])
                  .filter((l) => l.x != null && l.y != null)
                  .map((l) => {
                    const snapped = snappedLandmarkPositions.get(l.id) ?? { x: l.x as number, y: l.y as number }
                    return (
                      <Circle
                        key={l.id}
                        x={snapped.x * scale}
                        y={snapped.y * scale}
                        radius={(6 * scale) / zoom}
                        fill={OVERVIEW_ENTRANCE_COLOR}
                        stroke="#fff"
                        strokeWidth={(1.4 * scale) / zoom}
                      />
                    )
                  })}
              {showBeacons &&
                (beacons ?? [])
                  .filter((b) => b.x != null && b.y != null)
                  .map((b) => (
                    // 다른 노드(코너·목적지)와 전부 원 모양이라 겹치면 구분이 안 돼서, 비콘만
                    // 마름모로 다르게 그린다. Konva RegularPolygon은 sides=4일 때 이미 꼭짓점이
                    // 위쪽을 향해(마름모 모양으로) 그려지므로, 여기에 45도를 더 돌리면 오히려
                    // 각진 정사각형이 되어버린다(실제 발견된 문제) — 회전 없이 그대로 둬야 마름모다.
                    <RegularPolygon
                      key={b.id}
                      x={(b.x as number) * scale}
                      y={(b.y as number) * scale}
                      sides={4}
                      radius={(6.5 * scale) / zoom}
                      fill={OVERVIEW_BEACON_COLOR}
                      stroke="#fff"
                      strokeWidth={(1.2 * scale) / zoom}
                    />
                  ))}
            </Layer>
            </Stage>
          </div>
        )}
      </div>

      {showPathNodes && !stored && (
        <p className="text-[12px] text-muted mt-1.5">이 층은 아직 저장된 경로노드가 없습니다.</p>
      )}

      <div className="flex flex-wrap gap-4 mt-3 text-[12px] text-muted">
        <span style={{ color: OVERVIEW_BEACON_COLOR }}>◆ 비콘</span>
        <span style={{ color: OVERVIEW_ENTRANCE_COLOR }}>● 목적지 입구</span>
        <span style={{ color: OVERVIEW_PATH_NODE_COLOR }}>● 경로노드</span>
      </div>

      <StepFooter
        buildingId={buildingId}
        floorId={floorId}
        current="overview"
        extra={
          <Link to={`/buildings/${buildingId}`}>
            <Button variant="outline">건물 상세로 돌아가기</Button>
          </Link>
        }
      />
    </div>
  )
}
