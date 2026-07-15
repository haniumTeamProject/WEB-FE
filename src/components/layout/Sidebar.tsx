import { NavLink } from 'react-router-dom'
import type { CSSProperties } from 'react'

const items = [
  { to: '/', label: '대시보드', end: true },
  { to: '/guidelines', label: '설치 가이드라인', end: false },
]
const bottom = [
  { to: '/settings', label: '설정' },
  { to: '/account', label: '계정' },
]

function linkStyle(active: boolean): CSSProperties {
  return {
    display: 'block',
    padding: '14px 24px',
    margin: '0 16px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
    color: active ? '#fff' : '#2E3648',
    background: active ? '#4B70E5' : 'transparent',
  }
}

export function Sidebar() {
  return (
    <nav style={{ width: 240, minHeight: '100vh', borderRight: '1px solid #ECEEF3', paddingTop: 24 }}>
      <div style={{ padding: '0 24px 24px', fontWeight: 800, fontSize: 22, color: '#4B70E5' }}>
        Mappin
      </div>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} style={({ isActive }) => linkStyle(isActive)}>
          {it.label}
        </NavLink>
      ))}
      <hr style={{ margin: '16px 24px', border: 0, borderTop: '1px solid #ECEEF3' }} />
      {bottom.map((it) => (
        <NavLink key={it.to} to={it.to} style={({ isActive }) => linkStyle(isActive)}>
          {it.label}
        </NavLink>
      ))}
    </nav>
  )
}
