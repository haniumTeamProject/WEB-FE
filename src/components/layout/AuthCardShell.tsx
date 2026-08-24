import type { ReactNode } from 'react'

// 계정 관련 화면(로그인·회원가입·승인대기·오류) 공통 배경 — 파란 배경 위에 부드러운 물결(blob)
// 무늬를 겹치고, 그 위에 흰 카드를 중앙에 띄운다(Figma "계정-*" 시리즈 공통 레이아웃).
// AuthLayout(로그인 흐름)과 전역 404(NotFoundPage, AuthLayout 바깥의 캐치올 라우트라
// <Outlet/>을 못 씀)가 이 쉘을 같이 쓴다 — 배경을 두 곳에 따로 그리면 나중에 한쪽만 바뀌어
// 조용히 어긋나기 쉽다.
export function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand flex items-center justify-center p-6">
      <AuthBackgroundBlobs />
      <div className="relative z-10 w-[460px] bg-white rounded-2xl p-10">{children}</div>
    </div>
  )
}

// 손으로 그린 벡터 곡선 대신, 흐릿하게 번진 원 3개를 겹쳐서 물결처럼 보이게 한다 — 정확한 피그마
// 벡터 패스는 없지만, 같은 "부드럽게 번진 얼룩" 느낌은 충분히 낸다.
function AuthBackgroundBlobs() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 800 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <filter id="authBlobBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="70" />
        </filter>
      </defs>
      <g filter="url(#authBlobBlur)">
        <circle cx="100" cy="680" r="230" fill="#ffffff" fillOpacity="0.12" />
        <circle cx="700" cy="150" r="260" fill="#ffffff" fillOpacity="0.10" />
        <circle cx="430" cy="500" r="190" fill="#ffffff" fillOpacity="0.07" />
      </g>
    </svg>
  )
}
