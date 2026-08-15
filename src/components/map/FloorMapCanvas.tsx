import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Circle, Text } from 'react-konva'
import { useFloorplan } from '@/features/floorplan/hooks'
import { MAP_DESIGN_W as DESIGN_W } from '@/lib/constants'
import { snapToGrid } from '@/lib/utils'

export interface MapPoint {
  id: string
  x: number
  y: number
  color: string
  label: string
  draggable?: boolean // 생략 시 true — 자동계산된 점(보강비콘 등) 위치 고정에 사용
  radius?: number // 생략 시 9
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 6

// 설계도 배경 + 드래그 가능한 점들. 비콘·목적지·연결자 배치에 공용.
// 부모(flex-1 등)가 내준 가로 폭을 그대로 채운다 — 폭은 ResizeObserver로 측정.
export function FloorMapCanvas({
  floorId,
  points,
  onMove,
  onCanvasClick,
}: {
  floorId: string
  points: MapPoint[]
  onMove?: (id: string, x: number, y: number) => void
  onCanvasClick?: (x: number, y: number) => void
}) {
  const { data: floorplan } = useFloorplan(floorId)
  const [loadedImg, setLoadedImg] = useState<{ url: string; image: HTMLImageElement } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [width, setWidth] = useState(700)
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [pointDragging, setPointDragging] = useState(false)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    // 마운트 시 즉시 한 번 동기 측정(깜빡임 방지) — 이후 크기 변화는 ResizeObserver가 반영
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
    image.onload = () => setLoadedImg({ url, image })
    image.src = url
  }, [floorplan?.imageUrl])

  // 로드 완료된 이미지의 URL이 현재 floorplan URL과 다르면(층 전환 등) 이전 이미지를 그리지 않는다.
  const displayImg = loadedImg && loadedImg.url === floorplan?.imageUrl ? loadedImg.image : null

  const scale = width / DESIGN_W
  const H = displayImg ? Math.round((displayImg.height / displayImg.width) * width) : Math.round(560 * scale)

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
    <div
      ref={containerRef}
      className="relative w-full border border-line rounded-lg overflow-hidden bg-white"
      style={{ cursor: onCanvasClick ? 'crosshair' : undefined }}
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
      >
        <Layer listening={false}>{displayImg && <KonvaImage image={displayImg} width={width} height={H} />}</Layer>
        <Layer>
          {points.map((p) => (
            <Fragment key={p.id}>
              <Circle
                x={p.x * scale}
                y={p.y * scale}
                radius={p.radius ?? 9}
                fill={p.color}
                stroke="#fff"
                strokeWidth={2}
                draggable={!!onMove && p.draggable !== false}
                onDragStart={(e) => {
                  e.cancelBubble = true
                  setPointDragging(true)
                }}
                onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                  e.cancelBubble = true
                  setPointDragging(false)
                  onMove?.(
                    p.id,
                    snapToGrid(Math.round(e.target.x() / scale)),
                    snapToGrid(Math.round(e.target.y() / scale)),
                  )
                }}
              />
              <Text
                x={p.x * scale + 12}
                y={p.y * scale - 7}
                text={p.label}
                fontSize={12}
                fill="#2E3648"
                listening={false}
              />
            </Fragment>
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
    </div>
  )
}
