// 지도 범례(색상 점)와 매칭되는 타입 선택 select. 현재 선택된 타입의 색을 점으로 보여주고,
// 옵션 목록에서도 색을 구분해 지도 위 점 색깔과 폼을 눈으로 바로 매칭할 수 있게 한다.
export function ColorSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; color: string }[]
}) {
  const current = options.find((o) => o.value === value)
  return (
    <label className="block">
      <span className="block text-[13px] text-muted mb-2">{label}</span>
      <div className="relative">
        <span
          aria-hidden
          className="absolute left-4 top-1/2 -translate-y-1/2 inline-block w-2.5 h-2.5 rounded-full pointer-events-none"
          style={{ background: current?.color }}
        />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="w-full h-12 pl-9 pr-4 rounded-lg border border-[#DEE2EB] bg-field text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} style={{ color: o.color }}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}
