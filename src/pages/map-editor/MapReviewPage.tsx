import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import { useFloorplan } from '@/features/floorplan/hooks'
import { useMask, useSaveMask, useScale, useSaveScale } from '@/features/mapEditor/hooks'
import { closeGaps, openNoise } from '@/lib/maskMorphology'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SentenceText } from '@/components/ui/SentenceText'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { StepFooter } from '@/components/layout/StepNav'

const CANVAS_W = 760
const FILL: [number, number, number, number] = [75, 112, 229, 120] // 이동영역(반투명 파랑)
const BARRIER_R = 2 // 벽 펜 반경(px)
const ZOOM_MIN = 1 // 기본 화면(맞춤 배율) 밑으로는 축소 못 하게
const ZOOM_MAX = 8

// 드래그 자체가 도구 동작인 건 벽 그리기·영역 그리기·지우기뿐이다 — 이것들만 배경 드래그로 그리기/
// 선택을 하고, 나머지(채우기·축척·도구 미선택)는 다른 화면들처럼 배경을 드래그하면 바로 화면 이동이 된다.
type Tool = 'fill' | 'drawArea' | 'wall' | 'erase' | 'scale' | 'pan' | null
const PAN_DRAG_THRESHOLD_PX = 4 // 이 정도는 움직여야 '클릭'이 아니라 '드래그(이동)'로 간주

