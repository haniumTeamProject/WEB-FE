import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-brand flex items-center justify-center p-6">
      <div className="w-[460px] bg-white rounded-2xl p-10">
        <Outlet />
      </div>
    </div>
  )
}
