import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      {/* min-w-0: flex 자식은 기본적으로 min-width:auto라 내용(예: 지도 캔버스)이 한 번 넓게
          그려지면 그보다 좁게는 절대 안 줄어든다 — 브라우저를 확대해서 지도를 넓게 렌더링한 뒤
          다시 축소해도 지도 영역만 안 줄어드는 버그의 원인이었다(실제 발견된 문제). */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
