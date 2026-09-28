import { Route, Routes } from 'react-router-dom'
import { AppLayout, MESSAGE_PERMISSIONS } from './components/AppLayout'
import { RequireAccess, RequireAuth } from './components/Guards'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MessagesPage } from './pages/MessagesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PeoplePage } from './pages/PeoplePage'
import { PersonRoute } from './pages/PersonPage'
import { SetPasswordPage } from './pages/SetPasswordPage'

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
          path="mensajes"
          element={
            <RequireAccess anyOf={MESSAGE_PERMISSIONS}>
              <MessagesPage />
            </RequireAccess>
          }
        />
        <Route
          path="personas"
          element={
            <RequireAccess permission="personas.ver">
              <PeoplePage />
            </RequireAccess>
          }
        />
        <Route
          path="personas/:id"
          element={
            <RequireAccess permission="personas.ver">
              <PersonRoute />
            </RequireAccess>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
