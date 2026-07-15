import type { InputHTMLAttributes, Ref } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

export function Input({ label, error, style, ref, ...rest }: Props) {
  return (
    <label style={{ display: 'block' }}>
      {label && (
        <span style={{ display: 'block', fontSize: 13, color: '#8C99B3', marginBottom: 8 }}>
          {label}
        </span>
      )}
      <input
        ref={ref}
        style={{
          width: '100%',
          height: 48,
          padding: '0 16px',
          borderRadius: 8,
          border: `1px solid ${error ? '#DC4C4C' : '#DEE2EB'}`,
          background: '#F5F7FB',
          fontSize: 14,
          boxSizing: 'border-box',
          ...style,
        }}
        {...rest}
      />
      {error && (
        <span style={{ display: 'block', color: '#DC4C4C', fontSize: 12, marginTop: 4 }}>
          {error}
        </span>
      )}
    </label>
  )
}
