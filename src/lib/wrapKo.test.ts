import { describe, it, expect } from 'vitest'
import { wrapKo } from './wrapKo'

const NBSP = String.fromCharCode(0x00a0)

describe('wrapKo', () => {
  it('구절 내부 띄어쓰기는 NBSP로 묶고, 쉼표·마침표 뒤에만 일반 공백을 둔다', () => {
    expect(wrapKo('A를 하고, B를 합니다.')).toBe(`A를${NBSP}하고, B를${NBSP}합니다.`)
  })

  it('구두점이 없으면 통째로 NBSP → 줄바꿈 지점 없음(넘치면 음절 fallback)', () => {
    expect(wrapKo('축척을 먼저 설정하세요')).toBe(`축척을${NBSP}먼저${NBSP}설정하세요`)
  })

  it('구두점이 여러 번이면 각 지점에서 끊긴다', () => {
    expect(wrapKo('가. 나. 다')).toBe('가. 나. 다')
  })
})
