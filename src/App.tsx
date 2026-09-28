import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { RequireAccess, RequireAuth } from './components/Guards'
import { AuditPage } from './pages/AuditPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RolesPage } from './pages/RolesPage'
import { SetPasswordPage } from './pages/SetPasswordPage'
import { TeamPage } from './pages/TeamPage'

export function App() {
  return (
    <Routes>
      <Route path="/ingresar" element={<LoginPage />} />
      <Route path="/recuperar" element={<ForgotPasswordPage />} />
      <Route path="/definir-contrasena" element={<SetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route
          path="equipo"
          element={
            <RequireAccess ownerOnly>
              <TeamPage />
            </RequireAccess>
          }
        />
        <Route
          path="roles"
          element={
            <RequireAccess ownerOnly>
              <RolesPage />
            </RequireAccess>
          }
        />
        <Route
          path="auditoria"
          element={
            <RequireAccess permission="auditoria.ver">
              <AuditPage />
            </RequireAccess>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
