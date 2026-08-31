import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Circle, Group, Line, Text } from 'react-konva'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask } from '@/features/mapEditor/hooks'
import { MAP_DESIGN_W as DESIGN_W } from '@/lib/constants'
import { snapToGrid } from '@/lib/utils'
import { rasterizeMask } from '@/lib/maskRaster'
import type { RasterizedMask } from '@/lib/maskRaster'
import { findCorridorSnap } from '@/lib/corridorSnap'
import { findBeaconGuides } from '@/lib/beaconAlign'

export interface MapPoint {
  id: string
  x: number
  y: number
  color: string
  label: string
  draggable?: boolean // 생략 시 true — 자동계산된 점(보강비콘 등) 위치 고정에 사용
  radius?: number // 생략 시 9
  radiusHintPx?: number // 설계도(900) 좌표 기준 반경 — 배치 중 커버리지 가늠용 반투명 원(예: 6m)
}

const MIN_ZOOM = 1 // 기본 화면(맞춤 배율) 밑으로는 축소 못 하게
const MAX_ZOOM = 6
// 폭을 컨테이너에 그대로 맞추면(상한 없이) 아주 넓은 화면에서 세로 높이도 비례해 커지는데, 세로가
// 뷰포트 높이 근처(스크롤바가 생겼다 안 생겼다 하는 경계)에 걸리면 "폭 측정 → 높이 변경 → 스크롤바
// 유무 변경 → 가용 폭 변경 → 폭 재측정"이 무한 반복돼 화면이 확대/축소를 반복하며 흔들린다(실제
// 발견된 문제, 지도검수·종합확인·경로노드에는 이미 있는 상한을 여기도 맞춘다).
const MAX_CANVAS_W = 1000
// 다른 비콘 정렬 스냅이 실제 화면에서 항상 비슷한 크기로 느껴지도록, 줌과 무관한 레이어 좌표 임계값을
// 줌 배율로 나눠서 써서 "화면상 몇 px" 기준으로 맞춘다 — 그대로 고정값을 쓰면 기본 배율(줌 1)에서는
// 마우스로 맞추기 힘들 만큼 좁고, 확대했을 땐 반대로 너무 헐렁해진다.
const ALIGN_THRESHOLD_SCREEN_PX = 8

