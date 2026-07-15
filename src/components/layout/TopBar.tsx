export function TopBar() {
  return (
    <header className="h-[70px] border-b border-line flex items-center justify-between px-8 bg-white">
      <input
        placeholder="검색"
        className="w-[360px] h-10 rounded-full border border-line px-4 bg-field text-sm outline-none"
      />
      <div className="text-sm text-[#2E3648]">
        <strong>PomPu</strong> · Admin
      </div>
    </header>
  )
}
