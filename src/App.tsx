import { Route, Routes } from 'react-router-dom'
import { AppLayout, MESSAGE_PERMISSIONS } from './components/AppLayout'
import { RequireAccess, RequireAuth } from './components/Guards'
import { ConfigPage } from './pages/ConfigPage'
import { DataRequestsPage } from './pages/DataRequestsPage'
import { EmailsPage } from './pages/EmailsPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MessagesPage } from './pages/MessagesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PeoplePage } from './pages/PeoplePage'
import { PersonRoute } from './pages/PersonPage'
import { RetentionPage } from './pages/RetentionPage'
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
        <Route
          path="pedidos-de-datos"
          element={
            <RequireAccess permission="derechos.gestionar">
              <DataRequestsPage />
            </RequireAccess>
          }
        />
        <Route
          path="retencion"
          element={
            <RequireAccess permission="personas.borrar">
              <RetentionPage />
            </RequireAccess>
          }
        />
        <Route
          path="emails"
          element={
            <RequireAccess anyOf={MESSAGE_PERMISSIONS}>
              <EmailsPage />
            </RequireAccess>
          }
        />
        <Route
          path="configuracion"
          element={
            <RequireAccess permission="configuracion.editar">
              <ConfigPage />
            </RequireAccess>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
