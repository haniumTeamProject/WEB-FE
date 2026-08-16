import { describe, expect, it } from 'vitest'
import { generatePathNodes } from './pathNodes'

describe('generatePathNodes entrance facing (상하좌우 4방향)', () => {
  it('finds the facing point across the corridor by casting straight down from the entrance', () => {
    const W = 200
    const H = 60
    const mask = new Uint8Array(W * H)
    // 복도: y in [20,40)
    for (let y = 20; y < 40; y++) for (let x = 0; x < W; x++) mask[y * W + x] = 1
    // 복도 위쪽에 붙은 방(예: 문턱): x in [80,120), y in [0,20) — 실제 사례처럼 방이 마스크에 같이 칠해진 상황
    for (let y = 0; y < 20; y++) for (let x = 80; x < 120; x++) mask[y * W + x] = 1

    // 방의 모서리(방 왼쪽벽×윗벽이 만나는 지점) 바로 안쪽.
    const entrance = { x: 82, y: 2, kind: 'landmark' as const }
    const { nodes } = generatePathNodes(mask, W, H, [entrance])

    // 4방향 각각 독립적으로 맞은편을 찾으므로 이 입구의 짝(pairKind==='landmark')인 'facing' 노드가
    // 여러 개 나올 수 있다 — 그중 아래쪽(복도 반대편 벽, y≈40) 방향이 하나는 있어야 한다.
    const facings = nodes.filter((n) => n.type === 'facing' && n.pairKind === 'landmark')
    expect(facings.length).toBeGreaterThan(0)
    expect(facings.some((f) => f.y > 35)).toBe(true)
  })

  it('crosses the whole room to the far wall, not just to the doorway jamb, when casting sideways', () => {
    const W = 200
    const H = 60
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(10, 0, 150, 30) // 방(410) 내부
    rect(0, 35, 200, 55) // 복도(방과 5px 벽으로 분리)
    rect(20, 30, 80, 35) // 방↔복도를 잇는 문(폭 60px, 왼쪽 기둥과 반대쪽 기둥이 멀리 떨어지도록 넓게 둠)

    // 문틀 왼쪽 기둥(20,30)~(20,35) 바로 옆.
    const entrance = { x: 22, y: 28, kind: 'landmark' as const }
    const { nodes } = generatePathNodes(mask, W, H, [entrance])

    const landmark = nodes.find((n) => n.type === 'landmark')
    const facings = nodes.filter((n) => n.type === 'facing' && n.pairKind === 'landmark')
    expect(landmark).toBeTruthy()
    expect(facings.length).toBeGreaterThan(0)
    // 오른쪽으로 쏘면 방을 가로질러 진짜 반대편 벽(x≈150)까지 가야 한다 — 문틀 반대쪽 기둥(x≈80)에서
    // 멈추면 안 된다.
    expect(facings.some((f) => f.x > 100)).toBe(true)
  })

  it('falls back to the mask-snapped position when the entrance itself sits outside the walkable mask', () => {
    // 실제 사례: 목적지/연결자가 통행영역으로 안 칠해진 방 한가운데 찍혀 있는 경우 — 원래 좌표에서
    // 그대로 4방향을 쏘면 첫 걸음부터 통행 불가라 전부 실패한다. 경계에 스냅된 지점에서 다시 쏴야 한다.
    const W = 100
    const H = 60
    const mask = new Uint8Array(W * H)
    // 복도만 칠해져 있다(y in [30,40)) — 그 위의 "방"은 마스크에 전혀 칠해지지 않았다.
    for (let y = 30; y < 40; y++) for (let x = 0; x < W; x++) mask[y * W + x] = 1

    // 통행영역 밖(방 안쪽 깊숙한 곳)에 찍힌 목적지 — 실제 버그 재현 케이스.
    const entrance = { x: 50, y: 5, kind: 'landmark' as const }
    const { nodes } = generatePathNodes(mask, W, H, [entrance])

    const landmark = nodes.find((n) => n.type === 'landmark')
    expect(landmark).toBeTruthy()
    // 원래 좌표(50,5)는 통행 불가라도, 스냅된 지점(복도 경계, y≈30 근처)에서는 맞은편(복도 반대편
    // 벽, y≈40)을 찾을 수 있어야 한다.
    const facings = nodes.filter((n) => n.type === 'facing' && n.pairKind === 'landmark')
    expect(facings.length).toBeGreaterThan(0)
  })

  it('keeps two distinct nearby destination entrances as separate nodes (does not silently merge one away)', () => {
    // 실제 사례: 아주 가까이 붙은 서로 다른 목적지 2개(예: 문 하나에 랜드마크 2개)가 경로노드 생성 시
    // MERGE_RADIUS_PX(6px) 이내라는 이유만으로 하나로 합쳐지면서 하나가 사라져 버리던 버그.
    const W = 100
    const H = 60
    const mask = new Uint8Array(W * H)
    for (let y = 20; y < 40; y++) for (let x = 0; x < W; x++) mask[y * W + x] = 1

    const entranceA = { x: 50, y: 22, kind: 'landmark' as const }
    const entranceB = { x: 53, y: 22, kind: 'landmark' as const } // 3px 차이 — MERGE_RADIUS_PX(6px) 이내
    const { nodes } = generatePathNodes(mask, W, H, [entranceA, entranceB])

    const landmarkNodes = nodes.filter((n) => n.type === 'landmark')
    expect(landmarkNodes.length).toBe(2)
  })
})

