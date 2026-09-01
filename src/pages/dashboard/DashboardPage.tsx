import type { CSSProperties, ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useBuildings } from '@/features/buildings/hooks'
import { fetchFloors } from '@/features/floors/api'
import type { Building, Floor, FloorSetupStatus } from '@/types/domain'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { FLOOR_STATUS_BADGE, floorStatusBadge } from '@/lib/constants'
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

// 아이콘 — 통계 카드·다음 할 일 카드 공용. 라이브러리 없이 직접 그린 최소한의 선 아이콘.
function IconBuilding({ style }: { style?: CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <rect x="5" y="3" width="10" height="14" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 6.5h1M11 6.5h1M8 9.5h1M11 9.5h1M8 12.5h1M11 12.5h1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function IconCheck({ style }: { style?: CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.6 10.2l2.3 2.3 4.6-4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconAlert({ style }: { style?: CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <path d="M10 3.3 17.5 16H2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 8.3v3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13.8" r="0.9" fill="currentColor" />
    </svg>
  )
}
function IconLayers({ style }: { style?: CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <path d="M10 3 3 7l7 4 7-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 11l7 4 7-4M3 14.5l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon,
  bg,
  fg,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon: ReactNode
  bg: string
  fg: string
}) {
  return (
    <Card style={{ borderLeft: `3px solid ${fg}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#7885A6' }}>{label}</span>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: bg,
            color: fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#1A2233', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#93A0BD' }}>{hint}</div>}
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
  bg: string
  fg: string
  icon: 'layers' | 'alert'
  to: string
}

function buildTodos(buildings: Building[], floorsByBuilding: (Floor[] | undefined)[]): TodoItem[] {
  return buildings.flatMap((b, i) => {
    const floors = floorsByBuilding[i]
    if (floors && floors.length === 0) {
      // floorCount는 등록돼 있어도(예: 건물 생성 시 입력) 실제 층(Floor) 레코드가 하나도 없는 경우 —
      // 층별 상태 자체가 없어 위 로직으로는 아무 항목도 안 잡히지만, 실제로는 가장 먼저 해결해야
      // 할 문제다(실제 발견된 문제: 이런 건물이 목록에서 조용히 빠짐).
      const item: TodoItem = {
        key: b.id,
        label: b.name,
        statusLabel: '등록된 층 없음',
        stepLabel: '층 관리',
        bg: FLOOR_STATUS_BADGE.floorplan_missing.bg,
        fg: FLOOR_STATUS_BADGE.floorplan_missing.fg,
        icon: 'layers',
        to: `/buildings/${b.id}/floors`,
      }
      return [item]
    }
    return (floors ?? []).flatMap((f): TodoItem[] => {
      const step = f.status && NEXT_STEP[f.status]
      if (!step) return []
      const badge = floorStatusBadge(f.status)
      return [
        {
          key: f.id,
          label: `${b.name} · ${f.floor}층`,
          statusLabel: badge.label,
          stepLabel: step.label,
          bg: badge.bg,
          fg: badge.fg,
          icon: 'alert',
          to: `/buildings/${b.id}/floors/${f.id}/${step.path}`,
        },
      ]
    })
  })
}

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useBuildings()
  const buildings = data ?? []
  const ready = buildings.filter((b) => b.status === 'ready').length
  const inProgress = buildings.length - ready

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <StatCard
          label="총 건물"
          value={buildings.length}
          hint="등록된 건물 수"
          icon={<IconBuilding />}
          bg={FLOOR_STATUS_BADGE.floorplan_missing.bg}
          fg={FLOOR_STATUS_BADGE.floorplan_missing.fg}
        />
        <StatCard
          label="안내 가능"
          value={ready}
          hint="세팅 완료 건물"
          icon={<IconCheck />}
          bg={FLOOR_STATUS_BADGE.ready.bg}
          fg={FLOOR_STATUS_BADGE.ready.fg}
        />
        <StatCard
          label="세팅 필요"
          value={inProgress}
          hint="진행 중 건물"
          icon={<IconAlert />}
          bg={FLOOR_STATUS_BADGE.review_needed.bg}
          fg={FLOOR_STATUS_BADGE.review_needed.fg}
        />
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
        {!isLoading && !isError && !floorsLoading && todos.map((t) => (
          <Card
            key={t.key}
            style={{ borderLeft: `3px solid ${t.fg}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: t.bg,
                  color: t.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {t.icon === 'layers' ? <IconLayers /> : <IconAlert />}
              </span>
              <div>
                <span style={{ fontWeight: 600 }}>{t.label}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: t.fg,
                    background: t.bg,
                    marginLeft: 10,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  {t.statusLabel}
                </span>
              </div>
            </div>
            <Link to={t.to}>
              <Button variant="outline" style={{ height: 36, padding: '0 14px', whiteSpace: 'nowrap' }}>
                {t.stepLabel}로 이동 →
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  )
}
