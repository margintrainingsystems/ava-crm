import { useEffect, useRef } from 'react'

const EVENTS = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'] as const

// Cierra la sesión después de un tiempo sin actividad. El CRM guarda datos personales:
// si alguien deja la computadora abierta, nadie más puede usarla con su cuenta.
export function useIdleSignOut(onIdle: () => void, minutes = 60, checkEveryMs = 30_000): void {
  const last = useRef(0)
  const callback = useRef(onIdle)

  useEffect(() => {
    callback.current = onIdle
  }, [onIdle])

  useEffect(() => {
    last.current = Date.now()
    const touch = () => {
      last.current = Date.now()
    }
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const timer = window.setInterval(() => {
      if (Date.now() - last.current >= minutes * 60_000) callback.current()
    }, checkEveryMs)
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch))
      window.clearInterval(timer)
    }
  }, [minutes, checkEveryMs])
}
