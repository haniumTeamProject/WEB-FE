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

// 랜드마크(목적지) 지도 점 색 — 카테고리별로 나누지 않고 고정 색 하나만 씀
export const LANDMARK_COLOR = '#4B70E5'

// 목적지 카테고리 기본 목록 — 드롭다운 기본 옵션, 목록에 없으면 폼에서 직접 입력 가능
export const LANDMARK_CATEGORIES = [
  '강의실',
  '사무실',
  '화장실',
  '회의실',
  '실습실',
  '라운지',
  '매점/카페',
  '기타',
] as const

// 층 세팅 상태 뱃지 (와이어프레임 5색과 일치)
export const FLOOR_STATUS_BADGE: Record<
  FloorSetupStatus,
  { label: string; bg: string; fg: string }
> = {
  floorplan_missing: { label: '설계도 미업로드', bg: '#EEEFF2', fg: '#8C99B3' },
  review_needed: { label: '검수 필요', bg: '#FDEDD9', fg: '#F2992E' },
  scale_missing: { label: '축척 미설정', bg: '#F3EAFB', fg: '#8C5BD6' },
  beacon_missing: { label: '비콘 미등록', bg: '#E6EDFB', fg: '#4B70E5' },
  ready: { label: '안내 가능', bg: '#E6F7EE', fg: '#4BAE72' },
}

// 프론트가 모르는 상태값(백엔드가 새 status를 추가/변경하는 등)이 와도 크래시하지 않게
// 안전하게 조회한다. 값이 없거나 알 수 없으면 회색 '—' 뱃지로 떨어뜨린다.
// (FLOOR_STATUS_BADGE[unknown] 은 undefined라 .fg/.label 접근에서 화면이 통째로 깨진다.)
const UNKNOWN_STATUS_BADGE = { label: '—', bg: '#EEEFF2', fg: '#8C99B3' }
export function floorStatusBadge(status?: string): { label: string; bg: string; fg: string } {
  return (status && FLOOR_STATUS_BADGE[status as FloorSetupStatus]) || UNKNOWN_STATUS_BADGE
}

// 사이드바 메뉴
export const NAV_ITEMS = [
  { to: '/', label: '대시보드', end: true },
  { to: '/buildings', label: '건물 관리', end: false },
  { to: '/guidelines', label: '설치 가이드라인', end: false },
] as const
