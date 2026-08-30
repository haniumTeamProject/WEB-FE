import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useBuilding, useUpdateBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import type { Building } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/Badge'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { AsyncState } from '@/components/ui/AsyncState'

const editBuildingSchema = z.object({
  name: z.string().min(1, '건물명을 입력하세요'),
  code: z.string().min(1, '건물 코드를 입력하세요'),
  address: z.string().optional(),
})
type EditBuildingValues = z.infer<typeof editBuildingSchema>

// 모달이 열릴 때마다 새로 마운트돼야 defaultValues가 그 시점의 building 값을 정확히 반영한다 —
// BuildingDetailPage에 이 폼을 직접 두면 Modal이 닫혀도 컴포넌트가 그대로 남아 있어(Modal은 열려
// 있을 때만 children을 그리고, 닫히면 그냥 안 그릴 뿐 언마운트 시점이 애매함) 처음 연 시점의
// 값으로 고정될 위험이 있다 — 별도 컴포넌트로 분리해 Modal이 열릴 때(open=true)만 렌더링되게 한다.
function EditBuildingForm({
  building,
  buildingId,
  onClose,
}: {
  building: Building
  buildingId: string
  onClose: () => void
}) {
  const update = useUpdateBuilding(buildingId)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditBuildingValues>({
    resolver: zodResolver(editBuildingSchema),
    defaultValues: { name: building.name, code: building.code, address: building.address ?? '' },
  })

  const onSubmit = (values: EditBuildingValues) => {
    update.mutate(
      { name: values.name, code: values.code, address: values.address || undefined },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: 16 }}>
      <h3 style={{ margin: 0 }}>건물 정보 수정</h3>
      <Input label="건물명" error={errors.name?.message} {...register('name')} />
      <Input label="건물 코드" error={errors.code?.message} {...register('code')} />
      <Input label="주소" error={errors.address?.message} {...register('address')} />
      {update.isError && (
        <p style={{ color: '#DC4C4C', fontSize: 13 }}>수정에 실패했습니다. 건물 코드가 중복되지 않았는지 확인해 주세요.</p>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? '저장 중…' : '저장'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
      </div>
    </form>
  )
}

// Figma "건물 상세" — 건물 정보 + 층 목록(상태 뱃지) + 세팅 진입
export default function BuildingDetailPage() {
  const { buildingId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors, isLoading: floorsLoading, isError: floorsError, refetch: refetchFloors } = useFloors(buildingId)
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div>
      <Breadcrumb
        items={[
          { label: '홈', to: '/' },
          { label: '건물 관리', to: '/buildings' },
          { label: building?.name ?? '건물 상세' },
        ]}
      />
      <h1>건물 상세</h1>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginTop: 0 }}>{building?.name ?? buildingId}</h2>
            <p style={{ color: '#8C99B3' }}>
              {building?.code} · {building?.address ?? '주소 미입력'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              수정
            </Button>
            <Link to={`/buildings/${buildingId}/connectors`}>
              <Button variant="outline">수직 연결자</Button>
            </Link>
            <Link to={`/buildings/${buildingId}/floors`}>
              <Button variant="outline">층 관리</Button>
            </Link>
          </div>
        </div>

        <h3 style={{ marginTop: 24 }}>층 목록</h3>
        {floorsLoading && <AsyncState status="loading" />}
        {floorsError && <AsyncState status="error" onRetry={() => refetchFloors()} />}
        <div style={{ display: 'grid', gap: 8 }}>
          {!floorsLoading && !floorsError && floors?.map((f) => (
            <div key={f.id} className="p-3 border border-line rounded-lg">
              <div className="flex items-center gap-3">
                <span className="font-medium whitespace-nowrap">
                  {f.floor}층 · major {f.major}
                </span>
                {f.status && <StatusBadge status={f.status} />}
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <Link to={`/buildings/${buildingId}/floors/${f.id}/floorplan`}>
                  <Button variant="outline" className="whitespace-nowrap" style={{ height: 34, padding: '0 12px' }}>
                    설계도
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/map`}>
                  <Button variant="outline" className="whitespace-nowrap" style={{ height: 34, padding: '0 12px' }}>
                    지도 검수
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/connectors`}>
                  <Button variant="outline" className="whitespace-nowrap" style={{ height: 34, padding: '0 12px' }}>
                    수직연결자
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/landmarks`}>
                  <Button variant="outline" className="whitespace-nowrap" style={{ height: 34, padding: '0 12px' }}>
                    목적지
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/beacons`}>
                  <Button variant="outline" className="whitespace-nowrap" style={{ height: 34, padding: '0 12px' }}>
                    비콘
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/path-nodes`}>
                  <Button variant="outline" className="whitespace-nowrap" style={{ height: 34, padding: '0 12px' }}>
                    경로노드
                  </Button>
                </Link>
                <Link to={`/buildings/${buildingId}/floors/${f.id}/overview`}>
                  <Button variant="outline" className="whitespace-nowrap" style={{ height: 34, padding: '0 12px' }}>
                    종합 확인
                  </Button>
                </Link>
              </div>
            </div>
          ))}
          {floors && floors.length === 0 && (
            <AsyncState
              status="empty"
              title="등록된 층이 없습니다. '층 관리'에서 추가하세요."
              action={
                <Link to={`/buildings/${buildingId}/floors`}>
                  <Button variant="outline">층 관리</Button>
                </Link>
              }
            />
          )}
        </div>
      </Card>

      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        {building && <EditBuildingForm building={building} buildingId={buildingId} onClose={() => setEditOpen(false)} />}
      </Modal>
    </div>
  )
}
