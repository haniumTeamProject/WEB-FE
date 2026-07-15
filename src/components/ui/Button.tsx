import type { ButtonHTMLAttributes, CSSProperties } from 'react'

type Variant = 'primary' | 'outline' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const base: CSSProperties = {
  height: 44,
  padding: '0 20px',
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid transparent',
}

const variants: Record<Variant, CSSProperties> = {
  primary: { background: '#4B70E5', color: '#fff' },
  outline: { background: '#fff', color: '#4A5568', borderColor: '#DEE2EB' },
  danger: { background: '#fff', color: '#DC4C4C', borderColor: '#DC4C4C' },
}

export function Button({ variant = 'primary', style, ...rest }: Props) {
  return <button style={{ ...base, ...variants[variant], ...style }} {...rest} />
}
