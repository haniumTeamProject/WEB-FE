import { Card } from '@/components/ui/Card'

const SECTIONS = [
  { title: '1. 코너·갈림길 (필수)', body: '방향 전환 지점에는 반드시 비콘을 설치합니다. 안내의 결정적 지점입니다.' },
  { title: '2. 긴 직선 복도', body: '직선 구간은 중간중간 1~2개만 배치해 현재 위치를 확인합니다.' },
  { title: '3. 앵커 비콘', body: '주 출입구에 앵커를 설치합니다. minor=1, major=100+층(예: 4층=104).' },
  { title: '4. 엘리베이터·계단', body: '같은 물리적 축이면 동일 connector_id를 지정해 층 이동을 잇습니다.' },
  { title: '5. 방마다 설치 금지', body: '랜드마크마다 달지 않습니다. 비용·RSSI 혼동만 늘어납니다.' },
]

// Figma "설치 가이드라인" — 읽기 전용 설치 기준 (현장 설치팀 배포용)
export default function GuidelinesPage() {
  return (
    <div>
      <h1>설치 가이드라인</h1>
      <Card className="mt-6">
        <h2 className="mb-1">비콘 설치 기준</h2>
        <p className="text-[13px] text-muted mb-6">읽기 전용 · 현장 설치팀 배포용</p>
        <div className="grid gap-6">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <p className="font-semibold text-brand mb-1">{s.title}</p>
              <p className="text-sm text-body">{s.body}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
