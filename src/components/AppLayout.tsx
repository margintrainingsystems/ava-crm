import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useMember, useAuth } from '../auth/context'
import { useIdleSignOut } from '../auth/useIdleSignOut'
import { can, type Access, type PermissionKey } from '../lib/permissions'
import { useUnreadCount } from '../lib/useUnreadCount'
import { NUCLEO_URL } from '../lib/config'
import { Brand } from './Brand'

type NavItem = { to: string; label: string; end?: boolean } & (
  | { ownerOnly: true }
  | { permission: PermissionKey }
  | { anyOf: PermissionKey[] }
  | { always: true }
)

export const MESSAGE_PERMISSIONS: PermissionKey[] = ['mensajes.ver', 'pedidos.gestionar']

const NAV: NavItem[] = [
  { to: '/', label: 'Hoy', end: true, always: true },
  { to: '/mensajes', label: 'Mensajes', anyOf: MESSAGE_PERMISSIONS },
  { to: '/personas', label: 'Personas', permission: 'personas.ver' },
  { to: '/pedidos-de-datos', label: 'Pedidos de datos', permission: 'derechos.gestionar' },
  { to: '/emails', label: 'Emails', anyOf: MESSAGE_PERMISSIONS },
  { to: '/retencion', label: 'Retención', permission: 'personas.borrar' },
  { to: '/configuracion', label: 'Configuración', permission: 'configuracion.editar' },
]

export function visibleNav(access: Access): NavItem[] {
  return NAV.filter((item) => {
    if ('always' in item) return true
    if ('ownerOnly' in item) return access.isOwner
    if ('anyOf' in item) return item.anyOf.some((p) => can(access, p))
    return can(access, item.permission)
  })
}

export const IDLE_NOTICE = 'Cerramos tu sesión porque pasó una hora sin actividad.'

export function AppLayout() {
  const { member, access } = useMember()
  const { signOut } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const unread = useUnreadCount(MESSAGE_PERMISSIONS.some((p) => can(access, p)))

  const onIdle = useCallback(() => void signOut(IDLE_NOTICE), [signOut])
  useIdleSignOut(onIdle)

  // Al cambiar de pantalla, lleva el foco al título: quien usa lector de pantalla escucha dónde está.
  useEffect(() => {
    const title = document.querySelector<HTMLElement>('[data-page-title]')
    title?.focus()
  }, [location.pathname])

  return (
    <div className="app">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="topbar">
        <Brand size={24} />
        <button
          type="button"
          className="icon-btn"
          aria-expanded={menuOpen}
          aria-controls="menu-principal"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="visually-hidden">{menuOpen ? 'Cerrar menú' : 'Abrir menú'}</span>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            {menuOpen ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </header>

      <aside
        id="menu-principal"
        className={menuOpen ? 'sidebar is-open' : 'sidebar'}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setMenuOpen(false)
        }}
      >
        <div className="sidebar-brand">
          <Brand />
        </div>
        <nav aria-label="Secciones del CRM">
          <ul className="nav-list">
            {visibleNav(access).map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className="nav-link" onClick={() => setMenuOpen(false)}>
                  {item.label}
                  {item.to === '/mensajes' && unread > 0 && (
                    <span className="nav-badge">
                      {unread > 99 ? '99+' : unread}
                      <span className="visually-hidden"> sin leer</span>
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <p className="sidebar-user">
            <span className="sidebar-user-name">{member.displayName || member.email}</span>
            <span className="sidebar-user-role">{member.isOwner ? 'Propietaria' : (member.roleName ?? 'Sin rol')}</span>
          </p>
          {member.isOwner && (
            <a className="sidebar-admin-link" href={NUCLEO_URL} target="_blank" rel="noopener noreferrer">
              Administrar en Núcleo <span aria-hidden="true">↗</span>
              <span className="visually-hidden"> (se abre en otra pestaña)</span>
            </a>
          )}
          <button type="button" className="btn btn-outline btn-sm btn-block" onClick={() => void signOut()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main id="contenido" className="main">
        <Outlet />
      </main>
    </div>
  )
}
