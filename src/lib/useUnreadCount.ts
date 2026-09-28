import { useEffect, useState } from 'react'
import { fetchUnreadCount, MESSAGES_CHANGED_EVENT } from './crm'

// Mensajes sin leer para el menú. Se actualiza cada minuto y cuando alguien cambia un mensaje.
export function useUnreadCount(enabled: boolean, everyMs = 60_000): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let active = true
    const load = () => {
      fetchUnreadCount()
        .then((n) => {
          if (active) setCount(n)
        })
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, everyMs)
    window.addEventListener(MESSAGES_CHANGED_EVENT, load)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener(MESSAGES_CHANGED_EVENT, load)
    }
  }, [enabled, everyMs])

  return enabled ? count : 0
}
