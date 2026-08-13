import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export type StepKey = 'floorplan' | 'map' | 'connectors' | 'landmarks' | 'beacons' | 'path-nodes'

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'floorplan', label: '설계도' },
  { key: 'map', label: '지도 검수' },
  { key: 'connectors', label: '수직연결자' },
  { key: 'landmarks', label: '목적지' },
  { key: 'beacons', label: '비콘' },
  { key: 'path-nodes', label: '경로노드' },
]

// 설계도→지도검수→수직연결자→목적지→비콘→경로노드, 6단계 공통 이전/다음 단계 이동 버튼.
// 마지막 단계(다음 단계 없음)에서는 saveAction이 주어지면 오른쪽에 저장 버튼을 대신 렌더링한다.
export function StepFooter({
  buildingId,
  floorId,
  current,
  saveAction,
}: {
  buildingId: string
  floorId: string
  current: StepKey
  saveAction?: { label: string; disabled?: boolean; onClick: () => void }
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
        {!next && saveAction && (
          <Button disabled={saveAction.disabled} onClick={saveAction.onClick}>
            {saveAction.label}
          </Button>
        )}
      </div>
    </div>
  )
}
