import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Circle, Line, RegularPolygon } from 'react-konva'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask, usePathNodes } from '@/features/mapEditor/hooks'
import { useBeacons } from '@/features/beacons/hooks'
import { useLandmarks } from '@/features/landmarks/hooks'
import { useConnectors } from '@/features/connectors/hooks'
import { pathNodeColor } from '@/features/mapEditor/pathNodeColors'
import { arrowheadPoints } from '@/lib/canvasArrows'
import { BEACON_TYPE_COLOR, BEACON_TYPE_LABEL, CONNECTOR_COLOR, MAP_DESIGN_W as DESIGN_W } from '@/lib/constants'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'

const MIN_ZOOM = 1
const MAX_ZOOM = 6
// 목적지 관리 화면(LandmarkPage)의 LANDMARK_COLOR(파랑)은 의미비콘과 같은 색이라 이 화면에서는 서로
// 겹쳐 구분이 안 된다 — 경로노드 페이지에서 "목적지 출입구"에 쓰는 주황색으로 이 화면에서만 맞춘다.
const OVERVIEW_LANDMARK_COLOR = '#f2992e'

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
  const { data: connectors } = useConnectors(buildingId)

  // 경로노드 화면과 항상 같은 값을 보도록(다른 브라우저·다른 관리자가 저장한 것도 포함), localStorage가
  // 아니라 서버에 저장된 값을 그대로 쓴다.
  const { data: stored } = usePathNodes(floorId)

  const [showMask, setShowMask] = useState(true)
  const [showBeacons, setShowBeacons] = useState(true)
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showConnectors, setShowConnectors] = useState(true)
  const [showPathNodes, setShowPathNodes] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [width, setWidth] = useState(700)
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [loadedMaskImg, setLoadedMaskImg] = useState<HTMLImageElement | null>(null)
  const [displayImg, setDisplayImg] = useState<HTMLImageElement | null>(null)

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

  const relevantConnectors = (connectors ?? []).filter((c) => floor && c.floors.includes(floor.floor))

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
      <p className="text-muted text-[13px] mt-2">비콘·목적지·연결자·경로노드를 한 화면에 겹쳐서 확인합니다. 여기서는 수정할 수 없어요.</p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4">
        <label className="flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: '#378ADD' }}>
            ● 통행 영역
          </span>
          <Toggle checked={showMask} onChange={setShowMask} disabled={!mask} />
        </label>
        <label className="flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: BEACON_TYPE_COLOR.semantic }}>
            ◆ 비콘
          </span>
          <Toggle checked={showBeacons} onChange={setShowBeacons} />
        </label>
        <label className="flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: OVERVIEW_LANDMARK_COLOR }}>
            ● 목적지
          </span>
          <Toggle checked={showLandmarks} onChange={setShowLandmarks} />
        </label>
        <label className="flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: CONNECTOR_COLOR }}>
            ● 연결자
          </span>
          <Toggle checked={showConnectors} onChange={setShowConnectors} />
        </label>
        <label className="flex items-center gap-2.5">
          <span className="text-[13px]" style={{ color: '#7c3aed' }}>
            ● 경로노드
          </span>
          <Toggle checked={showPathNodes} onChange={setShowPathNodes} disabled={!stored} />
        </label>
      </div>

      <div ref={containerRef} className="mt-3 rounded-xl border border-line overflow-hidden bg-field" style={{ height: H || 400 }}>
        {!floorplan && <p className="text-muted text-sm p-4">설계도가 아직 없습니다.</p>}
        {floorplan && (
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
                        stroke={isCross ? '#16a34a' : '#7c3aed'}
                        strokeWidth={((isCross ? 1.6 : 1) * scale) / zoom}
                        dash={isCross ? [(4 * scale) / zoom, (3 * scale) / zoom] : undefined}
                      />
                      {isCross && (
                        <Line
                          points={arrowheadPoints(ax, ay, bx, by, Math.min((11 * scale) / zoom, Math.hypot(bx - ax, by - ay) * 0.4))}
                          closed
                          fill="#16a34a"
                          stroke="#ffffff"
                          strokeWidth={(1.1 * scale) / zoom}
                        />
                      )}
                    </Fragment>
                  )
                })}
                {stored.nodes
                  // 경로노드의 connector/landmark 종류는 실제 등록된 연결자·목적지와 같은 자리를
                  // 가리키는 점이라, 그 점을 따로 또 그리면 연결자/목적지 마커 위에 겹쳐서 어느 게
                  // 뭔지 구분이 안 된다(실제 발견된 문제) — 그 점들은 연결자/목적지 토글로 이미
                  // 보이므로 여기서는 코너·맞은편만 그린다. 선(벽선·건너기)은 좌표를 그대로 쓰므로
                  // 영향 없다.
                  .filter((node) => node.type !== 'connector' && node.type !== 'landmark')
                  .map((node) => (
                    <Circle
                      key={node.id}
                      x={node.x * pathNodeToDesign * scale}
                      y={node.y * pathNodeToDesign * scale}
                      radius={(5 * scale) / zoom}
                      fill={node.type === 'facing' ? undefined : pathNodeColor(node)}
                      stroke={node.type === 'facing' ? pathNodeColor(node) : '#fff'}
                      strokeWidth={(1.2 * scale) / zoom}
                    />
                  ))}
              </Layer>
            )}

            <Layer listening={false}>
              {showConnectors &&
                relevantConnectors.map((c) => {
                  const pos = c.positions?.find((p) => p.floorId === floorId)
                  if (!pos) return null
                  return (
                    <Circle
                      key={c.id}
                      x={pos.x * scale}
                      y={pos.y * scale}
                      radius={(6 * scale) / zoom}
                      fill={CONNECTOR_COLOR}
                      stroke="#fff"
                      strokeWidth={(1.4 * scale) / zoom}
                    />
                  )
                })}
              {showLandmarks &&
                (landmarks ?? [])
                  .filter((l) => l.x != null && l.y != null)
                  .map((l) => (
                    <Circle
                      key={l.id}
                      x={(l.x as number) * scale}
                      y={(l.y as number) * scale}
                      radius={(6 * scale) / zoom}
                      fill={OVERVIEW_LANDMARK_COLOR}
                      stroke="#fff"
                      strokeWidth={(1.4 * scale) / zoom}
                    />
                  ))}
              {showBeacons &&
                (beacons ?? [])
                  .filter((b) => b.x != null && b.y != null)
                  .map((b) => (
                    // 다른 노드(코너·목적지·연결자)와 전부 원 모양이라 겹치면 구분이 안 돼서, 비콘만
                    // 마름모로 다르게 그린다. Konva RegularPolygon은 sides=4일 때 이미 꼭짓점이
                    // 위쪽을 향해(마름모 모양으로) 그려지므로, 여기에 45도를 더 돌리면 오히려
                    // 각진 정사각형이 되어버린다(실제 발견된 문제) — 회전 없이 그대로 둬야 마름모다.
                    <RegularPolygon
                      key={b.id}
                      x={(b.x as number) * scale}
                      y={(b.y as number) * scale}
                      sides={4}
                      radius={(6.5 * scale) / zoom}
                      fill={BEACON_TYPE_COLOR[b.type]}
                      stroke="#fff"
                      strokeWidth={(1.2 * scale) / zoom}
                    />
                  ))}
            </Layer>
          </Stage>
        )}
      </div>

      {showPathNodes && !stored && (
        <p className="text-[12px] text-muted mt-1.5">이 층은 아직 저장된 경로노드가 없습니다.</p>
      )}

      <div className="flex flex-wrap gap-4 mt-3 text-[12px] text-muted">
        <span style={{ color: BEACON_TYPE_COLOR.semantic }}>◆ {BEACON_TYPE_LABEL.semantic}</span>
        <span style={{ color: BEACON_TYPE_COLOR.reinforcement }}>◆ {BEACON_TYPE_LABEL.reinforcement}</span>
        <span style={{ color: OVERVIEW_LANDMARK_COLOR }}>● 목적지</span>
        <span style={{ color: CONNECTOR_COLOR }}>● 연결자 입구</span>
        <span style={{ color: '#7c3aed' }}>─ 경로노드 벽선</span>
        <span style={{ color: '#16a34a' }}>┄ 경로노드 건너기</span>
        <span style={{ color: '#7c3aed' }}>● 경로노드 코너</span>
        <span style={{ color: '#db2777' }}>● 경로노드 벽 끝(건너기 지점)</span>
        <span style={{ color: '#8C99B3' }}>○ 경로노드 맞은편 지점</span>
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