describe('generatePathNodes corner crossing', () => {
  it('adds a cross edge at a narrow L-turn corner, sourced from the concave (wall-end) side only', () => {
    const W = 80
    const H = 80
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    // 세로 복도(폭 10) + 가로 복도(폭 10)가 만나 L자를 이루는, 안쪽 모서리가 좁은 통로
    rect(0, 0, 10, 60)
    rect(0, 50, 60, 60)

    const { nodes, edges } = generatePathNodes(mask, W, H, [])

    const crossEdges = edges.filter((e) => e.type === 'cross')
    expect(crossEdges.length).toBeGreaterThan(0)

    // cross 엣지의 코너 쪽 끝은 반드시 concave(벽 끝)여야 한다 — 볼록 코너에서 시작하면 안 된다.
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const e of crossEdges) {
      const a = byId.get(e.a)
      const b = byId.get(e.b)
      const cornerEnd = a?.type === 'corner' ? a : b?.type === 'corner' ? b : null
      if (cornerEnd) expect(cornerEnd.concave).toBe(true)
    }
    const touchesConcaveCorner = crossEdges.some((e) => {
      const a = byId.get(e.a)
      const b = byId.get(e.b)
      return (a?.type === 'corner' && a.concave) || (b?.type === 'corner' && b.concave)
    })
    expect(touchesConcaveCorner).toBe(true)
  })

  it('does not add a cross edge sourced from a plain convex corner (no wall-end nearby)', () => {
    // 정사각형 방 하나 — 네 모서리는 전부 볼록(convex)이고 concave인 지점이 하나도 없다.
    // 볼록 코너에서 건너기가 생기면 안 된다(맞은편 벽까지의 거리가 짧아도).
    const W = 60
    const H = 60
    const mask = new Uint8Array(W * H)
    for (let y = 5; y < 55; y++) for (let x = 5; x < 55; x++) mask[y * W + x] = 1

    const { nodes, edges } = generatePathNodes(mask, W, H, [])
    const concaveCorners = nodes.filter((n) => n.type === 'corner' && n.concave)
    expect(concaveCorners.length).toBe(0) // 볼록 사각형이라 concave 코너가 없는지 먼저 확인

    const crossEdges = edges.filter((e) => e.type === 'cross')
    expect(crossEdges.length).toBe(0)
  })

  it('does not add a cross edge across a wide open room', () => {
    const SIZE = 300 // 변이 기본 crossingMaxPx(240px)보다 넓은 정사각형 — 모든 코너의 맞은편이 240px보다 멀다
    const mask = new Uint8Array(SIZE * SIZE)
    for (let y = 5; y < SIZE - 5; y++) for (let x = 5; x < SIZE - 5; x++) mask[y * SIZE + x] = 1

    const { edges } = generatePathNodes(mask, SIZE, SIZE, [])
    const crossEdges = edges.filter((e) => e.type === 'cross')
    expect(crossEdges.length).toBe(0)
  })

  it('finds the true across-the-corridor crossing at a jog in the wall (옆방 배치가 어긋나 생기는 턱)', () => {
    // 메인 복도(폭 10, y[40,50))에 x[100,110) 구간만 위로 살짝 넓어지는 턱이 있다 —
    // 옆방이 안쪽/바깥쪽으로 어긋나게 배치돼 복도 벽에 짧은 요철이 생기는 실제 사례를 흉내낸 것.
    // 턱이 시작되는 코너(100,40)에서 "나가는" segment은 턱 자체(위로 짧게 10px)라, 그 법선만 쓰면
    // 복도를 가로지르는 게 아니라 복도를 따라 쭉 나가버려(200px) 좁은 횡단거리에서 걸러지고 만다.
    // "들어오는" segment(메인 복도 벽)의 법선까지 같이 시도해야 복도 폭만큼의 진짜 횡단(10px)을 찾는다.
    const W = 300
    const H = 80
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(0, 40, W, 50) // 메인 복도
    rect(100, 30, 110, 50) // 벽의 짧은 턱(요철)

    // 실제 사용자 설정처럼 횡단 가능 최대 거리를 짧게 둬도(60px) 진짜 복도 폭(10px)짜리 엣지는 살아남아야 한다.
    const { nodes, edges } = generatePathNodes(mask, W, H, [], 60)
    const cornerAtJog = nodes.find((n) => n.type === 'corner' && n.x === 100 && n.y === 40)
    expect(cornerAtJog).toBeTruthy()

    const byId = new Map(nodes.map((n) => [n.id, n]))
    const hasNarrowCrossing = edges.some((e) => {
      if (e.type !== 'cross' || (e.a !== cornerAtJog!.id && e.b !== cornerAtJog!.id)) return false
      const other = byId.get(e.a === cornerAtJog!.id ? e.b : e.a)!
      return Math.hypot(cornerAtJog!.x - other.x, cornerAtJog!.y - other.y) <= 15
    })
    expect(hasNarrowCrossing).toBe(true)
  })

  it('every cross edge is exactly horizontal or vertical, never diagonal (좌우상하 90도 외엔 절대 금지)', () => {
    // L턴 코너 + 방 안쪽(통행 불가)에 찍힌 목적지를 한 번에 섞어서, corner-발 건너기와 entrance-발
    // 건너기 둘 다 사선으로 새지 않는지 같이 확인한다 — 예전엔 맞은편 지점을 경계 폴리라인에 다시
    // 투영(nearestPointOnLoop)하면서 축에서 살짝 벗어나 사선처럼 보이는 문제가 있었다.
    const W = 200
    const H = 200
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(0, 0, 10, 150) // 세로 복도
    rect(0, 140, 150, 150) // 가로 복도(L턴)
    rect(60, 60, 100, 100) // 통행영역과 안 이어진 방(코너 트레이싱을 복잡하게 만드는 별도 덩어리)

    const entrance = { x: 80, y: 80, kind: 'landmark' as const } // 방 안쪽, 통행 불가 지점
    const { nodes, edges } = generatePathNodes(mask, W, H, [entrance])
    const byId = new Map(nodes.map((n) => [n.id, n]))

    const crossEdges = edges.filter((e) => e.type === 'cross')
    expect(crossEdges.length).toBeGreaterThan(0)
    for (const e of crossEdges) {
      const a = byId.get(e.a)!
      const b = byId.get(e.b)!
      const isAxisAligned = a.x === b.x || a.y === b.y
      expect(isAxisAligned).toBe(true)
    }
  })

  it('skips a corner-crossing direction that just hugs an immediately adjacent wall (side clearance too small)', () => {
    // 같은 L턴 코너(10,50): 아래로 9px짜리 진짜 복도 폭 횡단은 남아야 하고, 그 옆(위/아래로 벽이 바로
    // 붙어있는) 방향으로 복도를 따라 쭉 나가는(오른쪽) 건 벽을 타면 바로 닿는 곳이라 없어야 한다.
    const W = 80
    const H = 80
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(0, 0, 10, 60)
    rect(0, 50, 60, 60)

    const { nodes, edges } = generatePathNodes(mask, W, H, [])
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const corner = nodes.find((n) => n.type === 'corner' && n.x === 10 && n.y === 50)
    expect(corner).toBeTruthy()

    const crossFromCorner = edges.filter((e) => e.type === 'cross' && (e.a === corner!.id || e.b === corner!.id))
    const hasNarrowDownCrossing = crossFromCorner.some((e) => {
      const other = byId.get(e.a === corner!.id ? e.b : e.a)!
      return other.x === corner!.x && other.y > corner!.y
    })
    expect(hasNarrowDownCrossing).toBe(true)

    const hasWallHuggingSidewaysCrossing = crossFromCorner.some((e) => {
      const other = byId.get(e.a === corner!.id ? e.b : e.a)!
      return other.y === corner!.y && other.x !== corner!.x
    })
    expect(hasWallHuggingSidewaysCrossing).toBe(false)
  })

  it('marks cross edges as directed (one-way), and wall edges as not', () => {
    const W = 80
    const H = 80
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(0, 0, 10, 60)
    rect(0, 50, 60, 60)

    const { edges } = generatePathNodes(mask, W, H, [])
    const crossEdges = edges.filter((e) => e.type === 'cross')
    const wallEdges = edges.filter((e) => e.type === 'wall')
    expect(crossEdges.length).toBeGreaterThan(0)
    expect(crossEdges.every((e) => e.directed === true)).toBe(true)
    expect(wallEdges.every((e) => !e.directed)).toBe(true)
  })
})
