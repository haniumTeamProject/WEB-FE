import type { ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useBuildings } from '@/features/buildings/hooks'
import { fetchFloors } from '@/features/floors/api'
import type { Building, Floor, FloorSetupStatus } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { floorStatusBadge } from '@/lib/constants'
import { AsyncState } from '@/components/ui/AsyncState'

// 층 세팅 상태별로, 그 상태를 해결하려면 이동해야 할 단계 화면(경로 + 화면 이름) — StepNav의 단계
// 순서와 동일하게 맞춘다. ready는 더 할 일이 없으므로 목록에서 제외한다(NEXT_STEP에 없음).
const NEXT_STEP: Partial<Record<FloorSetupStatus, { path: string; label: string }>> = {
  floorplan_missing: { path: 'floorplan', label: '설계도 업로드' },
  review_needed: { path: 'map', label: '지도 검수' },
  scale_missing: { path: 'map', label: '지도 검수' },
  beacon_missing: { path: 'beacons', label: '비콘 등록' },
  connector_missing: { path: 'connectors', label: '연결자 배치' },
}

function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <div style={{ fontSize: 13, color: '#8C99B3' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#1A2233', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: '#8C99B3', marginTop: 4 }}>{hint}</div>}
    </Card>
  )
}

// 건물별로 "다음 뭘 해야 하는지"를 바로 알 수 있게, ready가 아닌 층 하나하나를 액션 항목으로 만든다
// — 세팅 필요 건물 수만 보여주는 것보다, 어느 건물의 몇 층이 어느 단계에서 막혔는지 클릭 한 번으로
// 바로 이동할 수 있어야 관리자가 대시보드만 보고 다음 할 일을 알 수 있다(실제 요청).
interface TodoItem {
  key: string
  label: string
  statusLabel: string
  stepLabel: string
  fg: string
  to: string
}

function buildTodos(buildings: Building[], floorsByBuilding: (Floor[] | undefined)[]): TodoItem[] {
  return buildings.flatMap((b, i) => {
    const floors = floorsByBuilding[i]
    if (floors && floors.length === 0) {
      // floorCount는 등록돼 있어도(예: 건물 생성 시 입력) 실제 층(Floor) 레코드가 하나도 없는 경우 —
      // 층별 상태 자체가 없어 위 로직으로는 아무 항목도 안 잡히지만, 실제로는 가장 먼저 해결해야
      // 할 문제다(실제 발견된 문제: 이런 건물이 목록에서 조용히 빠짐).
      return [
        {
          key: b.id,
          label: b.name,
          statusLabel: '등록된 층 없음',
          stepLabel: '층 관리',
          fg: '#8C99B3',
          to: `/buildings/${b.id}/floors`,
        },
      ]
    }
    return (floors ?? []).flatMap((f) => {
      const step = f.status && NEXT_STEP[f.status]
      if (!step) return []
      const badge = floorStatusBadge(f.status)
      return [
        {
          key: f.id,
          label: `${b.name} · ${f.floor}층`,
          statusLabel: badge.label,
          stepLabel: step.label,
          fg: badge.fg,
          to: `/buildings/${b.id}/floors/${f.id}/${step.path}`,
        },
      ]
    })
  })
}

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useBuildings()
  const buildings = data ?? []
  const totalFloors = buildings.reduce((sum, b) => sum + (b.floorCount ?? 0), 0)
  const ready = buildings.filter((b) => b.status === 'ready').length

  const floorQueries = useQueries({
    queries: buildings.map((b) => ({
      queryKey: ['buildings', b.id, 'floors'],
      queryFn: () => fetchFloors(b.id),
      enabled: !!b.id,
    })),
  })
  const floorsLoading = floorQueries.some((q) => q.isLoading)
  const todos = buildTodos(
    buildings,
    floorQueries.map((q) => q.data),
  )

  return (
    <div>
      <Breadcrumb items={[{ label: '홈', to: '/' }, { label: '대시보드' }]} />
      <h1>대시보드</h1>

      {/* 인벤토리 개수(총 건물·총 층)는 건물 목록에도 있어 중복 — 대시보드는 "완결 진행 + 남은 할 일"
          중심으로 좁힌다. 안내 가능은 전체 대비 비율로 목표 진행도를, 세팅 필요 항목은 아래 '다음 할 일'
          리스트와 직결되는 층별 작업 수를 보여준다. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <StatCard
          label="안내 가능"
          value={
            <>
              {ready}
              <span style={{ fontSize: 20, fontWeight: 600, color: '#8C99B3' }}> / {buildings.length}</span>
            </>
          }
          hint="안내 준비된 건물"
        />
        <StatCard label="세팅 필요 항목" value={floorsLoading ? '…' : todos.length} hint="층별 남은 작업" />
        <StatCard label="총 층" value={totalFloors} hint="관리 중인 층" />
      </div>

      <h2 style={{ margin: '28px 0 12px' }}>다음 할 일</h2>

      {(isLoading || floorsLoading) && <AsyncState status="loading" />}
      {isError && <AsyncState status="error" onRetry={() => refetch()} />}

      <div style={{ display: 'grid', gap: 8 }}>
        {!isLoading && !isError && !floorsLoading && buildings.length === 0 && (
          <AsyncState
            status="empty"
            title="등록된 건물이 없습니다."
            action={
              <Link to="/buildings/new">
                <Button>건물 등록</Button>
              </Link>
            }
          />
        )}
        {!isLoading && !isError && !floorsLoading && buildings.length > 0 && todos.length === 0 && (
          <Card>
            <p className="text-muted text-sm">모든 층 세팅이 완료됐습니다.</p>
          </Card>
        )}
        {/* 액션 리스트 행: 넓은 화면에서 버튼만 멀리 떨어져 클릭 대상이 애매하던 문제를 없애려, 행
            전체를 클릭 가능한 링크로 만들고 우측엔 '이동' 힌트+화살표만 둔다(설정 메뉴·목록형 UI의 관행). */}
        {!isLoading && !isError && !floorsLoading && todos.map((t) => (
          <Link key={t.key} to={t.to} className="block no-underline">
            <Card
              className="hover:bg-gray-50 transition-colors cursor-pointer"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: 16 }}
            >
              <div className="min-w-0">
                <span style={{ fontWeight: 600, color: '#1A2233' }}>{t.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.fg, marginLeft: 10 }}>{t.statusLabel}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#4B70E5', whiteSpace: 'nowrap' }}>
                {t.stepLabel}로 이동 →
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
