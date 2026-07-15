import type { CSSProperties, ReactNode } from 'react'

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E6E8F0',
        borderRadius: 8,
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
