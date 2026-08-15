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
}

// 설계도 배경 + 드래그 가능한 점들. 비콘·목적지 배치에 공용.
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
  const [width, setWidth] = useState(700)

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

  // 기존 점(드래그) 클릭은 무시하고, 빈 배경을 클릭했을 때만 배치 좌표로 알린다.
  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!onCanvasClick) return
    const stage = e.target.getStage()
    if (!stage || e.target !== stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    onCanvasClick(snapToGrid(Math.round(pos.x / scale)), snapToGrid(Math.round(pos.y / scale)))
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
      className="w-full border border-line rounded-lg overflow-hidden bg-white"
      style={{ cursor: onCanvasClick ? 'crosshair' : undefined }}
    >
      <Stage width={width} height={H} onClick={handleStageClick}>
        <Layer listening={false}>{displayImg && <KonvaImage image={displayImg} width={width} height={H} />}</Layer>
        <Layer>
          {points.map((p) => (
            <Fragment key={p.id}>
              <Circle
                x={p.x * scale}
                y={p.y * scale}
                radius={9}
                fill={p.color}
                stroke="#fff"
                strokeWidth={2}
                draggable={!!onMove && p.draggable !== false}
                onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) =>
                  onMove?.(
                    p.id,
                    snapToGrid(Math.round(e.target.x() / scale)),
                    snapToGrid(Math.round(e.target.y() / scale)),
                  )
                }
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
    </div>
  )
}
