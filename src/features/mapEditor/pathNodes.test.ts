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

  it('keeps both up and down facing points for a destination sitting inside a narrow corridor (does not merge them into one)', () => {
    // 실제 사례: 목적지가 좁은 복도(폭이 MERGE_RADIUS_PX(6px)보다 살짝 큰 정도) 안에 위치하면, 위쪽
    // 벽까지의 맞은편 지점과 아래쪽 벽까지의 맞은편 지점이 서로 6px 이내로 가까워진다. 이 둘은 서로
    // 다른 벽이라 절대 같은 지점일 수 없는데도, 예전 코드는 거리만 보고 하나로 합쳐버려서 위/아래 중
    // 한쪽 건너기 화살표가 통째로 사라지는 버그가 있었다.
    const W = 120
    const H = 24
    const mask = new Uint8Array(W * H)
    for (let y = 10; y < 14; y++) for (let x = 0; x < W; x++) mask[y * W + x] = 1

    const entrance = { x: 60, y: 11, kind: 'landmark' as const }
    const { nodes, edges } = generatePathNodes(mask, W, H, [entrance])

    const facings = nodes.filter((n) => n.type === 'facing' && n.pairKind === 'landmark')
    expect(facings.some((f) => f.x === 60 && f.y < 11)).toBe(true) // 위쪽 벽 맞은편
    expect(facings.some((f) => f.x === 60 && f.y > 11)).toBe(true) // 아래쪽 벽 맞은편

    const verticalCrossEdges = edges.filter((e) => {
      if (e.type !== 'cross') return false
      const byId = new Map(nodes.map((n) => [n.id, n]))
      const a = byId.get(e.a)!
      const b = byId.get(e.b)!
      return a.x === b.x && a.x === 60
    })
    expect(verticalCrossEdges.length).toBe(2) // 위/아래 각각 하나씩, 총 2개
  })

  it('skips the redundant left/right crossings when an entrance sits along a straight narrow corridor (does not hug the same wall it is on)', () => {
    // 실제 사례: 입구가 일직선 복도 위에 있으면, 위/아래(복도 폭을 가로지르는 진짜 횡단)뿐 아니라
    // 좌/우(복도를 따라 쭉 나가는 방향, 벽을 타면 바로 닿는 곳)까지 전부 유효한 후보로 잡히면서 같은
    // 일직선 벽에 불필요하게 여러 방향의 화살표가 생기는 문제가 있었다. 코너처럼 입구에도 허깅 필터를
    // 적용해서 좌/우는 걸러내고, 위/아래(서로 다른 벽이라 하나로 합쳐지지 않음)만 남겨야 한다.
    const W = 200
    const H = 30
    const mask = new Uint8Array(W * H)
    for (let y = 10; y < 20; y++) for (let x = 0; x < W; x++) mask[y * W + x] = 1

    const entrance = { x: 100, y: 15, kind: 'landmark' as const }
    const { nodes, edges } = generatePathNodes(mask, W, H, [entrance])
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const landmark = nodes.find((n) => n.type === 'landmark')!
    const crossFromEntrance = edges.filter((e) => e.type === 'cross' && (e.a === landmark.id || e.b === landmark.id))

    expect(crossFromEntrance.length).toBe(2)
    for (const e of crossFromEntrance) {
      const other = byId.get(e.a === landmark.id ? e.b : e.a)!
      expect(other.x).toBe(landmark.x) // 좌우(길이 방향)는 없어야 하고, 위/아래(폭 방향)만 남아야 함
    }
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

  it('keeps every crossing direction whose length is similar to the shortest, drops only the much-longer wall-hugging one', () => {
    // 같은 L턴 코너(10,50)에서는 아래로 9px(세로 복도 폭), 왼쪽으로 10px(가로 복도 폭), 오른쪽으로는
    // 복도를 따라 쭉 나가는(벽을 타면 바로 닿는, 훨씬 긴) 방향까지 여러 후보가 동시에 유효하다.
    // 9px와 10px는 서로 비슷한 길이(SIMILAR_LENGTH_RATIO=1.5배 이내)라 둘 다 남아야 한다 — 가장
    // 짧은 것 하나만 남기면 실제로 둘 다 필요한 경우까지 하나가 사라진다(실제 발견된 문제). 반대로
    // 오른쪽(복도를 따라 쭉 나가는, 벽을 타면 바로 닿는 곳)은 없어야 한다.
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
    expect(crossFromCorner.length).toBe(2)
    const others = crossFromCorner.map((e) => byId.get(e.a === corner!.id ? e.b : e.a)!)
    expect(others.some((o) => o.x === corner!.x && o.y > corner!.y)).toBe(true) // 아래(9px)
    expect(others.some((o) => o.y === corner!.y && o.x < corner!.x)).toBe(true) // 왼쪽(10px)
    expect(others.some((o) => o.y === corner!.y && o.x > corner!.x)).toBe(false) // 오른쪽(허깅, 없어야 함)
  })

  it('does not treat an entire narrow connecting corridor as a single crossing (side clearance narrows only after the corner, not at it)', () => {
    // 실제 사례: 넓은 두 홀을 잇는 좁은 복도(폭 10, 길이 80)의 양 끝 코너에서, 코너 지점 자체는 아직
    // 넓은 홀 경계라 옆 여유가 충분해 보이지만 한 걸음만 복도 쪽으로 들어가면 바로 좁아진다. 코너
    // 지점만 검사하던 예전 코드는 이걸 못 걸러내서 복도 전체 길이(80px)를 "횡단"으로 잘못 안내했다.
    const W = 100
    const H = 100
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(0, 0, 100, 10) // 위쪽 홀
    rect(0, 90, 100, 100) // 아래쪽 홀
    rect(40, 10, 50, 90) // 둘을 잇는 좁은 복도(폭 10, 길이 80)

    const { nodes, edges } = generatePathNodes(mask, W, H, [])
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const crossEdges = edges.filter((e) => e.type === 'cross')
    // 복도 길이(80px)에 가까운 긴 세로 건너기가 있으면 안 된다 — 있다면 복도를 통째로 "건너기"로
    // 잘못 안내하는 것이다. 양 끝 홀 진입부의 짧은(10px 안팎) 가로 건너기만 남아야 한다.
    const hasCorridorLengthCrossing = crossEdges.some((e) => {
      const a = byId.get(e.a)!
      const b = byId.get(e.b)!
      return a.x === b.x && Math.hypot(a.x - b.x, a.y - b.y) > 30
    })
    expect(hasCorridorLengthCrossing).toBe(false)
  })

  it('does not let a crossing that only briefly grazes a short pillar get filtered out entirely (only a truly hugged wall should be filtered)', () => {
    // 실제 사례: 코너에서 가장 가까운(=선택될) 방향의 경로 중간에 짧은 기둥이 살짝 튀어나와 있어 그
    // 지점 한 곳만 순간적으로 옆 여유가 좁아진다. 경로 위 단 한 지점이라도 좁으면 무조건 걸러내던
    // 버전은 이런 정상적인 횡단까지 통째로 없애버렸다 — 경로 전체에서 "계속" 같은 벽을 타고 걸을 수
    // 있는 경우에만 걸러야 한다. 같은 L턴 코너(10,50)의 가장 가까운 방향(아래, 9px)에 1px짜리 기둥
    // 하나만 살짝 걸쳐 놓는다(9칸 중 1칸=11%, 85% 문턱에는 한참 못 미침).
    const W = 80
    const H = 80
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(0, 0, 10, 60)
    rect(0, 50, 60, 60)
    // 세로 복도 오른쪽 벽(x=9)에서 아주 살짝 튀어나온 기둥 — (10,55) 한 지점만 스친다.
    mask[55 * W + 9] = 0

    const { nodes, edges } = generatePathNodes(mask, W, H, [])
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const corner = nodes.find((n) => n.type === 'corner' && n.x === 10 && n.y === 50)
    expect(corner).toBeTruthy()
    const crossFromCorner = edges.filter((e) => e.type === 'cross' && (e.a === corner!.id || e.b === corner!.id))
    const others = crossFromCorner.map((e) => byId.get(e.a === corner!.id ? e.b : e.a)!)
    expect(others.some((o) => o.x === corner!.x && o.y > corner!.y)).toBe(true) // 아래(9px, 기둥이 스치는 방향)
  })

  it('clears pairKind on a facing point that turns out to also be a corner facing point (should render purple, not the entrance color)', () => {
    // 실제 사례: 입구가 쏜 맞은편 지점이, 우연히 어떤 concave 코너가 쏜 맞은편 지점과 같은 위치(축까지
    // 일치)에 겹칠 수 있다. 이 지점은 이제 "코너의 맞은편"이기도 하므로 특정 입구 하나의 색(pairKind)
    // 으로 칠하면 안 된다 — pairKind가 지워져서 코너 맞은편처럼(화면에서는 보라색으로) 표시돼야 한다.
    const W = 100
    const H = 100
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number, val: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = val
    }
    rect(0, 0, 100, 100, 1)
    rect(30, 0, 40, 4, 0) // 위쪽 벽에서 살짝 파낸 노치 — concave 코너 2개를 만든다

    const entrance = { x: 30, y: 90, kind: 'landmark' as const }
    const { nodes, edges } = generatePathNodes(mask, W, H, [entrance])
    const byId = new Map(nodes.map((n) => [n.id, n]))

    const sharedFacing = nodes.find((n) => {
      if (n.type !== 'facing') return false
      const connectedTypes = edges
        .filter((e) => e.type === 'cross' && (e.a === n.id || e.b === n.id))
        .map((e) => byId.get(e.a === n.id ? e.b : e.a)!.type)
      return connectedTypes.includes('corner') && connectedTypes.includes('landmark')
    })
    expect(sharedFacing).toBeTruthy()
    expect(sharedFacing!.pairKind).toBeUndefined()
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

describe('generatePathNodes wall boundary tracing', () => {
  it('does not splice a destination deep inside a room into the wall boundary trace as if it sat on the wall (would draw a diagonal wall line through the room)', () => {
    // 실제 사례: 목적지가 방 안쪽 깊숙이 찍혀 있으면, 정렬 순서(segmentIndex/t로 벽 경계선에 투영한
    // 위치) 기준으로 마치 경계 위에 있는 것처럼 벽선 트레이싱 순서에 그대로 끼어들었다. 그 결과
    // 목적지의 실제 좌표(투영 위치가 아니라 원래 찍힌 위치)와 이웃 경계점 사이를 잇는 '벽' 엣지가
    // 방을 대각선으로 가로지르며 그려지는 버그가 있었다. 경계에서 먼 점은 메인 벽 루프에서 빼고,
    // 가장 가까운 경계점 하나에만 짧게 연결해야 한다(그 연결선 자체는 대각선이어도 괜찮다 —
    // 열린 방 안을 가로지르는 것뿐이라 안내상 문제없다. 문제는 그게 두 '경계' 점 사이에 끼어드는 것).
    const W = 200
    const H = 100
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(10, 10, 190, 90) // 큰 방 하나

    // 왼쪽 위 코너(10,10)와 정렬 순서상 가까운 위치로 투영되지만, 실제 좌표는 방 안쪽 깊숙한(180,20)
    const entrance = { x: 180, y: 20, kind: 'landmark' as const }
    const { nodes, edges } = generatePathNodes(mask, W, H, [entrance])
    const byId = new Map(nodes.map((n) => [n.id, n]))

    // 경계(코너·맞은편) 점들끼리 잇는 '벽' 엣지는 항상 거의 축에 맞아야 한다(rectilinear 마스크이므로).
    // 목적지 자신의 단일 연결선(목적지↔가장 가까운 경계점)은 대각선이어도 정상이라 이 검사에서 뺀다.
    const boundaryWallEdges = edges.filter((e) => {
      if (e.type !== 'wall') return false
      const a = byId.get(e.a)!
      const b = byId.get(e.b)!
      return a.type !== 'landmark' && a.type !== 'connector' && b.type !== 'landmark' && b.type !== 'connector'
    })
    expect(boundaryWallEdges.length).toBeGreaterThan(0)
    for (const e of boundaryWallEdges) {
      const a = byId.get(e.a)!
      const b = byId.get(e.b)!
      const dx = Math.abs(a.x - b.x)
      const dy = Math.abs(a.y - b.y)
      expect(Math.min(dx, dy)).toBeLessThanOrEqual(3)
    }
  })
})
