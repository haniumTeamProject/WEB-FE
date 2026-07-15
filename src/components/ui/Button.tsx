import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'outline' | 'danger'

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand text-white border border-transparent hover:brightness-95',
  outline: 'bg-white text-[#4A5568] border border-[#DEE2EB] hover:bg-gray-50',
  danger: 'bg-white text-[#DC4C4C] border border-[#DC4C4C] hover:bg-red-50',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className = '', ...rest }: Props) {
  return (
    <button
      className={`h-11 px-5 rounded-[10px] text-[15px] font-semibold cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed ${variantClass[variant]} ${className}`}
      {...rest}
    />
  )
}
