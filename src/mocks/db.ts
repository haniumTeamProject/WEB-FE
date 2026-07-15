import type { Building, Floor } from '@/types/domain'

// 개발용 인메모리 DB (새로고침 시 초기화). 실제 API 붙기 전까지 CRUD 대상.
export const db: {
  buildings: Building[]
  floors: Record<string, Floor[]>
} = {
  buildings: [
    {
      id: 'suwon_ict',
      code: 'suwon_ict',
      name: '수원대학교 / ICT융합대학',
      address: '경기도 화성시 봉담읍 와우안길 17',
      floorCount: 1,
      favorite: true,
      status: 'ready',
    },
    {
      id: 'ku_gyeongsang',
      code: 'ku_gyeongsang',
      name: '고려대 세종캠퍼스 / 경상대학',
      floorCount: 3,
      status: 'review_needed',
    },
    {
      id: 'bundang_cha',
      code: 'bundang_cha',
      name: '분당차병원(본관)',
      floorCount: 5,
      favorite: true,
      status: 'beacon_missing',
    },
  ],
  floors: {
    suwon_ict: [{ id: 'suwon_ict-4', buildingId: 'suwon_ict', floor: 4, major: 104, status: 'ready' }],
  },
}

let seq = 100
export function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq}`
}
