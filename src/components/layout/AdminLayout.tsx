import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AdminLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F5F6F8' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <main style={{ padding: 32, flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
