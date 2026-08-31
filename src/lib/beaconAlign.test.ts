import { describe, expect, it } from 'vitest'
import { findBeaconGuides } from './beaconAlign'

describe('findBeaconGuides — 축별 최근접 보조선', () => {
  it('x가 임계값 내 가까우면 snapX와 세로 보조선을 준다', () => {
    const r = findBeaconGuides(103, 50, [{ x: 100, y: 200 }])
    expect(r.snapX).toBe(100)
    expect(r.snapY).toBeNull()
    // 세로선: 스냅 대상 x(100)에서 그 비콘(y=200)부터 현재 지점(y=50)까지
    expect(r.xGuide).toEqual({ x1: 100, y1: 200, x2: 100, y2: 50 })
    expect(r.yGuide).toBeNull()
  })

  it('y가 임계값 내 가까우면 snapY와 가로 보조선을 준다', () => {
    const r = findBeaconGuides(50, 204, [{ x: 200, y: 200 }])
    expect(r.snapY).toBe(200)
    expect(r.snapX).toBeNull()
    expect(r.yGuide).toEqual({ x1: 200, y1: 200, x2: 50, y2: 200 })
    expect(r.xGuide).toBeNull()
  })

  it('양축 다 임계값 내면 둘 다 스냅하고 십자 보조선을 준다(행렬 동시)', () => {
    // x는 첫 비콘, y는 둘째 비콘 — 서로 다른 비콘일 수 있다
    const r = findBeaconGuides(50, 50, [
      { x: 52, y: 999 },
      { x: 999, y: 47 },
    ], 8)
    expect(r.snapX).toBe(52)
    expect(r.snapY).toBe(47)
    expect(r.xGuide).not.toBeNull()
    expect(r.yGuide).not.toBeNull()
    // 십자는 스냅된 지점(52,47)에서 만난다
    expect(r.xGuide!.x1).toBe(52)
    expect(r.xGuide!.y2).toBe(47)
    expect(r.yGuide!.y1).toBe(47)
    expect(r.yGuide!.x2).toBe(52)
  })

  it('같은 축에 여러 비콘이 있어도 최근접 하나에만 보조선을 그린다', () => {
    const r = findBeaconGuides(100, 50, [
      { x: 98, y: 200 }, // 2px
      { x: 103, y: 300 }, // 3px — 더 멀다
    ])
    expect(r.snapX).toBe(98)
    expect(r.xGuide).toEqual({ x1: 98, y1: 200, x2: 98, y2: 50 })
  })

  it('임계값을 넘으면 스냅·보조선 없음', () => {
    const r = findBeaconGuides(50, 50, [{ x: 100, y: 100 }])
    expect(r.snapX).toBeNull()
    expect(r.snapY).toBeNull()
    expect(r.xGuide).toBeNull()
    expect(r.yGuide).toBeNull()
  })

  it('기본 임계값은 12px', () => {
    const r = findBeaconGuides(100, 50, [{ x: 110, y: 200 }]) // 10px 차이
    expect(r.snapX).toBe(110)
  })

  it('비콘이 없으면 아무것도 스냅하지 않는다', () => {
    const r = findBeaconGuides(100, 50, [])
    expect(r).toEqual({ snapX: null, snapY: null, xGuide: null, yGuide: null })
  })
})
