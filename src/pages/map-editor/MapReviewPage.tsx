import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask, useSaveMask } from '@/features/mapEditor/hooks'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'

const CANVAS_W = 760
const FILL: [number, number, number, number] = [75, 112, 229, 120] // 이동영역(반투명 파랑)
const BARRIER_R = 4 // 벽 펜 반경(px)

type Tool = 'fill' | 'erase' | 'wall'

export default function MapReviewPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: floorplan, isLoading } = useFloorplan(floorId)
  const { data: savedMask } = useMask(floorId)
  const save = useSaveMask(floorId)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseDataRef = useRef<ImageData | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const walkableRef = useRef<Uint8Array | null>(null)
  const barrierRef = useRef<Uint8Array | null>(null) // 사용자가 그린 벽
  const historyRef = useRef<{ w: Uint8Array; b: Uint8Array }[]>([])
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [tool, setTool] = useState<Tool>('fill')
  const [threshold, setThreshold] = useState(240) // 이보다 어두운 픽셀 = 벽(경계)

  function rebuildMask() {
    const mask = maskCanvasRef.current
    const base = baseCanvasRef.current
    const wk = walkableRef.current
    const br = barrierRef.current
    if (!mask || !base || !wk || !br) return
    const mctx = mask.getContext('2d')!
    const md = mctx.createImageData(base.width, base.height)
    for (let i = 0; i < wk.length; i++) {
      const o = i * 4
      if (br[i]) {
        md.data[o] = 51
        md.data[o + 1] = 65
        md.data[o + 2] = 85
        md.data[o + 3] = 240
      } else if (wk[i]) {
        md.data[o] = FILL[0]
        md.data[o + 1] = FILL[1]
        md.data[o + 2] = FILL[2]
        md.data[o + 3] = FILL[3]
      }
    }
    mctx.putImageData(md, 0, 0)
  }

  function redraw() {
    const cv = canvasRef.current
    const base = baseCanvasRef.current
    const mask = maskCanvasRef.current
    if (!cv || !base) return
    const ctx = cv.getContext('2d')!
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(base, 0, 0)
    if (mask) ctx.drawImage(mask, 0, 0)
  }

  function pushHistory() {
    const wk = walkableRef.current
    const br = barrierRef.current
    if (!wk || !br) return
    historyRef.current.push({ w: wk.slice(), b: br.slice() })
    if (historyRef.current.length > 20) historyRef.current.shift()
  }

  function isWall(idx: number): boolean {
    const d = baseDataRef.current!.data
    const o = idx * 4
    if (barrierRef.current![idx]) return true
    return (d[o] + d[o + 1] + d[o + 2]) / 3 < threshold
  }

  function flood(sx: number, sy: number, add: boolean) {
    const base = baseCanvasRef.current
    const wk = walkableRef.current
    if (!base || !baseDataRef.current || !wk || !barrierRef.current) return
    const w = base.width
    const h = base.height
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return
    const start = sy * w + sx
    if (isWall(start)) return // 벽/그린벽 클릭 → 무시
    pushHistory()
    const visited = new Uint8Array(w * h)
    const stack = [start]
    while (stack.length) {
      const idx = stack.pop() as number
      if (visited[idx]) continue
      visited[idx] = 1
      if (isWall(idx)) continue
      wk[idx] = add ? 1 : 0
      const px = idx % w
      const py = (idx - px) / w
      if (px > 0) stack.push(idx - 1)
      if (px < w - 1) stack.push(idx + 1)
      if (py > 0) stack.push(idx - w)
      if (py < h - 1) stack.push(idx + w)
    }
    rebuildMask()
    redraw()
  }

  function stampDisc(cx: number, cy: number) {
    const base = baseCanvasRef.current
    const br = barrierRef.current
    const mask = maskCanvasRef.current
    if (!base || !br || !mask) return
    const w = base.width
    const h = base.height
    for (let dy = -BARRIER_R; dy <= BARRIER_R; dy++) {
      for (let dx = -BARRIER_R; dx <= BARRIER_R; dx++) {
        if (dx * dx + dy * dy > BARRIER_R * BARRIER_R) continue
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        br[y * w + x] = 1
      }
    }
    const mctx = mask.getContext('2d')!
    mctx.fillStyle = 'rgba(51,65,85,0.95)'
    mctx.beginPath()
    mctx.arc(cx, cy, BARRIER_R, 0, Math.PI * 2)
    mctx.fill()
  }

  // 두 점 사이를 보간해 연속된 벽선으로 그림(끊김 방지)
  function stampLine(x0: number, y0: number, x1: number, y1: number) {
    const dist = Math.hypot(x1 - x0, y1 - y0)
    const steps = Math.max(1, Math.ceil(dist))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      stampDisc(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t))
    }
  }

  // 설계도 로드 + 초기화(+ 저장된 마스크 복원)
  useEffect(() => {
    if (!floorplan?.imageUrl) return
    const image = new window.Image()
    image.onload = () => {
      const w = CANVAS_W
      const h = Math.round((image.height / image.width) * w)
      const base = document.createElement('canvas')
      base.width = w
      base.height = h
      const bctx = base.getContext('2d')!
      bctx.drawImage(image, 0, 0, w, h)
      baseCanvasRef.current = base
      baseDataRef.current = bctx.getImageData(0, 0, w, h)
      const mask = document.createElement('canvas')
      mask.width = w
      mask.height = h
      maskCanvasRef.current = mask
      walkableRef.current = new Uint8Array(w * h)
      barrierRef.current = new Uint8Array(w * h)
      historyRef.current = []
      setDims({ w, h })

      const finish = () => {
        rebuildMask()
        redraw()
      }
      if (savedMask?.dataUrl) {
        const mimg = new window.Image()
        mimg.onload = () => {
          const tmp = document.createElement('canvas')
          tmp.width = w
          tmp.height = h
          const tctx = tmp.getContext('2d')!
          tctx.drawImage(mimg, 0, 0, w, h)
          const md = tctx.getImageData(0, 0, w, h).data
          const wk = walkableRef.current!
          for (let i = 0; i < wk.length; i++) wk[i] = md[i * 4 + 3] > 0 ? 1 : 0
          finish()
        }
        mimg.src = savedMask.dataUrl
      } else {
        finish()
      }
    }
    image.src = floorplan.imageUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorplan?.imageUrl, savedMask?.dataUrl])

  useEffect(() => {
    if (dims) redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims])

  function getXY(e: ReactMouseEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    return {
      x: Math.round((e.clientX - rect.left) * (cv.width / rect.width)),
      y: Math.round((e.clientY - rect.top) * (cv.height / rect.height)),
    }
  }

  function onMouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (tool !== 'wall') return
    drawingRef.current = true
    pushHistory()
    const { x, y } = getXY(e)
    lastRef.current = { x, y }
    stampDisc(x, y)
    redraw()
  }
  function onMouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (tool !== 'wall' || !drawingRef.current) return
    const { x, y } = getXY(e)
    const from = lastRef.current ?? { x, y }
    stampLine(from.x, from.y, x, y)
    lastRef.current = { x, y }
    redraw()
  }
  function onMouseUp() {
    if (drawingRef.current) {
      drawingRef.current = false
      lastRef.current = null
      rebuildMask()
      redraw()
    }
  }
  function onCanvasClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (tool === 'wall') return // 벽은 드래그로 처리
    const { x, y } = getXY(e)
    flood(x, y, tool === 'fill')
  }

  function undo() {
    const prev = historyRef.current.pop()
    if (!prev) return
    walkableRef.current = prev.w
    barrierRef.current = prev.b
    rebuildMask()
    redraw()
  }
  function clearAll() {
    const wk = walkableRef.current
    const br = barrierRef.current
    if (!wk || !br) return
    pushHistory()
    wk.fill(0)
    br.fill(0)
    rebuildMask()
    redraw()
  }
  function onSave() {
    const mask = maskCanvasRef.current
    const base = baseCanvasRef.current
    const wk = walkableRef.current
    if (!mask || !base || !wk) return
    // 저장용: 통행영역(파랑)만 담은 PNG (벽선은 편집용이라 제외)
    const out = document.createElement('canvas')
    out.width = base.width
    out.height = base.height
    const octx = out.getContext('2d')!
    const od = octx.createImageData(base.width, base.height)
    for (let i = 0; i < wk.length; i++) {
      if (wk[i]) {
        const o = i * 4
        od.data[o] = FILL[0]
        od.data[o + 1] = FILL[1]
        od.data[o + 2] = FILL[2]
        od.data[o + 3] = FILL[3]
      }
    }
    octx.putImageData(od, 0, 0)
    save.mutate({ width: base.width, height: base.height, dataUrl: out.toDataURL('image/png') })
  }

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: floor ? `${floor.floor}층` : '층', to: `/buildings/${buildingId}/floors` },
    { label: '지도 검수' },
  ]

  if (isLoading) return <p className="text-muted">불러오는 중…</p>

  if (!floorplan) {
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <h1>지도 검수</h1>
        <Card>
          <p className="text-muted">설계도가 아직 없습니다. 먼저 설계도를 업로드하세요.</p>
          <Link to={`/buildings/${buildingId}/floors/${floorId}/floorplan`} className="inline-block mt-3">
            <Button>설계도 업로드</Button>
          </Link>
        </Card>
      </div>
    )
  }

  const toolBtn = (mode: Tool, label: string) => (
    <button
      onClick={() => setTool(mode)}
      className={`h-11 rounded-lg text-sm font-medium border ${
        tool === mode ? 'bg-brand text-white border-transparent' : 'bg-white text-body border-line'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>지도 검수</h1>
      <div className="flex gap-6 items-start">
        <div>
          <div
            className="border border-line rounded-lg overflow-hidden bg-white"
            style={{ width: dims?.w ?? CANVAS_W, cursor: 'crosshair' }}
          >
            {dims && (
              <canvas
                ref={canvasRef}
                width={dims.w}
                height={dims.h}
                onClick={onCanvasClick}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                style={{ display: 'block' }}
              />
            )}
          </div>
          <p className="mt-2 text-[13px] text-muted">
            영역을 <strong>클릭</strong>하면 통행 영역이 채워집니다. 출입구처럼 벽이 뚫려 밖으로 샐 때는{' '}
            <strong>벽 그리기</strong>로 틈을 막은 뒤 채우세요.
          </p>
        </div>

        <Card className="w-[260px]">
          <h3>도구</h3>
          <div className="grid gap-2">
            {toolBtn('fill', '영역 채우기')}
            {toolBtn('wall', '벽 그리기 (틈 막기)')}
            {toolBtn('erase', '영역 지우기')}
          </div>

          <div className="mt-4">
            <span className="block text-[13px] text-muted mb-2">벽 인식 민감도: {threshold}</span>
            <input
              type="range"
              min={120}
              max={250}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
            <span className="block text-[12px] text-muted mt-1">
              밖으로 새면 ↑ 올리고, 방 안에서 안 퍼지면 ↓ 내리세요.
            </span>
          </div>

          <div className="grid gap-2 mt-4">
            <Button variant="outline" onClick={undo}>
              되돌리기
            </Button>
            <Button variant="outline" onClick={clearAll}>
              전체 지우기
            </Button>
          </div>
          <Button className="w-full mt-4" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? '저장 중…' : '검수 완료 · 저장'}
          </Button>
          <p className="text-muted text-[13px] mt-3">
            채운 영역이 경로탐색(A*)의 통행 가능 영역이 됩니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
