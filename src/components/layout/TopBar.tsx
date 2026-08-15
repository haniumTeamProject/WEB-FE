import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBuildings } from '@/features/buildings/hooks'

const ROLE_LABEL: Record<string, string> = {
  super_admin: '슈퍼관리자',
  admin: '관리자',
}

export function TopBar() {
  const navigate = useNavigate()
  const { data: buildings } = useBuildings()

  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchOpen = searchFocused && query.trim() !== ''
  const matches = searchOpen
    ? (buildings ?? []).filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : []

  function goToBuilding(id: string) {
    navigate(`/buildings/${id}`)
    setQuery('')
    setSearchFocused(false)
  }

  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const email = localStorage.getItem('adminEmail') ?? '관리자'
  const role = localStorage.getItem('adminRole') ?? ''
  const roleLabel = ROLE_LABEL[role] ?? 'Admin'

  function signOut() {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('adminEmail')
    localStorage.removeItem('adminName')
    localStorage.removeItem('adminRole')
    setAccountOpen(false)
    navigate('/login')
  }

  return (
    <header className="h-[70px] border-b border-line flex items-center justify-between px-8 bg-white">
      <div className="relative w-[360px]">
        <input
          placeholder="검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          className="w-full h-10 rounded-full border border-line px-4 bg-field text-sm outline-none"
        />
        {searchOpen && (
          <div className="absolute top-12 left-0 w-full bg-white border border-line rounded-lg shadow-md overflow-hidden z-50">
            {matches.length > 0 ? (
              matches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    goToBuilding(b.id)
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-line last:border-b-0"
                >
                  <div className="font-medium text-ink">{b.name}</div>
                  {b.address && <div className="text-[12px] text-muted">{b.address}</div>}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-[13px] text-muted">검색 결과가 없습니다.</div>
            )}
          </div>
        )}
      </div>

      <div className="relative" ref={accountRef}>
        <button
          type="button"
          onClick={() => setAccountOpen((v) => !v)}
          className="text-sm text-[#2E3648]"
        >
          <strong>{email}</strong> · {roleLabel}
        </button>
        {accountOpen && (
          <div className="absolute top-10 right-0 w-[200px] bg-white border border-line rounded-lg shadow-md overflow-hidden z-50">
            <button
              type="button"
              onClick={() => {
                setAccountOpen(false)
                navigate('/login')
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-line"
            >
              다른 계정으로 로그인
            </button>
            <button
              type="button"
              onClick={signOut}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50"
              style={{ color: '#DC4C4C' }}
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
