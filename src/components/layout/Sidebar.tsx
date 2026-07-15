import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: '대시보드', end: true },
  { to: '/buildings', label: '건물 관리', end: false },
  { to: '/guidelines', label: '설치 가이드라인', end: false },
]
const bottom = [
  { to: '/settings', label: '설정' },
  { to: '/account', label: '계정' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'block mx-4 px-6 py-3.5 rounded-[10px] text-[15px] font-semibold',
    isActive ? 'bg-brand text-white' : 'text-[#2E3648] hover:bg-gray-50',
  ].join(' ')

export function Sidebar() {
  return (
    <nav className="w-60 min-h-screen border-r border-line pt-6 bg-white">
      <div className="px-6 pb-6 text-[22px] font-extrabold text-brand">Mappin</div>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={linkClass}>
          {it.label}
        </NavLink>
      ))}
      <hr className="mx-6 my-4 border-line" />
      {bottom.map((it) => (
        <NavLink key={it.to} to={it.to} className={linkClass}>
          {it.label}
        </NavLink>
      ))}
    </nav>
  )
}
