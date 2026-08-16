import { Card } from '@/components/ui/Card'

const ROWS: { item: string; policy: string }[] = [
  {
    item: '설치 기준',
    policy:
      'A(의미) 비콘 — 앵커·코너(갈림길)·수직 연결자 입구·목적지 출입구·복도 끝에 설치한다. 방마다 달지 않고 복도 위주',
  },
  {
    item: '역할',
    policy:
      '체크포인트 / 연결자 비콘으로 구분한다. 별도의 앵커(출발점 전용) 비콘은 두지 않는다 — 모든 체크포인트가 출발점이 될 수 있다',
  },
  { item: '고유 번호', policy: '비콘 MAC 주소를 등록한다 (예: 44:B1:76:1A:13:B2)' },
  { item: '배치', policy: '지도에서 점을 드래그해 위치를 지정한다' },
  {
    item: '보강 비콘',
    policy:
      'B(보강) 비콘 — 커버리지 전용. 인접 비콘 간 거리가 D_max(6m)를 넘으면 n = ceil(L/D_max) - 1개를 균등 간격으로 삽입한다',
  },
  {
    item: '배치 제약',
    policy: '회전·분기·횡단 지점에는 비콘이 반드시 있어야 한다. 없으면 안내가 엉뚱한 지점에서 발화된다',
  },
  { item: '설치 조건', policy: '설치 높이·방향을 전 비콘 통일하고, 실제 설치 좌표를 기록한다 (허용오차 ±0.5m)' },
]

// Figma "설치 가이드라인" — 읽기 전용 설치 기준 (현장 설치팀 배포용)
export default function GuidelinesPage() {
  return (
    <div>
      <h1>설치 가이드라인</h1>
      <Card className="mt-6">
        <h2 className="mb-1">비콘·체크포인트 정책</h2>
        <p className="text-[13px] text-muted mb-6">읽기 전용 · 현장 설치팀 배포용</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-ink py-3 pr-4 w-[140px] align-top">항목</th>
                <th className="text-left font-semibold text-ink py-3 align-top">정책</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.item} className="border-b border-line last:border-b-0">
                  <td className="py-3 pr-4 align-top font-medium text-ink whitespace-nowrap">{r.item}</td>
                  <td className="py-3 align-top text-body">{r.policy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
