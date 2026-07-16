import { Fragment, useEffect, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Circle, Text } from 'react-konva'
import { useFloorplan } from '@/features/floorplan/hooks'

const DESIGN_W = 900 // 좌표 기준 폭

export interface MapPoint {
  id: string
  x: number
  y: number
  color: string
  label: string
}

// 설계도 배경 + 드래그 가능한 점들. 비콘·목적지 배치에 공용.
export function FloorMapCanvas({
  floorId,
  points,
  onMove,
  width = 700,
}: {
  floorId: string
  points: MapPoint[]
  onMove?: (id: string, x: number, y: number) => void
  width?: number
}) {
  const { data: floorplan } = useFloorplan(floorId)
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!floorplan?.imageUrl) {
      setImg(null)
      return
    }
    const image = new window.Image()
    image.onload = () => setImg(image)
    image.src = floorplan.imageUrl
  }, [floorplan?.imageUrl])

  const scale = width / DESIGN_W
  const H = img ? Math.round((img.height / img.width) * width) : Math.round(560 * scale)

  if (!floorplan) {
    return (
      <div
        className="border border-dashed border-line rounded-lg bg-field text-muted text-sm flex items-center justify-center"
        style={{ width, height: 300 }}
      >
        설계도가 없습니다. 먼저 설계도를 업로드하세요.
      </div>
    )
  }

  return (
    <div className="border border-line rounded-lg overflow-hidden bg-white" style={{ width }}>
      <Stage width={width} height={H}>
        <Layer listening={false}>{img && <KonvaImage image={img} width={width} height={H} />}</Layer>
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
                draggable={!!onMove}
                onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) =>
                  onMove?.(p.id, Math.round(e.target.x() / scale), Math.round(e.target.y() / scale))
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
