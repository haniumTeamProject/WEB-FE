import { render, screen, renderHook, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Pagination } from './Pagination'
import { usePagination } from '@/lib/usePagination'

describe('usePagination', () => {
  it('현재 페이지 조각만 돌려주고, 목록이 줄면 페이지를 보정한다', () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: number[] }) => usePagination(items, 10),
      { initialProps: { items: Array.from({ length: 25 }, (_, i) => i) } },
    )
    expect(result.current.pageCount).toBe(3)
    expect(result.current.pageItems).toHaveLength(10)

    act(() => result.current.setPage(3))
    expect(result.current.page).toBe(3)
    expect(result.current.pageItems).toEqual([20, 21, 22, 23, 24])

    // 3페이지에 있는데 목록이 8개로 줄면 3페이지는 사라진다 → 1페이지로 보정
    rerender({ items: Array.from({ length: 8 }, (_, i) => i) })
    expect(result.current.pageCount).toBe(1)
    expect(result.current.page).toBe(1)
    expect(result.current.pageItems).toHaveLength(8)
  })
})

describe('Pagination', () => {
  it('페이지가 하나뿐이면 아무것도 그리지 않는다', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onChange={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('페이지가 많으면 …로 접고 첫·끝·현재 부근을 보여준다', () => {
    render(<Pagination page={5} pageCount={10} onChange={() => {}} />)
    // 1 … 4 5 6 … 10
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '4' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '5' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '6' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '10' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '3' })).toBeNull()
    expect(screen.getAllByText('…').length).toBe(2)
  })

  it('페이지 번호를 누르면 onChange를 부른다', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    // 총 3페이지면 1 2 3 이 모두 보인다(잘림 없음).
    render(<Pagination page={1} pageCount={3} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: '3' }))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('첫 페이지에서 이전 버튼은 비활성이다', () => {
    render(<Pagination page={1} pageCount={5} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '이전 페이지' })).toHaveProperty('disabled', true)
  })
})