// 설계도 배경 + 드래그 가능한 점들. 비콘·목적지·연결자 배치에 공용.
// 부모(flex-1 등)가 내준 가로 폭을 그대로 채운다 — 폭은 ResizeObserver로 측정.
export function FloorMapCanvas({
  floorId,
  points,
  onMove,
  onCanvasClick,
  snapToCorridorCenter,
  alignSnapEnabled,
  cursorHintRadiusPx,
}: {
  floorId: string
  points: MapPoint[]
  onMove?: (id: string, x: number, y: number) => void
  onCanvasClick?: (x: number, y: number) => void
  snapToCorridorCenter?: boolean // 드래그 중 마스크 기준 복도 중심으로 자동 스냅(비콘 배치용)
  alignSnapEnabled?: boolean // 드래그 중 다른 점과 x/y가 맞으면 정렬 스냅(복도 중심 스냅이 우선)
  // 설정하면(설계도 900 좌표 기준 반경) 지도 위 커서를 따라다니는 반투명 커버리지 원을 그린다 —
  // 배치할 때 6m 범위를 미리 가늠하는 용도. 등록된 점마다 원을 그리지 않고 커서에만 붙는다(실제 요청).
  cursorHintRadiusPx?: number
}) {
  const { data: floorplan } = useFloorplan(floorId)
  const { data: mask } = useMask(snapToCorridorCenter ? floorId : '')
  const [loadedImg, setLoadedImg] = useState<{ url: string; image: HTMLImageElement } | null>(null)
  const [loadedMaskImg, setLoadedMaskImg] = useState<{ url: string; image: HTMLImageElement } | null>(null)
  const [rasterized, setRasterized] = useState<RasterizedMask | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [width, setWidth] = useState(700)
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [pointDragging, setPointDragging] = useState(false)
  // 커서 커버리지 원의 현재 위치(레이어 좌표, 줌·이동 반영 전). 마우스가 지도를 벗어나면 null.
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [snapGuide, setSnapGuide] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [alignGuides, setAlignGuides] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([])
  // 드래그 중 복도·정렬 스냅이 고정한 축 — 드롭 시 그 축까지 grid snap으로 다시 반올림해 어긋나지 않게 한다.
  // 드래그 중 스냅으로 고정한 축(양축 각각). 잠긴 축은 드롭 시 grid 반올림을 건너뛴다.
  const lockedAxisRef = useRef<{ x: boolean; y: boolean }>({ x: false, y: false })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    // 마운트 시 즉시 한 번 동기 측정(깜빡임 방지) — 이후 크기 변화는 ResizeObserver가 반영
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
    image.onload = () => setLoadedImg({ url, image })
    image.src = url
  }, [floorplan?.imageUrl])

  // 통행영역(마스크)을 지도 검수와 같은 반투명 파랑으로 배경 위에 겹쳐 보여준다 — 복도 지정이 실제로
  // 어디까지 돼 있는지 비콘 배치 화면에서도 눈으로 바로 확인할 수 있게.
  useEffect(() => {
    const url = mask?.dataUrl
    if (!url) {
      setLoadedMaskImg(null)
      return
    }
    const image = new window.Image()
    image.onload = () => setLoadedMaskImg({ url, image })
    image.src = url
  }, [mask?.dataUrl])

  useEffect(() => {
    let cancelled = false
    const next = mask ? rasterizeMask(mask) : Promise.resolve(null)
    next.then((r) => {
      if (!cancelled) setRasterized(r)
    })
    return () => {
      cancelled = true
    }
  }, [mask])

  // 로드 완료된 이미지의 URL이 현재 floorplan URL과 다르면(층 전환 등) 이전 이미지를 그리지 않는다.
  const displayImg = loadedImg && loadedImg.url === floorplan?.imageUrl ? loadedImg.image : null

  const scale = width / DESIGN_W
  const maskRatio = rasterized ? rasterized.w / DESIGN_W : 1 // 마스크 픽셀 폭 / 설계도(900) 폭
  const H = displayImg ? Math.round((displayImg.height / displayImg.width) * width) : Math.round(560 * scale)

  // maskX/Y 변환(아래 dragBoundFunc)은 마스크의 가로세로 비율이 설계도 이미지와 정확히 같다고 가정한다
  // (마스크 폭 기준 비율 하나로 x·y를 동시에 환산). 예전 설계도로 그린 마스크가 재업로드 후에도 안 지워지고
  // 남는 등, 어떤 경로로든 마스크·설계도 비율이 어긋나면 "화면엔 파랗게 보이는데 실제론 통행불가로 계산되는"
  // 것처럼 좌표가 조용히 다 틀어진다 — 조용히 틀리는 대신 바로 눈에 띄게 경고한다.
  const maskAspectMismatch =
    rasterized && displayImg
      ? Math.abs(rasterized.w / rasterized.h - displayImg.width / displayImg.height) /
          (displayImg.width / displayImg.height) >
        0.02
      : false

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

  // 기존 점(드래그) 클릭은 무시하고, 빈 배경을 클릭했을 때만 배치 좌표로 알린다.
  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!onCanvasClick) return
    const stage = e.target.getStage()
    if (!stage || e.target !== stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const localX = (pos.x - stagePos.x) / zoom
    const localY = (pos.y - stagePos.y) / zoom
    onCanvasClick(snapToGrid(Math.round(localX / scale)), snapToGrid(Math.round(localY / scale)))
  }

  // 커서 커버리지 원: 마우스가 움직일 때마다 레이어 좌표(줌·이동 무관)로 위치를 갱신한다.
  function handleStageMouseMove() {
    if (cursorHintRadiusPx == null) return
    const stage = stageRef.current
    const pos = stage?.getPointerPosition()
    if (!stage || !pos) return
    setCursorPos({ x: (pos.x - stagePos.x) / zoom, y: (pos.y - stagePos.y) / zoom })
  }

  if (!floorplan) {
    return (
      <div
        ref={containerRef}
        className="w-full border border-dashed border-line rounded-lg bg-field text-muted text-sm flex items-center justify-center"
        style={{ height: 300 }}
      >
        설계도가 없습니다. 먼저 설계도를 업로드하세요.
      </div>
    )
  }

  return (
    // 바깥(w-full)은 측정 전용 — 실제 가용 폭을 재는 기준이 캔버스 자기 자신의 렌더 크기에 좌우되면
    // 안 된다(측정 대상과 렌더 대상이 같으면 자기참조 루프가 생긴다, 실제 발견된 문제의 원인). 안쪽
    // 박스만 상한 폭으로 잡고 가운데 정렬한다 — 확대/축소 버튼·경고 배너 같은 절대위치 요소도 전부
    // 이 안쪽 박스 기준으로 따라와서, Stage만 따로 좁혔을 때처럼 버튼이 지도에서 떨어져 보이지 않는다.
    <div ref={containerRef} className="w-full">
      <div
        className="relative border border-line rounded-lg overflow-hidden bg-white mx-auto"
        style={{ cursor: onCanvasClick ? 'crosshair' : undefined, width }}
      >
      <Stage
        ref={stageRef}
        width={width}
        height={H}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePos.x}
        y={stagePos.y}
        draggable={!pointDragging}
        onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
        onWheel={onWheel}
        onClick={handleStageClick}
        onMouseMove={handleStageMouseMove}
        onMouseLeave={() => setCursorPos(null)}
      >
        <Layer listening={false}>
          {displayImg && <KonvaImage image={displayImg} width={width} height={H} />}
          {loadedMaskImg && <KonvaImage image={loadedMaskImg.image} width={width} height={H} opacity={0.45} />}
        </Layer>
        {cursorHintRadiusPx != null && cursorPos && (
          // 커서를 따라다니는 6m 커버리지 원 — 클릭을 막지 않게 listening=false, 점보다 아래(배경 위)에 둔다.
          <Layer listening={false}>
            <Circle
              x={cursorPos.x}
              y={cursorPos.y}
              radius={cursorHintRadiusPx * scale}
              fill="rgba(75,112,229,0.08)"
              stroke="rgba(75,112,229,0.35)"
              strokeWidth={1}
              dash={[4, 4]}
            />
          </Layer>
        )}
        <Layer>
          {points.map((p) => (
            <Group
              key={p.id}
              x={p.x * scale}
              y={p.y * scale}
              draggable={!!onMove && p.draggable !== false}
              dragBoundFunc={
                (snapToCorridorCenter && rasterized) || alignSnapEnabled
                  ? function (pos: { x: number; y: number }) {
                      // Konva가 dragBoundFunc에 넘기는 pos는 스테이지 절대 좌표(줌·화면이동이 반영된 값)이고,
                      // 반환값도 같은 절대 좌표로 기대된다(내부적으로 setAbsolutePosition에 그대로 적용됨).
                      // 여기 아래 로직은 전부 "줌 1배·화면 이동 없음" 기준의 Layer-local(=p.x*scale) 좌표를
                      // 전제로 짜여 있었는데, 기본 배율·중앙 정렬 상태에서는 두 좌표계가 우연히 같아서 문제가
                      // 안 드러났을 뿐이다 — 확대하거나 화면을 이동한 상태에서 정렬·복도 스냅이 엉뚱한 곳으로
                      // 튀던 원인이 바로 이 좌표계 불일치였다. 들어올 때 local로 변환하고, 반환 직전 다시
                      // 절대 좌표로 되돌린다.
                      const local = { x: (pos.x - stagePos.x) / zoom, y: (pos.y - stagePos.y) / zoom }

                      // 다른 비콘과의 정렬(구체적인 특정 비콘 좌표에 맞추려는 의도)이 복도 중앙 스냅(일반적인
                      // 통로 폭 추정)보다 우선한다 — 복도 스냅은 폭 제한이 없어 거의 항상 무언가를 찾아내므로,
                      // 복도 스냅을 먼저 보면 근처 비콘과 정렬하려는 의도가 거의 항상 가려져 버린다.
                      // 비콘 정렬(양축 각각 최근접)과 복도 중앙 스냅을 축별로 합친다. 각 축은 임계값 내
                      // 가장 가까운 기준(비콘 or 복도) 하나에 자석처럼 붙고, 그 축의 보조선 하나만 그린다.
                      // 두 축이 동시에 걸리면 세로+가로가 십자로 만난다(예전엔 한 축만 처리했다).
                      let resX = local.x
                      let resY = local.y
                      let lockX = false
                      let lockY = false
                      const nextAlignGuides: typeof alignGuides = []
                      let nextSnapGuide: typeof snapGuide = null

                      const bg = alignSnapEnabled
                        ? findBeaconGuides(
                            local.x,
                            local.y,
                            points.filter((q) => q.id !== p.id).map((q) => ({ x: q.x * scale, y: q.y * scale })),
                            ALIGN_THRESHOLD_SCREEN_PX / zoom,
                          )
                        : { snapX: null, snapY: null, xGuide: null, yGuide: null }

                      let corridor: { axis: 'x' | 'y'; x: number; y: number; guide: NonNullable<typeof snapGuide> } | null =
                        null
                      if (snapToCorridorCenter && rasterized) {
                        const maskX = (local.x / scale) * maskRatio
                        const maskY = (local.y / scale) * maskRatio
                        const snap = findCorridorSnap(rasterized.w, rasterized.h, rasterized.walkable, maskX, maskY)
                        if (snap) {
                          corridor = {
                            axis: snap.axis,
                            x: (snap.x / maskRatio) * scale,
                            y: (snap.y / maskRatio) * scale,
                            guide: {
                              x1: (snap.guide.x1 / maskRatio) * scale,
                              y1: (snap.guide.y1 / maskRatio) * scale,
                              x2: (snap.guide.x2 / maskRatio) * scale,
                              y2: (snap.guide.y2 / maskRatio) * scale,
                            },
                          }
                        }
                      }

                      // 한 축에서 {비콘 정렬, 복도 중앙(그 축일 때)} 중 현재 좌표에 더 가까운 쪽으로 스냅.
                      const resolveAxis = (
                        pos: number,
                        beaconSnap: number | null,
                        beaconGuide: NonNullable<typeof snapGuide> | null,
                        corridorHere: { v: number; guide: NonNullable<typeof snapGuide> } | null,
                      ) => {
                        const cands: {
                          v: number
                          d: number
                          beacon: NonNullable<typeof snapGuide> | null
                          corridor: NonNullable<typeof snapGuide> | null
                        }[] = []
                        if (beaconSnap != null)
                          cands.push({ v: beaconSnap, d: Math.abs(beaconSnap - pos), beacon: beaconGuide, corridor: null })
                        // 복도 중앙도 비콘 정렬과 같은 임계값 안일 때만 후보로 삼는다. 예전엔 임계값 없이
                        // 무조건 정중앙으로 당겨서, 넓은 복도에선 커서가 반-복도폭만큼(수 mm) 튀는 느낌이
                        // 강했다(실제 요청). 이제 중앙 근처로 가야만 자석처럼 붙는다.
                        if (corridorHere && Math.abs(corridorHere.v - pos) <= ALIGN_THRESHOLD_SCREEN_PX / zoom)
                          cands.push({ v: corridorHere.v, d: Math.abs(corridorHere.v - pos), beacon: null, corridor: corridorHere.guide })
                        if (!cands.length) return null
                        cands.sort((a, b) => a.d - b.d)
                        return cands[0]
                      }

                      const wx = resolveAxis(
                        local.x,
                        bg.snapX,
                        bg.xGuide,
                        corridor?.axis === 'x' ? { v: corridor.x, guide: corridor.guide } : null,
                      )
                      if (wx) {
                        resX = wx.v
                        lockX = true
                        if (wx.beacon) nextAlignGuides.push(wx.beacon)
                        if (wx.corridor) nextSnapGuide = wx.corridor
                      }
                      const wy = resolveAxis(
                        local.y,
                        bg.snapY,
                        bg.yGuide,
                        corridor?.axis === 'y' ? { v: corridor.y, guide: corridor.guide } : null,
                      )
                      if (wy) {
                        resY = wy.v
                        lockY = true
                        if (wy.beacon) nextAlignGuides.push(wy.beacon)
                        if (wy.corridor) nextSnapGuide = wy.corridor
                      }

                      // 가이드선은 React state로 그리는데, Konva는 dragBoundFunc가 반환한 좌표를 리액트
                      // 렌더링을 기다리지 않고 즉시 점에 반영한다 — flushSync 없이 setState만 하면 리액트가
                      // 다음 렌더를 배치(batch)하면서 지연시켜, 점은 이미 새 위치에 가 있는데 가이드선은
                      // 이전 프레임 위치를 그리는 어긋남이 생긴다(정렬이 점선과 다른 곳으로 되는 것처럼 보임).
                      flushSync(() => {
                        setAlignGuides(nextAlignGuides)
                        setSnapGuide(nextSnapGuide)
                      })
                      lockedAxisRef.current = { x: lockX, y: lockY }
                      // Konva가 이 반환값을 setAbsolutePosition으로 그대로 적용하므로, local(줌·이동 무관)
                      // 좌표를 다시 절대 좌표로 되돌려서 반환한다.
                      return { x: resX * zoom + stagePos.x, y: resY * zoom + stagePos.y }
                    }
                  : undefined
              }
              onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
                e.cancelBubble = true
                setPointDragging(true)
                // 드래그를 시작하면 커서 원을 바로 잡히는 점 위치로 옮긴다(첫 onDragMove 전에도 안 튀게).
                if (cursorHintRadiusPx != null) setCursorPos({ x: e.target.x(), y: e.target.y() })
              }}
              // 점을 드래그하는 동안엔 Stage의 onMouseMove가 안 뜨므로(Konva가 포인터를 점에 잡아둠),
              // 여기서 직접 커서 원을 드래그되는 점 위치로 따라오게 한다.
              onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
                if (cursorHintRadiusPx != null) setCursorPos({ x: e.target.x(), y: e.target.y() })
              }}
              onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                e.cancelBubble = true
                setPointDragging(false)
                setSnapGuide(null)
                setAlignGuides([])
                const rawX = Math.round(e.target.x() / scale)
                const rawY = Math.round(e.target.y() / scale)
                // 복도·정렬 스냅이 고정한 축은 grid snap으로 다시 반올림하지 않는다 — 안 그러면 눈에 보이던 정렬이 최대 2px 어긋난다.
                const finalX = lockedAxisRef.current.x ? rawX : snapToGrid(rawX)
                const finalY = lockedAxisRef.current.y ? rawY : snapToGrid(rawY)
                lockedAxisRef.current = { x: false, y: false }
                onMove?.(p.id, finalX, finalY)
              }}
            >
              {p.radiusHintPx != null && (
                <Circle
                  radius={p.radiusHintPx * scale}
                  fill="rgba(75,112,229,0.08)"
                  stroke="rgba(75,112,229,0.35)"
                  strokeWidth={1}
                  dash={[4, 4]}
                  listening={false}
                />
              )}
              {/* 실제 점보다 훨씬 넓은 히트 영역 — 작은 점을 살짝 빗맞혀도 배경(지도)이 아니라 점이 드래그되게 함.
                  Konva는 fill="transparent"를 히트 테스트 대상에서 제외하므로 거의 투명한 실제 색을 쓴다. */}
              <Circle radius={((p.radius ?? 9) + 10) / zoom} fill="rgba(0,0,0,0.01)" />
              {/* 반지름·테두리·글자 크기를 확대 배율로 나눠 화면상 크기를 고정한다 — 안 그러면 확대할수록
                  점과 글자가 커져서 서로 겹치거나 옆의 다른 점·가이드선을 가린다. */}
              <Circle
                radius={(p.radius ?? 9) / zoom}
                fill={p.color}
                stroke="#fff"
                strokeWidth={2 / zoom}
                listening={false}
              />
              <Text x={12 / zoom} y={-7 / zoom} text={p.label} fontSize={12 / zoom} fill="#2E3648" listening={false} />
            </Group>
          ))}
          {snapGuide && (
            <Fragment>
              <Line
                points={[snapGuide.x1, snapGuide.y1, snapGuide.x2, snapGuide.y2]}
                stroke="#EC4899"
                strokeWidth={2}
                dash={[6, 6]}
                listening={false}
              />
              {[
                { x: snapGuide.x1, y: snapGuide.y1 },
                { x: snapGuide.x2, y: snapGuide.y2 },
              ].map((end, i) => {
                const dx = snapGuide.x2 - snapGuide.x1
                const dy = snapGuide.y2 - snapGuide.y1
                const len = Math.hypot(dx, dy) || 1
                const px = (-dy / len) * 6
                const py = (dx / len) * 6
                return (
                  <Line
                    key={i}
                    points={[end.x - px, end.y - py, end.x + px, end.y + py]}
                    stroke="#60A5FA"
                    strokeWidth={2}
                    listening={false}
                  />
                )
              })}
            </Fragment>
          )}
          {alignGuides.map((g, i) => (
            <Line
              key={i}
              points={[g.x1, g.y1, g.x2, g.y2]}
              stroke="#F2992E"
              strokeWidth={1.5}
              dash={[4, 4]}
              listening={false}
            />
          ))}
        </Layer>
      </Stage>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/95 border border-line rounded-lg shadow-sm p-1">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.3)}
          className="w-7 h-7 rounded-md text-sm font-medium text-body hover:bg-gray-50"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="px-2 h-7 rounded-md text-[12px] font-medium text-muted hover:bg-gray-50 whitespace-nowrap"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.3)}
          className="w-7 h-7 rounded-md text-sm font-medium text-body hover:bg-gray-50"
        >
          +
        </button>
      </div>

      {maskAspectMismatch && (
        <div className="absolute top-1 left-1 right-1 z-10 bg-red-600 text-white text-[12px] font-medium px-2 py-1.5 rounded">
          ⚠ 통행영역(마스크)이 현재 설계도와 가로세로 비율이 다릅니다 — 복도·정렬 스냅 좌표가 어긋날 수 있어요.
          지도 검수에서 통행영역을 다시 확인/저장해주세요.
        </div>
      )}
      </div>
    </div>
  )
}
