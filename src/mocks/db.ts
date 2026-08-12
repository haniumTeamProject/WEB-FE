import type { Admin, Beacon, Building, Connector, Floor, Floorplan, Landmark } from '@/types/domain'

// 샘플 설계도 (자동추출된 것으로 간주) — 지도 검수 에디터 데모용 배경
const sampleFloorplan =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560">
      <rect width="900" height="560" fill="#ffffff"/>
      <rect x="40" y="40" width="820" height="480" fill="none" stroke="#6b7280" stroke-width="6"/>
      <line x1="320" y1="40" x2="320" y2="300" stroke="#6b7280" stroke-width="6"/>
      <line x1="320" y1="300" x2="860" y2="300" stroke="#6b7280" stroke-width="6"/>
      <rect x="620" y="40" width="130" height="120" fill="none" stroke="#6b7280" stroke-width="4"/>
      <text x="648" y="110" fill="#aeb6c4" font-size="20">ELV</text>
    </svg>`,
  )

// 샘플 기관 공문 (승인 관리 화면에서 "공문 보기" 클릭 시 열람용 데모 문서)
const sampleOfficialDoc =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
      <rect width="600" height="800" fill="#ffffff" stroke="#d1d5db"/>
      <text x="60" y="100" font-size="28" fill="#1f2937">공 문</text>
      <text x="60" y="160" font-size="16" fill="#4b5563">수신: 한이음 프로젝트팀</text>
      <text x="60" y="190" font-size="16" fill="#4b5563">제목: 관리자 계정 발급 요청</text>
      <circle cx="480" cy="700" r="50" fill="none" stroke="#dc2626" stroke-width="3"/>
      <text x="450" y="705" font-size="14" fill="#dc2626">직인</text>
    </svg>`,
  )

// 개발용 인메모리 DB (새로고침 시 초기화). 실제 API 붙기 전까지 CRUD 대상.
export const db: {
  buildings: Building[]
  floors: Record<string, Floor[]>
  connectors: Record<string, Connector[]>
  floorplans: Record<string, Floorplan>
  masks: Record<string, unknown>
  beacons: Record<string, Beacon[]>
  landmarks: Record<string, Landmark[]>
  admins: Admin[]
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
  connectors: {
    suwon_ict: [
      { id: 'conn_elv1', buildingId: 'suwon_ict', name: '엘리베이터 1호기', type: 'elevator', floors: [4] },
    ],
  },
  floorplans: {
    'suwon_ict-4': { floorId: 'suwon_ict-4', imageUrl: sampleFloorplan, extracted: true },
  },
  masks: {},
  // 실제 도면으로 경로노드 테스트를 하는 층이라 데모 비콘/랜드마크를 심어두지 않는다 —
  // 남겨두면 사용자가 아무것도 등록하지 않아도 경로노드 생성 시 "입구"로 잡혀 혼란을 준다.
  beacons: {
    'suwon_ict-4': [],
  },
  landmarks: {
    'suwon_ict-4': [],
  },
  admins: [
    {
      id: 'admin_super',
      email: 'super@haniumteam.org',
      name: '슈퍼관리자',
      org: '한이음 프로젝트팀',
      building: '전체',
      status: 'active',
      role: 'super_admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'admin_pending_1',
      email: 'kim@suwon.ac.kr',
      name: '김민지',
      org: '수원대학교 ICT융합대학',
      building: 'ICT융합대학 4층',
      status: 'pending',
      role: 'admin',
      officialDocUrl: sampleOfficialDoc,
      createdAt: '2026-08-09T09:00:00.000Z',
    },
    {
      id: 'admin_pending_2',
      email: 'lee@ku.ac.kr',
      name: '이준호',
      org: '고려대 세종캠퍼스',
      building: '경상대학',
      status: 'pending',
      role: 'admin',
      officialDocUrl: sampleOfficialDoc,
      createdAt: '2026-08-10T14:30:00.000Z',
    },
  ],
}

let seq = 100
export function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq}`
}
