type PageItem = number | 'ellipsis'

/** 1 … 4 5 6 … 10 형태. 첫·끝 페이지와 현재 ±1을 보이고 나머지 구간은 …로 접는다. */
function buildItems(page: number, pageCount: number): PageItem[] {
  const out: PageItem[] = []
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || (p >= page - 1 && p <= page + 1)) {
      out.push(p)
    } else if (out[out.length - 1] !== 'ellipsis') {
      out.push('ellipsis')
    }
  }
  return out
}

const cell =
  'min-w-9 h-9 px-2 flex items-center justify-center rounded-lg text-sm border transition select-none'

/** < 1 2 3 … 10 > 페이지 이동 바. 페이지가 하나뿐이면 아무것도 그리지 않는다. */
export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (p: number) => void
}) {
  if (pageCount <= 1) return null
  const items = buildItems(page, pageCount)

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-4" aria-label="페이지 이동">
      <button
        type="button"
        className={`${cell} border-line text-muted hover:enabled:border-brand disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 페이지"
      >
        ‹
      </button>

      {items.map((it, i) =>
        it === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className={`${cell} border-transparent text-muted`}>
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            aria-current={it === page ? 'page' : undefined}
            className={`${cell} cursor-pointer ${
              it === page
                ? 'bg-brand text-white border-brand font-semibold'
                : 'border-line text-body hover:border-brand'
            }`}
            onClick={() => onChange(it)}
          >
            {it}
          </button>
        ),
      )}

      <button
        type="button"
        className={`${cell} border-line text-muted hover:enabled:border-brand disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="다음 페이지"
      >
        ›
      </button>
    </nav>
  )
}
