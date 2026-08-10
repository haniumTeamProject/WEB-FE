import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export type StepKey = 'floorplan' | 'map' | 'beacons' | 'landmarks' | 'path-nodes'

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'floorplan', label: '설계도' },
  { key: 'map', label: '지도 검수' },
  { key: 'beacons', label: '비콘' },
  { key: 'landmarks', label: '목적지' },
  { key: 'path-nodes', label: '경로노드' },
]

// 설계도→지도검수→비콘→목적지→경로노드, 5단계 공통 이전/다음 단계 이동 버튼.
export function StepFooter({
  buildingId,
  floorId,
  current,
}: {
  buildingId: string
  floorId: string
  current: StepKey
}) {
  const index = STEPS.findIndex((s) => s.key === current)
  const prev = STEPS[index - 1]
  const next = STEPS[index + 1]
  return (
    <div className="flex justify-between mt-6">
      <div>
        {prev && (
          <Link to={`/buildings/${buildingId}/floors/${floorId}/${prev.key}`}>
            <Button variant="outline">← 이전 단계: {prev.label}</Button>
          </Link>
        )}
      </div>
      <div>
        {next && (
          <Link to={`/buildings/${buildingId}/floors/${floorId}/${next.key}`}>
            <Button>다음 단계: {next.label} →</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
