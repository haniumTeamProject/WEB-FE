import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AsyncState } from './AsyncState'

describe('AsyncState', () => {
  it('retries a failed request when the user selects retry', async () => {
    const retry = vi.fn()
    const user = userEvent.setup()

    render(<AsyncState status="error" onRetry={retry} />)

    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(retry).toHaveBeenCalledOnce()
  })

  it('renders the supplied action for an empty collection', () => {
    render(
      <AsyncState status="empty" title="등록된 건물이 없습니다" action={<button type="button">건물 등록</button>} />,
    )

    expect(screen.getByRole('button', { name: '건물 등록' })).toBeVisible()
  })
})
