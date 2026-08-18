import { beforeEach, describe, expect, it } from 'vitest'
import { loadBeaconDraft, saveBeaconDraft } from './beaconDraftStorage'

describe('beaconDraftStorage', () => {
  beforeEach(() => sessionStorage.clear())

  it('저장한 초안을 그대로 복원한다', () => {
    const draft = { name: '중앙 갈림길', mac: 'AA:BB', minor: '10', pendingPos: { x: 100, y: 200 } }
    saveBeaconDraft('floor-1', draft)
    expect(loadBeaconDraft('floor-1')).toEqual(draft)
  })

  it('층별로 분리 보관한다', () => {
    saveBeaconDraft('floor-1', { name: 'A', mac: '', minor: '', pendingPos: null })
    saveBeaconDraft('floor-2', { name: 'B', mac: '', minor: '', pendingPos: null })
    expect(loadBeaconDraft('floor-1')?.name).toBe('A')
    expect(loadBeaconDraft('floor-2')?.name).toBe('B')
  })

  it('빈 초안을 저장하면 기존 초안을 지운다(등록 성공 후 폼이 비는 경우)', () => {
    saveBeaconDraft('floor-1', { name: '임시', mac: '', minor: '', pendingPos: null })
    saveBeaconDraft('floor-1', { name: '', mac: '', minor: '', pendingPos: null })
    expect(loadBeaconDraft('floor-1')).toBeNull()
  })

  it('저장된 게 없으면 null을 돌려준다', () => {
    expect(loadBeaconDraft('floor-없음')).toBeNull()
  })

  it('손상된 값은 null로 안전하게 처리한다', () => {
    sessionStorage.setItem('beaconDraft:floor-1', '{깨진 JSON')
    expect(loadBeaconDraft('floor-1')).toBeNull()
  })
})
