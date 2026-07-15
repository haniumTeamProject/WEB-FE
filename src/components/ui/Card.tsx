import type { CSSProperties, ReactNode } from 'react'

// className(Tailwind)과 style(레거시 인라인) 둘 다 지원 — 점진적 마이그레이션용
export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`bg-white border border-line rounded-lg p-6 ${className}`} style={style}>
      {children}
    </div>
  )
}
