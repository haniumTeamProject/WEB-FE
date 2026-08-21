// 항상 떠 있는 설명 문구 대신, "?" 아이콘에 마우스를 올리거나 포커스했을 때만 말풍선으로 보여주는
// 툴팁. 네이티브 title 속성은 브라우저마다 나타나는 시점이 늦고 스타일도 못 입혀서, CSS만으로
// 즉시 보이는 말풍선을 직접 그린다(group-hover 방식이라 별도 상태·라이브러리 불필요).
export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group">
      <span
        tabIndex={0}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-line text-[10px] text-muted shrink-0 cursor-help select-none outline-none"
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-[calc(100%+6px)] z-20 w-56 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-2 text-[12px] leading-snug text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
