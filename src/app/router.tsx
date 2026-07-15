import { createBrowserRouter, Navigate } from 'react-router-dom'
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
import MapReviewPage from '@/pages/map-editor/MapReviewPage'
import BeaconListPage from '@/pages/beacons/BeaconListPage'
import BeaconEditPage from '@/pages/beacons/BeaconEditPage'
import LandmarkPage from '@/pages/landmarks/LandmarkPage'
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
      { path: '/buildings/:buildingId/floors/:floor/floorplan', element: <FloorplanUploadPage /> },
      { path: '/buildings/:buildingId/floors/:floor/map', element: <MapReviewPage /> },
      { path: '/buildings/:buildingId/floors/:floor/beacons', element: <BeaconListPage /> },
      { path: '/buildings/:buildingId/floors/:floor/beacons/:beaconId', element: <BeaconEditPage /> },
      { path: '/buildings/:buildingId/floors/:floor/landmarks', element: <LandmarkPage /> },
      { path: '/admin/approvals', element: <AccountApprovalPage /> },
      { path: '/guidelines', element: <GuidelinesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/account', element: <AccountPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
