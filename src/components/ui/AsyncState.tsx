import type { ReactNode } from 'react'
import { Button } from './Button'

type AsyncStateProps = {
  status: 'loading' | 'empty' | 'error'
  title?: string
  action?: ReactNode
  onRetry?: () => void
}

export function AsyncState({ status, title, action, onRetry }: AsyncStateProps) {
  if (status === 'loading') {
    return <p aria-busy="true" className="text-sm text-muted">불러오는 중입니다.</p>
  }

  if (status === 'error') {
    return (
      <section className="grid gap-3 py-8 text-center">
        <p className="text-sm text-muted">요청을 처리하지 못했습니다.</p>
        {onRetry && <Button className="justify-self-center" variant="outline" onClick={onRetry}>다시 시도</Button>}
      </section>
    )
  }

  return (
    <section className="grid gap-3 py-8 text-center">
      {title && <p className="text-sm text-muted">{title}</p>}
      {action}
    </section>
  )
}
