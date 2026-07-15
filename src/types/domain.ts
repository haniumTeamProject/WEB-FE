// 도메인 모델 — App/API명세서.md v3.0 기준. 백엔드 확정 시 필드 맞춰 조정.

export type AdminStatus = 'pending' | 'active' | 'rejected'
export type AdminRole = 'super_admin' | 'admin'

export interface Admin {
  id: string
  email: string
  name: string
  org: string // 소속 기관
  position?: string
  phone?: string
  building?: string // 담당 건물
  status: AdminStatus
  role: AdminRole
  officialDocUrl?: string // 기관 공문(직인)
  createdAt?: string
}

export interface Building {
  id: string
  code: string // 예: suwon_ict
  name: string
  address?: string
  floorCount?: number
  favorite?: boolean
}

// 층 세팅 진행 상태 (뱃지) — 서버가 계산해 내려줌
export type FloorSetupStatus =
  | 'floorplan_missing' // 설계도 미업로드
  | 'review_needed' // 검수 필요
  | 'beacon_missing' // 비콘 미등록
  | 'connector_missing' // 연결자 결손
  | 'ready' // 안내 가능

export interface Floor {
  id: string
  buildingId: string
  floor: number
  major: number // 100 + floor
  status?: FloorSetupStatus
}

export type ConnectorType = 'elevator' | 'stairs'

export interface Connector {
  id: string
  buildingId: string
  name: string
  type: ConnectorType
  floors: number[] // 운행 층
}

export type BeaconType = 'anchor' | 'checkpoint' | 'connector'

export interface Beacon {
  id: string
  floorId: string
  name: string
  major: number
  minor: number
  type: BeaconType
  connectorId?: string // 엘베/계단일 때
  isAnchor: boolean
}

export type LandmarkType = 'room' | 'restroom' | 'facility' | 'entrance'

export interface Landmark {
  id: string
  floorId: string
  name: string // 사용자가 음성으로 말하는 목적지
  type: LandmarkType
  visualTagId?: string // 시각태그 연결
}
