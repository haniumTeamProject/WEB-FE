import type { FloorSetupStatus } from '@/types/domain'

// 브랜드 색
export const NAVY = '#3B5AA8'
export const PRIMARY = '#4B70E5'

// 층 세팅 상태 뱃지 (와이어프레임 5색과 일치)
export const FLOOR_STATUS_BADGE: Record<
  FloorSetupStatus,
  { label: string; bg: string; fg: string }
> = {
  floorplan_missing: { label: '설계도 미업로드', bg: '#EEEFF2', fg: '#8C99B3' },
  review_needed: { label: '검수 필요', bg: '#FDEDD9', fg: '#F2992E' },
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
