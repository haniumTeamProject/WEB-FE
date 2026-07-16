import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import LoginPage from '@/pages/auth/LoginPage'
import SignupPage from '@/pages/auth/SignupPage'
import PendingApprovalPage from '@/pages/auth/PendingApprovalPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import BuildingManagePage from '@/pages/buildings/BuildingManagePage'
import BuildingDetailPage from '@/pages/buildings/BuildingDetailPage'
import BuildingFormPage from '@/pages/buildings/BuildingFormPage'
import FloorManagePage from '@/pages/buildings/FloorManagePage'
import ConnectorPage from '@/pages/connectors/ConnectorPage'
import FloorplanUploadPage from '@/pages/floorplan/FloorplanUploadPage'
// Konva 에디터는 무거워서 이 라우트에서만 로드 (코드 스플리팅)
const MapReviewPage = lazy(() => import('@/pages/map-editor/MapReviewPage'))
// Konva(지도) 쓰는 페이지는 lazy 로드
const BeaconListPage = lazy(() => import('@/pages/beacons/BeaconListPage'))
import BeaconEditPage from '@/pages/beacons/BeaconEditPage'
const LandmarkPage = lazy(() => import('@/pages/landmarks/LandmarkPage'))
import AccountApprovalPage from '@/pages/admin/AccountApprovalPage'
import GuidelinesPage from '@/pages/guidelines/GuidelinesPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import AccountPage from '@/pages/settings/AccountPage'
import NotFoundPage from '@/pages/NotFoundPage'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('accessToken')
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/pending', element: <PendingApprovalPage /> },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/buildings', element: <BuildingManagePage /> },
      { path: '/buildings/new', element: <BuildingFormPage /> },
      { path: '/buildings/:buildingId', element: <BuildingDetailPage /> },
      { path: '/buildings/:buildingId/floors', element: <FloorManagePage /> },
      { path: '/buildings/:buildingId/connectors', element: <ConnectorPage /> },
      { path: '/buildings/:buildingId/floors/:floorId/floorplan', element: <FloorplanUploadPage /> },
      {
        path: '/buildings/:buildingId/floors/:floorId/map',
        element: (
          <Suspense fallback={<p style={{ color: '#8C99B3' }}>에디터 불러오는 중…</p>}>
            <MapReviewPage />
          </Suspense>
        ),
      },
      {
        path: '/buildings/:buildingId/floors/:floorId/beacons',
        element: (
          <Suspense fallback={<p style={{ color: '#8C99B3' }}>불러오는 중…</p>}>
            <BeaconListPage />
          </Suspense>
        ),
      },
      { path: '/buildings/:buildingId/floors/:floorId/beacons/:beaconId', element: <BeaconEditPage /> },
      {
        path: '/buildings/:buildingId/floors/:floorId/landmarks',
        element: (
          <Suspense fallback={<p style={{ color: '#8C99B3' }}>불러오는 중…</p>}>
            <LandmarkPage />
          </Suspense>
        ),
      },
      { path: '/admin/approvals', element: <AccountApprovalPage /> },
      { path: '/guidelines', element: <GuidelinesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/account', element: <AccountPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
