import { describe, expect, it } from 'vitest'
import { findBeaconAlign } from './beaconAlign'

describe('findBeaconAlign', () => {
  it('x가 임계값 이내로 가까운 비콘이 있으면 x를 스냅한다', () => {
    const result = findBeaconAlign(103, 50, [{ x: 100, y: 200 }])
    expect(result).not.toBeNull()
    expect(result!.x).toBe(100)
    expect(result!.y).toBe(50)
  })

  it('y가 임계값 이내로 가까운 비콘이 있으면 y를 스냅한다', () => {
    const result = findBeaconAlign(50, 204, [{ x: 200, y: 200 }])
    expect(result).not.toBeNull()
    expect(result!.x).toBe(50)
    expect(result!.y).toBe(200)
  })

  it('두 축 다 임계값 이내면 더 가까운(차이가 작은) 축만 스냅한다', () => {
    const result = findBeaconAlign(102, 50, [{ x: 100, y: 51 }])
    expect(result).not.toBeNull()
    expect(result!.y).toBe(51)
    expect(result!.x).toBe(102)
  })

  it('임계값을 넘으면 스냅하지 않는다', () => {
    const result = findBeaconAlign(50, 50, [{ x: 100, y: 100 }])
    expect(result).toBeNull()
  })

  it('여러 비콘 중 가장 가까운 축을 스냅한다', () => {
    const result = findBeaconAlign(50, 50, [
      { x: 55, y: 200 },
      { x: 48, y: 200 },
    ])
    expect(result).not.toBeNull()
    expect(result!.x).toBe(48)
  })

  it('같은 축에 임계값 이내로 여러 비콘이 있으면 전부에게 가이드선을 그린다', () => {
    const result = findBeaconAlign(100, 50, [
      { x: 98, y: 200 },
      { x: 103, y: 300 },
      { x: 500, y: 500 }, // 임계값 밖 — 가이드에서 제외돼야 함
    ])
    expect(result).not.toBeNull()
    expect(result!.axis).toBe('x')
    expect(result!.guides).toHaveLength(2)
    expect(result!.guides.map((g) => g.y1).sort()).toEqual([200, 300])
  })

  it('비콘이 촘촘한 지도에서 드래그 좌표에만 가깝고 스냅 대상과는 먼 비콘은 가이드에서 제외한다', () => {
    // 드래그 지점(100)에서 둘 다 임계값(6, 여기선 프로덕션 기본값과 무관하게 명시) 이내라 예전에는 둘 다
    // 가이드가 그려졌지만, 실제 스냅 대상(97)과는 104가 7만큼 떨어져 있어 정렬선으로 보이면 안 된다.
    const result = findBeaconAlign(
      100,
      50,
      [
        { x: 97, y: 200 },
        { x: 104, y: 300 },
      ],
      6,
    )
    expect(result).not.toBeNull()
    expect(result!.axis).toBe('x')
    expect(result!.x).toBe(97)
    expect(result!.guides).toHaveLength(1)
    expect(result!.guides[0].y1).toBe(200)
    // 가이드선은 대상 좌표(스냅 x)를 기준으로 곧게 그려져야 한다(대각선으로 보이면 안 됨).
    expect(result!.guides[0].x1).toBe(97)
    expect(result!.guides[0].x2).toBe(97)
  })

  it('기본 임계값(12px)이 적용된다 — 화면 배율이 낮아도 마우스로 맞추기 쉽게 넉넉한 값', () => {
    const result = findBeaconAlign(100, 50, [{ x: 110, y: 200 }]) // 10px 차이, 명시 threshold 없이 기본값 사용
    expect(result).not.toBeNull()
    expect(result!.x).toBe(110)
  })
})
