import type { FloorSetupStatus } from '@/types/domain'
import { FLOOR_STATUS_BADGE } from '@/lib/constants'

export function StatusBadge({ status }: { status: FloorSetupStatus }) {
  const b = FLOOR_STATUS_BADGE[status]
  return (
    <span
      style={{
        background: b.bg,
        color: b.fg,
        padding: '4px 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {b.label}
    </span>
  )
}
