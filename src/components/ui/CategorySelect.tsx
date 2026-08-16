import { useState } from 'react'

const CUSTOM = '__custom__'

// 카테고리 드롭다운 + 목록에 없는 값은 '직접 입력'으로 전환해 새 항목을 추가할 수 있게 한다.
export function CategorySelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder?: string
}) {
  const [customMode, setCustomMode] = useState(value !== '' && !options.includes(value))

  return (
    <div>
      <label className="block">
        <span className="block text-[13px] text-muted mb-2">{label}</span>
        <select
          value={customMode ? CUSTOM : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustomMode(true)
              onChange('')
            } else {
              setCustomMode(false)
              onChange(e.target.value)
            }
          }}
          className="w-full h-12 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm"
        >
          <option value="">선택 안 함</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value={CUSTOM}>직접 입력…</option>
        </select>
      </label>
      {customMode && (
        <input
          className="mt-2 w-full h-12 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}
