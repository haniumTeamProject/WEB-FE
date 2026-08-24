import { Outlet } from 'react-router-dom'
import { AuthCardShell } from './AuthCardShell'

export function AuthLayout() {
  return (
    <AuthCardShell>
      <Outlet />
    </AuthCardShell>
  )
}
