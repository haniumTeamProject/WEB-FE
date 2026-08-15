import type { BeaconType, FloorSetupStatus } from '@/types/domain'

// 브랜드 색
export const NAVY = '#3B5AA8'
export const PRIMARY = '#4B70E5'

// 설계도 좌표 기준 폭 — FloorMapCanvas와 지도 데이터 가져오기(mapImport)가 공유
export const MAP_DESIGN_W = 900

// 비콘 타입 — 지도 위 점 색과 폼의 타입 select가 동일한 색을 쓰도록 한 곳에서 관리
export const BEACON_TYPE_LABEL: Record<BeaconType, string> = {
  semantic: '의미비콘',
  reinforcement: '보강비콘',
}
export const BEACON_TYPE_COLOR: Record<BeaconType, string> = {
  semantic: '#4B70E5',
  reinforcement: '#29AD72',
}

// 랜드마크(목적지) 지도 점 색 — 카테고리가 자유 입력이라 고정 색 하나만 씀
export const LANDMARK_COLOR = '#4B70E5'

// 수직연결자 지도 점 색 — PathNodePage의 연결자 입구 색(ENTRANCE_COLOR.connector)과 동일하게 맞춤
export const CONNECTOR_COLOR = '#2563eb'

// 층 세팅 상태 뱃지 (와이어프레임 5색과 일치)
export const FLOOR_STATUS_BADGE: Record<
  FloorSetupStatus,
  { label: string; bg: string; fg: string }
> = {
  floorplan_missing: { label: '설계도 미업로드', bg: '#EEEFF2', fg: '#8C99B3' },
  review_needed: { label: '검수 필요', bg: '#FDEDD9', fg: '#F2992E' },
  scale_missing: { label: '축척 미설정', bg: '#F3EAFB', fg: '#8C5BD6' },
  beacon_missing: { label: '비콘 미등록', bg: '#E6EDFB', fg: '#4B70E5' },
  connector_missing: { label: '연결자 결손', bg: '#FBE6E6', fg: '#DC4C4C' },
  ready: { label: '안내 가능', bg: '#E6F7EE', fg: '#4BAE72' },
}

// 사이드바 메뉴
export const NAV_ITEMS = [
  { to: '/', label: '대시보드', end: true },
  { to: '/buildings', label: '건물 관리', end: false },
  { to: '/guidelines', label: '설치 가이드라인', end: false },
] as const
