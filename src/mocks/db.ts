import type { Beacon, Building, Connector, Floor, Floorplan, Landmark } from '@/types/domain'

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

// 개발용 인메모리 DB (새로고침 시 초기화). 실제 API 붙기 전까지 CRUD 대상.
export const db: {
  buildings: Building[]
  floors: Record<string, Floor[]>
  connectors: Record<string, Connector[]>
  floorplans: Record<string, Floorplan>
  masks: Record<string, unknown>
  beacons: Record<string, Beacon[]>
  landmarks: Record<string, Landmark[]>
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
  beacons: {
    'suwon_ict-4': [
      { id: 'bc_anchor', floorId: 'suwon_ict-4', name: '정문 앵커', mac: '44:B1:76:1A:13:B2', major: 104, minor: 1, type: 'anchor', isAnchor: true, x: 130, y: 470 },
      { id: 'bc_cp1', floorId: 'suwon_ict-4', name: '중앙 갈림길', mac: 'E5:13:A2:92:71:00', major: 104, minor: 10, type: 'checkpoint', isAnchor: false, x: 430, y: 340 },
      { id: 'bc_elv', floorId: 'suwon_ict-4', name: '엘베 앞', mac: 'C2:B6:13:0E:9C:BF', major: 104, minor: 20, type: 'connector', connectorId: 'conn_elv1', isAnchor: false, x: 690, y: 110 },
    ],
  },
  landmarks: {
    'suwon_ict-4': [
      { id: 'lm_406', floorId: 'suwon_ict-4', name: '406호', type: 'room', x: 250, y: 180 },
      { id: 'lm_wc', floorId: 'suwon_ict-4', name: '화장실(남)', type: 'restroom', x: 520, y: 440 },
    ],
  },
}

let seq = 100
export function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq}`
}
