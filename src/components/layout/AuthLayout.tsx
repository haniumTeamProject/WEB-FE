import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#4B70E5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: 460, background: '#fff', borderRadius: 16, padding: 40 }}>
        <Outlet />
      </div>
    </div>
  )
}
