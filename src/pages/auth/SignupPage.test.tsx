import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import SignupPage from './SignupPage'

const mutateMock = vi.fn()
vi.mock('@/features/auth/hooks', () => ({
  useSignup: () => ({ mutate: mutateMock, isPending: false }),
}))

describe('SignupPage', () => {
  it('shows a validation error and does not submit when required fields are empty', async () => {
    const user = userEvent.setup()
    render(<SignupPage />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: '가입 신청' }))

    expect(await screen.findByText('이메일을 입력하세요')).toBeVisible()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('shows an error when password confirmation does not match', async () => {
    const user = userEvent.setup()
    render(<SignupPage />, { wrapper: MemoryRouter })

    await user.type(screen.getByLabelText('이메일'), 'admin@ac.kr')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'different123')
    await user.type(screen.getByLabelText('이름'), '홍길동')
    await user.type(screen.getByLabelText('소속 기관'), '수원대학교')
    await user.type(screen.getByLabelText('담당 건물'), 'ICT융합대학')
    await user.click(screen.getByRole('button', { name: '가입 신청' }))

    expect(await screen.findByText('비밀번호가 일치하지 않습니다')).toBeVisible()
    expect(mutateMock).not.toHaveBeenCalled()
  })
})
