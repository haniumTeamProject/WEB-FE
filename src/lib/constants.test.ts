import { describe, it, expect } from 'vitest'
import { floorStatusBadge } from './constants'

describe('floorStatusBadge', () => {
  it('아는 상태값은 해당 뱃지를 돌려준다', () => {
    expect(floorStatusBadge('ready').label).toBe('안내 가능')
    expect(floorStatusBadge('review_needed').label).toBe('검수 필요')
  })

  it('모르는 상태·undefined·빈값은 회색 — 뱃지로 안전하게 떨어진다(크래시 방지)', () => {
    // 백엔드가 프론트가 모르는 새 status를 내려줘도 .fg/.label 접근에서 안 깨져야 한다.
    expect(floorStatusBadge('some_new_backend_status').label).toBe('—')
    expect(floorStatusBadge(undefined).label).toBe('—')
    expect(floorStatusBadge('').label).toBe('—')
    // 색도 반드시 존재(undefined 접근 크래시 없음)
    expect(floorStatusBadge('unknown').fg).toBeTruthy()
  })
})
