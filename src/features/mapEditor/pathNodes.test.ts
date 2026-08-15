import { describe, expect, it } from 'vitest'
import { generatePathNodes } from './pathNodes'

describe('generatePathNodes crossing normal', () => {
  it('finds the facing point across the corridor, not beside a doorway notch merged into the mask', () => {
    const W = 200
    const H = 60
    const mask = new Uint8Array(W * H)
    // 복도: y in [20,40)
    for (let y = 20; y < 40; y++) for (let x = 0; x < W; x++) mask[y * W + x] = 1
    // 복도 위쪽에 붙은 방(예: 문턱): x in [80,120), y in [0,20) — 실제 사례처럼 방이 마스크에 같이 칠해진 상황
    for (let y = 0; y < 20; y++) for (let x = 80; x < 120; x++) mask[y * W + x] = 1

    // 방의 모서리(방 왼쪽벽×윗벽이 만나는 지점) 바로 안쪽 — 원본 픽셀 경계는 여기서 꺾여서
    // 접선을 좁은 창으로 추정하면 대각선처럼 잘못 나오기 쉬운 지점이다.
    const entrance = { x: 82, y: 2, kind: 'landmark' as const }
    const { nodes } = generatePathNodes(mask, W, H, [entrance])

    // 코너끼리도 마주보는 지점을 만들다 보니 'facing' 타입이 여러 개 나올 수 있다 — 입구(landmark) 짝인
    // 것만 골라야 이 테스트가 검증하려는 "입구의 맞은편"과 정확히 비교된다.
    const facing = nodes.find((n) => n.type === 'facing' && n.pairKind === 'landmark')
    expect(facing).toBeTruthy()
    // 진짜 반대편(복도 아래쪽 벽, y≈40)이어야 한다 — 같은 쪽(문턱 옆, y<20)이면 안 됨.
    expect(facing!.y).toBeGreaterThan(35)
  })

  it('does not place the facing point on the same threshold line when the entrance sits near a doorway jamb', () => {
    const W = 200
    const H = 60
    const mask = new Uint8Array(W * H)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1
    }
    rect(10, 0, 150, 30) // 방(410) 내부
    rect(0, 35, 200, 55) // 복도(방과 5px 벽으로 분리)
    rect(20, 30, 80, 35) // 방↔복도를 잇는 문(폭 60px, 왼쪽 기둥과 반대쪽 기둥이 멀리 떨어지도록 넓게 둠)

    // 문틀 왼쪽 기둥(20,30)~(20,35) 바로 옆 — 유클리드 거리로는 이 짧은 기둥이 방의 다른 어떤 벽보다
    // 가까워서, 예전 로직은 여기 snap된 뒤 그 기둥의 접선(문틀을 따라 위아래로 짧게 이어지는 방향이
    // 아니라, 그 기둥과 수직인 문턱을 따라가는 방향)으로 법선을 잡아 맞은편 지점을 문틀 반대쪽이 아닌
    // 같은 문턱 선(y=30) 위 먼 지점에 찍었다.
    const entrance = { x: 22, y: 28, kind: 'landmark' as const }
    const { nodes } = generatePathNodes(mask, W, H, [entrance])

    const landmark = nodes.find((n) => n.type === 'landmark')
    // 코너끼리도 마주보는 지점을 만들다 보니 'facing' 타입이 여러 개 나올 수 있다 — 입구(landmark) 짝인
    // 것만 골라야 이 테스트가 검증하려는 "입구의 맞은편"과 정확히 비교된다.
    const facing = nodes.find((n) => n.type === 'facing' && n.pairKind === 'landmark')
    expect(landmark).toBeTruthy()
    expect(facing).toBeTruthy()
    // 예전 로직은 문틀을 따라 미끄러져 반대쪽 문틀 기둥(x≈80) 근처에서 멈췄다 — 방을 가로질러
    // 진짜 반대편 벽(x≈150)까지 가야 한다.
    expect(facing!.x).toBeGreaterThan(100)
  })
})

describe('generatePathNodes corner crossing', () => {
  it('adds a cross edge at a narrow L-turn corner (both concave and convex sides)', () => {
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

    // cross 엣지 하나는 원래 코너였던 노드(오목이든 볼록이든)에서 시작해야 한다
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const touchesCorner = crossEdges.some((e) => {
      const a = byId.get(e.a)
      const b = byId.get(e.b)
      return a?.type === 'corner' || b?.type === 'corner'
    })
    expect(touchesCorner).toBe(true)
  })

  it('does not add a cross edge across a wide open room', () => {
    const SIZE = 300 // 변이 기본 crossingMaxPx(240px)보다 넓은 정사각형 — 모든 코너의 맞은편이 240px보다 멀다
    const mask = new Uint8Array(SIZE * SIZE)
    for (let y = 5; y < SIZE - 5; y++) for (let x = 5; x < SIZE - 5; x++) mask[y * SIZE + x] = 1

    const { edges } = generatePathNodes(mask, SIZE, SIZE, [])
    const crossEdges = edges.filter((e) => e.type === 'cross')
    expect(crossEdges.length).toBe(0)
  })
})
