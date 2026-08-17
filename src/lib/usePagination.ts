import { useState } from 'react'

/**
 * 클라이언트 페이징. 목록 전체 배열을 받아 현재 페이지 조각만 돌려준다.
 *
 * 항목이 줄어 현재 페이지가 범위를 넘으면(예: 마지막 페이지에서 항목을 삭제)
 * 렌더 중 페이지를 보정한다 — 빈 페이지에 남아 "아무것도 없는" 상태가 되지 않게.
 */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, pageCount)
  // 범위 초과 시 렌더 중 보정(같은 컴포넌트의 조건부 setState → 즉시 재렌더로 안정화).
  if (current !== page) setPage(current)
  const start = (current - 1) * pageSize
  return {
    page: current,
    pageCount,
    setPage,
    pageItems: items.slice(start, start + pageSize),
  }
}
