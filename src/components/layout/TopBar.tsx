export function TopBar() {
  return (
    <header
      style={{
        height: 70,
        borderBottom: '1px solid #ECEEF3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
      }}
    >
      <input
        placeholder="검색"
        style={{
          width: 360,
          height: 40,
          borderRadius: 20,
          border: '1px solid #ECEEF3',
          padding: '0 16px',
          background: '#F5F7FB',
        }}
      />
      <div style={{ fontSize: 14, color: '#2E3648' }}>
        <strong>PomPu</strong> · Admin
      </div>
    </header>
  )
}
