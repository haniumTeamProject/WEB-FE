import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useDeleteLandmark, useLandmarks, useUpdateLandmark } from '@/features/landmarks/hooks'
import type { Landmark } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { CategorySelect } from '@/components/ui/CategorySelect'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LANDMARK_CATEGORIES } from '@/lib/constants'

export default function LandmarkEditPage() {
  const { buildingId = '', floorId = '', landmarkId = '' } = useParams()
  const navigate = useNavigate()
  const { data: building } = useBuilding(buildingId)
  const { data: landmarks, isLoading, isError, refetch } = useLandmarks(floorId)
  const update = useUpdateLandmark(floorId)
  const del = useDeleteLandmark(floorId)
  const landmark = landmarks?.find((l) => l.id === landmarkId)

  const backTo = `/buildings/${buildingId}/floors/${floorId}/landmarks`

  const crumbs = [
    { label: '홈', to: '/' },
    { label: '건물 관리', to: '/buildings' },
    { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
    { label: '목적지', to: backTo },
    { label: '편집' },
  ]

  if (isLoading)
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <AsyncState status="loading" />
      </div>
    )
  if (isError)
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <AsyncState status="error" onRetry={() => refetch()} />
      </div>
    )
  if (!landmark)
    return (
      <div>
        <Breadcrumb items={crumbs} />
        <AsyncState status="empty" title="목적지를 찾을 수 없습니다." />
      </div>
    )

  return (
    <div>
      <Breadcrumb items={crumbs} />
      <h1>목적지 편집</h1>
      {/* landmark.id로 key를 줘 대상이 바뀌면 폼이 다시 마운트되며 필드를 새로 초기화한다(useEffect로 동기화하지 않음) */}
      <LandmarkEditForm
        key={landmark.id}
        landmark={landmark}
        categoryOptions={Array.from(
          new Set([...LANDMARK_CATEGORIES, ...(landmarks ?? []).map((l) => l.category).filter((c): c is string => !!c)]),
        )}
        onSubmit={(input) => update.mutate({ landmarkId, input }, { onSuccess: () => navigate(backTo) })}
        onDelete={() => del.mutate(landmarkId, { onSuccess: () => navigate(backTo) })}
        onCancel={() => navigate(backTo)}
        submitting={update.isPending}
        deleting={del.isPending}
      />
    </div>
  )
}

function LandmarkEditForm({
  landmark,
  categoryOptions,
  onSubmit,
  onDelete,
  onCancel,
  submitting,
  deleting,
}: {
  landmark: Landmark
  categoryOptions: string[]
  onSubmit: (input: { name: string; category?: string }) => void
  onDelete: () => void
  onCancel: () => void
  submitting: boolean
  deleting: boolean
}) {
  const [name, setName] = useState(landmark.name)
  const [category, setCategory] = useState(landmark.category ?? '')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const valid = name.trim() !== ''

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    onSubmit({ name: name.trim(), category: category.trim() || undefined })
  }

  return (
    <Card style={{ maxWidth: 560, margin: '0 auto' }}>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <CategorySelect
          label="카테고리"
          placeholder="강의실"
          value={category}
          onChange={setCategory}
          options={categoryOptions}
        />
        {landmark.sourceLabel && (
          <div>
            <span className="block text-[13px] text-muted mb-2">지도 라벨 (자동)</span>
            <div className="h-12 px-4 rounded-lg border border-line bg-field text-sm flex items-center text-muted">
              {landmark.sourceLabel}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={!valid || submitting}>
            저장
          </Button>
          <Button type="button" variant="danger" disabled={deleting} onClick={() => setConfirmDeleteOpen(true)}>
            삭제
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="목적지를 삭제할까요?"
        description={`'${landmark.name}' — 삭제하면 되돌릴 수 없습니다.`}
        pending={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={onDelete}
      />
    </Card>
  )
}
