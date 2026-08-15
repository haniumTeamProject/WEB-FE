import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text } from 'react-konva'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask } from '@/features/mapEditor/hooks'
import { MAP_DESIGN_W as DESIGN_W } from '@/lib/constants'
import { snapToGrid } from '@/lib/utils'
import { rasterizeMask } from '@/lib/maskRaster'
import type { RasterizedMask } from '@/lib/maskRaster'
import { findCorridorSnap } from '@/lib/corridorSnap'

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

const MIN_ZOOM = 0.5
const MAX_ZOOM = 6

// 설계도 배경 + 드래그 가능한 점들. 비콘·목적지·연결자 배치에 공용.
// 부모(flex-1 등)가 내준 가로 폭을 그대로 채운다 — 폭은 ResizeObserver로 측정.
export function FloorMapCanvas({
  floorId,
  points,
  onMove,
  onCanvasClick,
  snapToCorridorCenter,
}: {
  floorId: string
  points: MapPoint[]
  onMove?: (id: string, x: number, y: number) => void
  onCanvasClick?: (x: number, y: number) => void
  snapToCorridorCenter?: boolean // 드래그 중 마스크 기준 복도 중심으로 자동 스냅(비콘 배치용)
}) {
  const { data: floorplan } = useFloorplan(floorId)
  const { data: mask } = useMask(snapToCorridorCenter ? floorId : '')
  const [loadedImg, setLoadedImg] = useState<{ url: string; image: HTMLImageElement } | null>(null)
  const [rasterized, setRasterized] = useState<RasterizedMask | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [width, setWidth] = useState(700)
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [pointDragging, setPointDragging] = useState(false)
  const [snapGuide, setSnapGuide] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

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
              {p.radiusHintPx != null && (
                <Circle
                  x={p.x * scale}
                  y={p.y * scale}
                  radius={p.radiusHintPx * scale}
                  fill="rgba(75,112,229,0.08)"
                  stroke="rgba(75,112,229,0.35)"
                  strokeWidth={1}
                  dash={[4, 4]}
                  listening={false}
                />
              )}
              <Circle
                x={p.x * scale}
                y={p.y * scale}
                radius={p.radius ?? 9}
                fill={p.color}
                stroke="#fff"
                strokeWidth={2}
                draggable={!!onMove && p.draggable !== false}
                dragBoundFunc={
                  snapToCorridorCenter && rasterized
                    ? function (pos: { x: number; y: number }) {
                        const maskX = (pos.x / scale) * maskRatio
                        const maskY = (pos.y / scale) * maskRatio
                        const snap = findCorridorSnap(rasterized.w, rasterized.h, rasterized.walkable, maskX, maskY)
                        if (!snap) {
                          setSnapGuide(null)
                          return pos
                        }
                        setSnapGuide({
                          x1: (snap.guide.x1 / maskRatio) * scale,
                          y1: (snap.guide.y1 / maskRatio) * scale,
                          x2: (snap.guide.x2 / maskRatio) * scale,
                          y2: (snap.guide.y2 / maskRatio) * scale,
                        })
                        return { x: (snap.x / maskRatio) * scale, y: (snap.y / maskRatio) * scale }
                      }
                    : undefined
                }
                onDragStart={(e) => {
                  e.cancelBubble = true
                  setPointDragging(true)
                }}
                onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                  e.cancelBubble = true
                  setPointDragging(false)
                  setSnapGuide(null)
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
