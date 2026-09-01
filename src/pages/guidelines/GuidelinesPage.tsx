import { Card } from '@/components/ui/Card'

const ROWS: { item: string; policy: string }[] = [
  {
    item: '비콘 종류',
    policy:
      '두 종류다. 의미비콘은 관리자가 기준점에 직접 찍는 비콘, 보강비콘은 그 사이를 시스템이 자동으로 채우는 커버리지용 비콘이다.',
  },
  {
    item: '의미비콘 위치',
    policy:
      '복도 끝(막다른 곳), 방향이 꺾이는 코너, 갈림길(분기점) 중앙, 엘리베이터·계단 앞에 둔다. 사람이 방향을 정하거나 길이 갈리는 지점마다 필요하다.',
  },
  {
    item: '필수 지점',
    policy: '회전·분기·횡단(길 건너기) 지점에는 반드시 비콘을 둔다. 없으면 안내가 엉뚱한 지점에서 발화된다.',
  },
  {
    item: '출발점',
    policy: '모든 비콘이 출발점이 될 수 있다. 출발 전용 비콘은 따로 두지 않는다.',
  },
  {
    item: '보강비콘 (자동)',
    policy:
      '기준점 사이가 6m를 넘으면, 6m 이내가 되도록 시스템이 복도 중앙에 자동으로 채운다. 관리자가 직접 계산·배치하지 않는다.',
  },
  { item: '고유 번호', policy: '각 비콘의 MAC 주소를 등록한다. (예: 44:B1:76:1A:13:B2)' },
  { item: '지도 배치', policy: '관리자 화면의 지도에서 점을 드래그해 위치를 지정한다.' },
  {
    item: '현장 설치 조건',
    policy: '모든 비콘의 설치 높이·방향을 통일하고, 실제 설치 좌표를 기록한다. (지도 등록 위치와 ±0.5m 이내)',
  },
]

// Figma "설치 가이드라인" — 읽기 전용 설치 기준 (현장 설치팀 배포용)
export default function GuidelinesPage() {
  return (
    <div>
      <h1>설치 가이드라인</h1>
      <Card className="mt-6">
        <h2 className="mb-1">비콘 설치 정책</h2>
        <p className="text-[13px] text-muted mb-4">읽기 전용 · 현장 설치팀 배포용</p>
        <p className="text-sm text-body mb-6 leading-relaxed">
          Mappin은 실내에 설치한 <span className="font-medium">비콘</span>(BLE 신호기)으로 사용자의 위치를 파악해 길을
          안내한다. 비콘은 관리자가 기준점에 직접 찍는 <span className="font-medium">의미비콘</span>과, 그 사이를 자동으로
          채우는 <span className="font-medium">보강비콘</span> 두 종류다. 아래는 설치 기준이다.
        </p>
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
                  <td className="py-3 align-top text-body leading-relaxed">{r.policy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
