import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-2 text-sm text-muted mb-3">
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-line select-none">›</span>}
          {it.to ? (
            <Link to={it.to} className="text-muted hover:text-brand no-underline">
              {it.label}
            </Link>
          ) : (
            <span className="text-ink font-medium">{it.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
