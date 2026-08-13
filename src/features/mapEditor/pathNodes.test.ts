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

    const facing = nodes.find((n) => n.type === 'facing')
    expect(facing).toBeTruthy()
    // 진짜 반대편(복도 아래쪽 벽, y≈40)이어야 한다 — 같은 쪽(문턱 옆, y<20)이면 안 됨.
    expect(facing!.y).toBeGreaterThan(35)
  })
})
