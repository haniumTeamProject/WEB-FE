import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div style={{ padding: 64, textAlign: 'center' }}>
      <h1>404</h1>
      <p>페이지를 찾을 수 없습니다.</p>
      <Link to="/">대시보드로</Link>
    </div>
  )
}
