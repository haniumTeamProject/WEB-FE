import type { Building, Floor } from '@/types/domain'

// 개발용 가짜 데이터. 실제 API 붙기 전까지 화면 개발에 사용.
export const buildings: Building[] = [
  {
    id: 'suwon_ict',
    code: 'suwon_ict',
    name: '수원대학교 / ICT융합대학',
    address: '경기도 화성시 봉담읍 와우안길 17',
    floorCount: 1,
    favorite: true,
  },
  { id: 'ku_gyeongsang', code: 'ku_gyeongsang', name: '고려대 세종캠퍼스 / 경상대학', floorCount: 3 },
  { id: 'bundang_cha', code: 'bundang_cha', name: '분당차병원(본관)', floorCount: 5, favorite: true },
]

export const floors: Record<string, Floor[]> = {
  suwon_ict: [{ id: 'suwon_ict-4', buildingId: 'suwon_ict', floor: 4, major: 104, status: 'ready' }],
}
