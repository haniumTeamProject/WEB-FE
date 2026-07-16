import type { DragEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBuilding } from '@/features/buildings/hooks'
import { useFloors } from '@/features/floors/hooks'
import {
  useDeleteFloorplan,
  useFloorplan,
  useUploadFloorplan,
} from '@/features/floorplan/hooks'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function FloorplanUploadPage() {
  const { buildingId = '', floorId = '' } = useParams()
  const { data: building } = useBuilding(buildingId)
  const { data: floors } = useFloors(buildingId)
  const floor = floors?.find((f) => f.id === floorId)
  const { data: floorplan, isLoading } = useFloorplan(floorId)
  const upload = useUploadFloorplan(floorId)
  const del = useDeleteFloorplan(floorId)

  const floorLabel = floor ? `${floor.floor}층` : '층'

  async function handleFile(file?: File | null) {
    if (!file) return
    const dataUrl = await readFileAsDataURL(file)
    upload.mutate(dataUrl)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: '홈', to: '/' },
          { label: '건물 관리', to: '/buildings' },
          { label: building?.name ?? '건물', to: `/buildings/${buildingId}` },
          { label: floorLabel, to: `/buildings/${buildingId}/floors` },
          { label: '설계도' },
        ]}
      />
      <h1>설계도 업로드</h1>

      <Card>
        <p className="text-muted text-sm mb-5">
          {building?.name} · {floorLabel} (major {floor?.major ?? '—'})
        </p>

        {isLoading ? (
          <p className="text-muted">불러오는 중…</p>
        ) : floorplan ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 rounded-full bg-[#E6F7EE] text-[#4BAE72] text-sm font-semibold">
                ✓ 자동 추출 완료
              </span>
              <span className="text-muted text-sm">
                벽·이동 영역이 추출됐어요. 다음 단계에서 검수하세요.
              </span>
            </div>
            <img
              src={floorplan.imageUrl}
              alt="설계도 미리보기"
              className="max-w-full max-h-[420px] rounded-lg border border-line"
            />
            <div className="flex gap-3 mt-5">
              <Link to={`/buildings/${buildingId}/floors/${floorId}/map`}>
                <Button>검수하러 가기</Button>
              </Link>
              <Button variant="outline" disabled={del.isPending} onClick={() => del.mutate()}>
                다시 업로드
              </Button>
            </div>
          </div>
        ) : (
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="block border-2 border-dashed border-[#99AEE0] rounded-xl bg-field text-center py-16 cursor-pointer hover:bg-[#eef2fb] transition"
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="text-ink font-semibold">
              설계도 이미지(PNG/JPG)를 드래그하거나 클릭해 업로드
            </div>
            <div className="text-muted text-sm mt-1">
              업로드 후 서버가 벽·이동영역을 자동 추출합니다 (검수는 다음 단계)
            </div>
            {upload.isPending && <div className="text-brand text-sm mt-3">업로드 중…</div>}
          </label>
        )}
      </Card>
    </div>
  )
}
