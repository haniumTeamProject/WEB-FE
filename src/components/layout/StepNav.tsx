import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export type StepKey = 'floorplan' | 'map' | 'landmarks' | 'beacons' | 'path-nodes' | 'overview'

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'floorplan', label: '설계도' },
  { key: 'map', label: '지도 검수' },
  { key: 'landmarks', label: '목적지' },
  { key: 'beacons', label: '비콘' },
  { key: 'path-nodes', label: '경로노드' },
  { key: 'overview', label: '종합 확인' },
]

// 설계도→지도검수→목적지→비콘→경로노드→종합 확인, 6단계 공통 이전/다음 단계 이동 버튼.
// saveAction이 주어지면 다음 단계 버튼과 별개로(둘 다 있으면 나란히) 저장 버튼도 렌더링한다 — 다음
// 단계 이동과 저장은 서로 다른 동작이라 한쪽이 있다고 다른 쪽을 가리면 안 된다(실제로 경로노드 뒤에
// '종합 확인' 단계를 추가했을 때 저장 버튼이 사라지던 문제가 있었다).
export function StepFooter({
  buildingId,
  floorId,
  current,
  saveAction,
  extra,
}: {
  buildingId: string
  floorId: string
  current: StepKey
  saveAction?: { label: string; disabled?: boolean; onClick: () => void }
  extra?: ReactNode
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
      <div className="flex gap-2">
        {extra}
        {saveAction && (
          <Button disabled={saveAction.disabled} onClick={saveAction.onClick}>
            {saveAction.label}
          </Button>
        )}
        {next && (
          <Link to={`/buildings/${buildingId}/floors/${floorId}/${next.key}`}>
            <Button variant={saveAction ? 'outline' : 'primary'}>다음 단계: {next.label} →</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