export default function MapReviewPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: floorplan, isLoading } = useFloorplan(floorId)
  const { data: savedMask } = useMask(floorId)
  const save = useSaveMask(floorId)
  const { data: savedScale } = useScale(floorId)
  const saveScale = useSaveScale(floorId)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseDataRef = useRef<ImageData | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const walkableRef = useRef<Uint8Array | null>(null)
  const barrierRef = useRef<Uint8Array | null>(null) // 사용자가 그린 벽
  const historyRef = useRef<{ w: Uint8Array; b: Uint8Array }[]>([])
  const redoRef = useRef<{ w: Uint8Array; b: Uint8Array }[]>([])
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const scalePointsRef = useRef<{ x: number; y: number }[]>([]) // 축척 측정용 두 점(계산 후 저장하지 않음)
  const scaleHoverRef = useRef<{ x: number; y: number } | null>(null) // 두 번째 점 스냅 미리보기
  const areaStartRef = useRef<{ x: number; y: number } | null>(null) // 사각형 채우기/지우개 드래그 시작점
  const areaCurrentRef = useRef<{ x: number; y: number } | null>(null)
  const panDragRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(
    null,
  )
  // 채우기/축척/도구 미선택 상태에서 배경을 눌렀다가 임계값 이상 움직이면 이동으로 처리했다는 표시 —
  // 뒤이어 뜨는 클릭 이벤트에서 채우기·축척 지점 찍기를 건너뛰기 위해 필요하다.
  const dragMovedRef = useRef(false)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [tool, setTool] = useState<Tool>('fill')
  const [threshold, setThreshold] = useState(240) // 이보다 어두운 픽셀 = 벽(경계)
  const [scaleModalOpen, setScaleModalOpen] = useState(false)
  const [distanceInput, setDistanceInput] = useState('')
  const [distanceError, setDistanceError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(700)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 }) // 화면(CSS) px 단위 이동량
  const [gapFillM, setGapFillM] = useState('0.3')
  const [noiseRemoveM, setNoiseRemoveM] = useState('0.3')

  const fitScale = dims ? containerWidth / dims.w : 1

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
    drawScaleOverlay(ctx)
    drawAreaOverlay(ctx)
  }

  // 두 번째 점을 첫 점 기준 수평/수직 축에 스냅(움직임이 큰 축을 따라간다)
  function snapAxis(anchor: { x: number; y: number }, raw: { x: number; y: number }) {
    const dx = raw.x - anchor.x
    const dy = raw.y - anchor.y
    return Math.abs(dx) >= Math.abs(dy) ? { x: raw.x, y: anchor.y } : { x: anchor.x, y: raw.y }
  }

  // 측정 중인 축척 두 점 + 연결선 + 실시간 px 거리 라벨을 마스크 위에 그림(저장 대상 아님, 화면 표시용)
  function drawScaleOverlay(ctx: CanvasRenderingContext2D) {
    const pts = scalePointsRef.current
    const endPt = pts.length === 2 ? pts[1] : scaleHoverRef.current
    if (pts.length === 0) return
    ctx.save()
    if (pts.length >= 1 && endPt) {
      ctx.strokeStyle = '#DC4C4C'
      ctx.lineWidth = 2
      ctx.setLineDash(pts.length === 2 ? [] : [6, 5])
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(endPt.x, endPt.y)
      ctx.stroke()
      ctx.setLineDash([])

      const dist = Math.round(Math.hypot(endPt.x - pts[0].x, endPt.y - pts[0].y))
      const label = `${dist}px`
      const midx = (pts[0].x + endPt.x) / 2
      const midy = (pts[0].y + endPt.y) / 2
      ctx.font = '600 11px -apple-system, sans-serif'
      const tw = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillRect(midx - tw / 2 - 4, midy - 20, tw + 8, 15)
      ctx.fillStyle = '#DC4C4C'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, midx, midy - 12)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
    ctx.fillStyle = '#DC4C4C'
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // 사각형 채우기/지우개 드래그 중인 영역 미리보기
  function drawAreaOverlay(ctx: CanvasRenderingContext2D) {
    if (tool !== 'drawArea' && tool !== 'erase') return
    const s = areaStartRef.current
    const c = areaCurrentRef.current
    if (!s || !c) return
    const x0 = Math.min(s.x, c.x)
    const y0 = Math.min(s.y, c.y)
    const w = Math.abs(c.x - s.x)
    const h = Math.abs(c.y - s.y)
    ctx.save()
    if (tool === 'drawArea') {
      ctx.strokeStyle = 'rgba(75,112,229,0.9)'
      ctx.fillStyle = 'rgba(75,112,229,0.15)'
    } else {
      ctx.strokeStyle = 'rgba(55,65,81,0.85)'
      ctx.fillStyle = 'rgba(55,65,81,0.12)'
    }
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.fillRect(x0, y0, w, h)
    ctx.strokeRect(x0, y0, w, h)
    ctx.restore()
  }

  // 도구 전환 시 진행 중이던 측정/드래그 상태는 버림
  function selectTool(mode: Tool) {
    scalePointsRef.current = []
    scaleHoverRef.current = null
    areaStartRef.current = null
    areaCurrentRef.current = null
    panDragRef.current = null
    setTool(mode)
    redraw()
  }

  function pushHistory() {
    const wk = walkableRef.current
    const br = barrierRef.current
    if (!wk || !br) return
    historyRef.current.push({ w: wk.slice(), b: br.slice() })
    if (historyRef.current.length > 20) historyRef.current.shift()
    redoRef.current = [] // 새 작업이 생기면 다시 실행 스택은 무효화
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

  // 사각형 영역을 통행영역으로 채우거나(add) 완전히 지운다(마스크+벽 둘 다 제거)
  function applyRectArea(x0: number, y0: number, x1: number, y1: number, add: boolean) {
    const base = baseCanvasRef.current
    const wk = walkableRef.current
    const br = barrierRef.current
    if (!base || !wk || !br) return
    const w = base.width
    const h = base.height
    const xlo = Math.max(0, Math.min(Math.round(x0), Math.round(x1)))
    const xhi = Math.min(w - 1, Math.max(Math.round(x0), Math.round(x1)))
    const ylo = Math.max(0, Math.min(Math.round(y0), Math.round(y1)))
    const yhi = Math.min(h - 1, Math.max(Math.round(y0), Math.round(y1)))
    for (let y = ylo; y <= yhi; y++) {
      for (let x = xlo; x <= xhi; x++) {
        const idx = y * w + x
        wk[idx] = add ? 1 : 0
        if (!add) br[idx] = 0
      }
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
      redoRef.current = []
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

  function undo() {
    const wk = walkableRef.current
    const br = barrierRef.current
    const prev = historyRef.current.pop()
    if (!prev || !wk || !br) return
    redoRef.current.push({ w: wk.slice(), b: br.slice() })
    walkableRef.current = prev.w
    barrierRef.current = prev.b
    rebuildMask()
    redraw()
  }
  function redo() {
    const wk = walkableRef.current
    const br = barrierRef.current
    const next = redoRef.current.pop()
    if (!next || !wk || !br) return
    historyRef.current.push({ w: wk.slice(), b: br.slice() })
    walkableRef.current = next.w
    barrierRef.current = next.b
    rebuildMask()
    redraw()
  }

  // 되돌리기/다시 실행 키보드 단축키(Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z 또는 Ctrl+Y) — 모달이 열려있을 땐 끔
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (scaleModalOpen || confirmSaveOpen) return
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
  }, [scaleModalOpen, confirmSaveOpen])

  // 컨테이너 폭 측정(확대 배율 계산용)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    setContainerWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 커서(또는 화면 중앙) 아래 지점이 확대 후에도 같은 자리에 남도록 pan을 같이 조정한다 —
  // Konva 화면들(FloorMapCanvas/PathNodePage)의 stage scale+position 확대와 동일한 계산.
  function zoomAt(pointer: { x: number; y: number }, nextZoom: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom))
    const pointTo = { x: (pointer.x - pan.x) / zoom, y: (pointer.y - pan.y) / zoom }
    setZoom(clamped)
    setPan({ x: pointer.x - pointTo.x * clamped, y: pointer.y - pointTo.y * clamped })
  }

  // 스페이스바를 누르고 있는 동안은 어떤 도구를 쓰고 있어도 임시로 화면 이동 모드가 된다
  // (Figma/Photoshop과 동일한 관례) — 도구를 바꾸지 않고도 마우스로 바로 이동할 수 있게.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      // 키를 누르고 있으면 브라우저가 keydown을 반복 발생시키는데(e.repeat), 그 반복 이벤트까지
      // 매번 preventDefault 해야 스페이스 기본 동작(페이지 스크롤)이 안 새어나간다 — 처음 한 번만
      // 막으면 계속 누르고 있는 동안 스크롤이 내려간다.
      e.preventDefault()
      if (!e.repeat) setSpaceHeld(true)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const panActive = tool === 'pan' || spaceHeld

  // 대부분 마우스로 쓰니 휠은 그냥(별도 키 없이) 확대·축소가 기본 — 마우스 휠은 deltaY만 있어서
  // Ctrl 없이 스크롤/핀치를 구분할 방법이 없다. 트랙패드 두 손가락 스크롤은 Ctrl을 누른 채로 하면
  // 화면 이동(브라우저가 Ctrl+휠로 보고하는 트랙패드 핀치도 같이 이동으로 처리됨).
  // React 합성 wheel 이벤트는 기본적으로 passive라 preventDefault가 안 먹어서 네이티브로 붙인다.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    function handleWheel(e: WheelEvent) {
      e.preventDefault()
      if (e.ctrlKey) {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
        return
      }
      const rect = el!.getBoundingClientRect()
      const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      zoomAt(pointer, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan])

  function zoomBy(factor: number) {
    const el = stageRef.current
    const rect = el?.getBoundingClientRect()
    const pointer = rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 }
    zoomAt(pointer, zoom * factor)
  }
  function resetZoom() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function getXY(e: ReactMouseEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    return {
      x: Math.round((e.clientX - rect.left) * (cv.width / rect.width)),
      y: Math.round((e.clientY - rect.top) * (cv.height / rect.height)),
    }
  }

  function onMouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    // 스페이스바를 누르고 있거나(임시 이동 모드), 마우스 휠(가운데) 버튼으로 누르면 도구와 상관없이
    // 바로 화면 이동을 시작한다 — 매번 '화면 이동' 도구로 바꿀 필요 없게.
    if (panActive || e.button === 1) {
      e.preventDefault()
      panDragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPanX: pan.x, startPanY: pan.y }
      dragMovedRef.current = false
      return
    }
    if (tool === 'wall') {
      drawingRef.current = true
      pushHistory()
      const { x, y } = getXY(e)
      lastRef.current = { x, y }
      stampDisc(x, y)
      redraw()
      return
    }
    if (tool === 'drawArea' || tool === 'erase') {
      const { x, y } = getXY(e)
      areaStartRef.current = { x, y }
      areaCurrentRef.current = { x, y }
      redraw()
      return
    }
    // 채우기·축척·도구 미선택 상태: 드래그 자체를 쓰는 도구가 아니라서, 다른 화면들처럼 배경을
    // 드래그하면 화면 이동으로 처리될 수 있게 일단 잡아둔다 — 실제 이동 여부는 onMouseMove에서
    // 임계값 이상 움직였는지 보고 정한다(살짝 흔들린 클릭까지 이동으로 잡히지 않도록).
    panDragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPanX: pan.x, startPanY: pan.y }
    dragMovedRef.current = false
  }
  function onMouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (panDragRef.current) {
      const { startClientX, startClientY, startPanX, startPanY } = panDragRef.current
      const dx = e.clientX - startClientX
      const dy = e.clientY - startClientY
      if (panActive || Math.hypot(dx, dy) > PAN_DRAG_THRESHOLD_PX) {
        dragMovedRef.current = true
        setPan({ x: startPanX + dx, y: startPanY + dy })
      }
      return
    }
    if (tool === 'wall' && drawingRef.current) {
      const { x, y } = getXY(e)
      const from = lastRef.current ?? { x, y }
      stampLine(from.x, from.y, x, y)
      lastRef.current = { x, y }
      redraw()
      return
    }
    if ((tool === 'drawArea' || tool === 'erase') && areaStartRef.current) {
      areaCurrentRef.current = getXY(e)
      redraw()
      return
    }
    if (tool === 'scale' && scalePointsRef.current.length === 1) {
      scaleHoverRef.current = snapAxis(scalePointsRef.current[0], getXY(e))
      redraw()
    }
  }
  function onMouseUp() {
    if (panDragRef.current) {
      panDragRef.current = null
      return
    }
    if (drawingRef.current) {
      drawingRef.current = false
      lastRef.current = null
      rebuildMask()
      redraw()
      return
    }
    if ((tool === 'drawArea' || tool === 'erase') && areaStartRef.current && areaCurrentRef.current) {
      pushHistory()
      applyRectArea(
        areaStartRef.current.x,
        areaStartRef.current.y,
        areaCurrentRef.current.x,
        areaCurrentRef.current.y,
        tool === 'drawArea',
      )
      areaStartRef.current = null
      areaCurrentRef.current = null
      rebuildMask()
      redraw()
    }
  }
  function onCanvasClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    // 배경을 눌렀다가 임계값 이상 움직여서 이미 화면 이동으로 처리된 제스처면, 뒤이어 뜨는 클릭에서
    // 채우기·축척 지점 찍기를 하지 않는다(이동 끝난 자리에 엉뚱하게 찍히는 것 방지).
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      return
    }
    if (panActive || tool === 'wall' || tool === 'drawArea' || tool === 'erase') return // 드래그로 처리
    const { x, y } = getXY(e)
    if (tool === 'scale') {
      const pts = scalePointsRef.current
      if (pts.length === 1) {
        const snapped = scaleHoverRef.current ?? { x, y }
        scalePointsRef.current = [pts[0], snapped]
        scaleHoverRef.current = null
      } else {
        scalePointsRef.current = [{ x, y }]
      }
      redraw()
      if (scalePointsRef.current.length === 2) {
        setDistanceInput('')
        setDistanceError(null)
        setScaleModalOpen(true)
      }
      return
    }
    if (tool === 'fill') flood(x, y, true) // 도구 미선택(null) 상태에선 클릭해도 아무 동작 없음
  }

  function confirmScale() {
    const pts = scalePointsRef.current
    if (pts.length !== 2) return
    const pixelDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
    const meters = Number(distanceInput)
    if (pixelDist <= 0) {
      setDistanceError('같은 지점을 두 번 클릭했습니다. 취소 후 다시 측정해주세요.')
      return
    }
    if (!Number.isFinite(meters) || meters <= 0) {
      setDistanceError('실거리를 0보다 큰 숫자로 입력하세요.')
      return
    }
    saveScale.mutate(
      { scaleMPerPx: meters / pixelDist },
      {
        onSuccess: () => {
          scalePointsRef.current = []
          setScaleModalOpen(false)
          redraw()
        },
      },
    )
  }

  function cancelScale() {
    scalePointsRef.current = []
    setScaleModalOpen(false)
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

  function applyGapFill() {
    const base = baseCanvasRef.current
    const wk = walkableRef.current
    const br = barrierRef.current
    const gapM = Number(gapFillM)
    if (!base || !wk || !br || !savedScale || !Number.isFinite(gapM) || gapM <= 0) return
    const r = Math.max(1, Math.round(gapM / 2 / savedScale.scaleMPerPx))
    pushHistory()
    walkableRef.current = closeGaps(wk, br, base.width, base.height, r)
    rebuildMask()
    redraw()
  }

  function applyNoiseRemove() {
    const base = baseCanvasRef.current
    const wk = walkableRef.current
    const br = barrierRef.current
    const noiseM = Number(noiseRemoveM)
    if (!base || !wk || !br || !savedScale || !Number.isFinite(noiseM) || noiseM <= 0) return
    const r = Math.max(1, Math.round(noiseM / 2 / savedScale.scaleMPerPx))
    pushHistory()
    walkableRef.current = openNoise(wk, br, base.width, base.height, r)
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
      onClick={() => selectTool(tool === mode ? null : mode)}
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
        <div className="flex-1 min-w-0">
          <div
            ref={stageRef}
            className="relative w-full border border-line rounded-lg bg-white overflow-hidden"
            style={{
              cursor: panActive || tool === null ? 'grab' : 'crosshair',
              height: dims ? dims.h * fitScale : undefined,
            }}
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
                style={{
                  display: 'block',
                  width: dims.w * fitScale,
                  height: dims.h * fitScale,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              />
            )}
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
                onClick={resetZoom}
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
          <div className="flex items-center gap-1.5 mt-2 text-[13px] text-muted">
            <span>사용법</span>
            <InfoTooltip
              text="영역을 클릭하면 통행 영역이 채워집니다. 출입구처럼 벽이 뚫려 밖으로 샐 때는 벽 그리기로 틈을 막은 뒤 채우세요. Ctrl+휠(트랙패드는 Ctrl+두 손가락) 또는 스페이스바를 누른 채 드래그하거나 마우스 가운데 버튼을 사용하면 어떤 도구를 쓰던 중이든 화면 이동 가능합니다."
            />
          </div>
        </div>

        <Card className="w-[260px] shrink-0">
          <h3>도구</h3>
          <div className="grid gap-2">
            {toolBtn('fill', '영역 채우기')}
            {toolBtn('drawArea', '영역 그리기 (사각형)')}
            {toolBtn('erase', '영역 지우기 (사각형)')}
            {toolBtn('wall', '벽 그리기 (틈 막기)')}
            {toolBtn('scale', '축척 설정')}
            {toolBtn('pan', '화면 이동')}
          </div>

          <div className="undo-row grid grid-cols-2 gap-2 mt-2">
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

          <div className="mt-4">
            <span className="flex items-center gap-1.5 text-[13px] text-muted mb-2">
              벽 인식 민감도: {threshold}
              <InfoTooltip text="밖으로 새면 ↑ 올리고, 방 안에서 안 퍼지면 ↓ 내리세요." />
            </span>
            <input
              type="range"
              min={120}
              max={250}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="mt-4">
            <span className="flex items-center gap-1.5 text-[13px] text-muted mb-2">
              틈 메우기
              <InfoTooltip text="복도가 살짝 끊어져 보이면, 아래 거리 이내일 때 자동으로 이어붙여요." />
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted">이 거리까지 이어붙이기</span>
              <input
                type="number"
                min={0.01}
                step={0.05}
                value={gapFillM}
                onChange={(e) => setGapFillM(e.target.value)}
                className="w-16 h-9 px-2 rounded-lg border border-line bg-field text-sm outline-none text-right"
              />
              <span className="text-[12px] text-muted">m</span>
            </div>
            <Button
              variant="outline"
              className="w-full mt-2"
              disabled={!savedScale}
              onClick={applyGapFill}
            >
              틈 메우기 적용
            </Button>
          </div>

          <div className="mt-4">
            <span className="flex items-center gap-1.5 text-[13px] text-muted mb-2">
              벽 모양 다듬기
              <InfoTooltip text="자동으로 채워진 벽 모양이 울퉁불퉁하거나 작은 구멍·돌기가 있으면, 지정한 크기 이하는 매끄럽게 다듬어요." />
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted">이 크기까지 다듬기</span>
              <input
                type="number"
                min={0.01}
                step={0.05}
                value={noiseRemoveM}
                onChange={(e) => setNoiseRemoveM(e.target.value)}
                className="w-16 h-9 px-2 rounded-lg border border-line bg-field text-sm outline-none text-right"
              />
              <span className="text-[12px] text-muted">m</span>
            </div>
            <Button
              variant="outline"
              className="w-full mt-2"
              disabled={!savedScale}
              onClick={applyNoiseRemove}
            >
              벽 다듬기 적용
            </Button>
          </div>

          {!savedScale && (
            <p className="text-[12px] text-muted mt-2">
              틈 메우기·벽 모양 다듬기는 축척을 먼저 설정해야 사용할 수 있습니다.
            </p>
          )}

          <div className="mt-4">
            <span className="block text-[13px] text-muted mb-2">축척</span>
            {savedScale ? (
              <p className="text-[13px] text-ink">
                현재 축척: 100px ≈ {(savedScale.scaleMPerPx * 100).toFixed(2)}m
              </p>
            ) : (
              <p className="text-[13px] text-muted">축척이 아직 설정되지 않았습니다.</p>
            )}
            {tool === 'scale' && (
              <p className="text-[12px] text-muted mt-1">
                실제 거리를 아는 두 지점을 도면 위에서 순서대로 클릭하세요.
              </p>
            )}
          </div>

          <div className="grid gap-2 mt-4">
            <Button variant="outline" onClick={clearAll}>
              전체 지우기
            </Button>
          </div>
          <Button
            className="w-full mt-4"
            disabled={save.isPending}
            onClick={() => setConfirmSaveOpen(true)}
          >
            {save.isPending ? '저장 중…' : '검수 완료 · 저장'}
          </Button>
          <p className="text-muted text-[13px] mt-3">
            채운 영역이 경로탐색의 통행 가능 영역이 됩니다.
          </p>
        </Card>
      </div>

      <StepFooter buildingId={buildingId} floorId={floorId} current="map" />

      <Modal open={confirmSaveOpen} onClose={() => setConfirmSaveOpen(false)}>
        <h2 style={{ marginTop: 0 }}>검수를 완료하시겠습니까?</h2>
        <SentenceText text="현재까지 채운 통행 영역이 저장되며, 이후 경로탐색에 이 영역이 사용됩니다." style={{ color: '#8C99B3' }} />
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <Button variant="outline" onClick={() => setConfirmSaveOpen(false)}>
            취소
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              onSave()
              setConfirmSaveOpen(false)
            }}
          >
            확인
          </Button>
        </div>
      </Modal>

      <Modal open={scaleModalOpen} onClose={cancelScale}>
        <h2 style={{ marginTop: 0 }}>실거리 입력</h2>
        <p style={{ color: '#8C99B3' }}>방금 찍은 두 지점 사이의 실제 거리를 미터(m) 단위로 입력하세요.</p>
        <input
          type="number"
          min={0}
          step="0.01"
          autoFocus
          value={distanceInput}
          onChange={(e) => {
            setDistanceInput(e.target.value)
            setDistanceError(null)
          }}
          placeholder="예: 2.4"
          className="w-full h-12 px-4 mt-3 rounded-lg border border-[#DEE2EB] bg-field text-sm outline-none"
        />
        {distanceError && (
          <p className="text-[13px] mt-2" style={{ color: '#DC4C4C' }}>
            {distanceError}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <Button variant="outline" onClick={cancelScale}>
            취소
          </Button>
          <Button disabled={saveScale.isPending} onClick={confirmScale}>
            {saveScale.isPending ? '저장 중…' : '확인'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
