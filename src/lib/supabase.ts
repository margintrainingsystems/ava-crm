import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Revisá el archivo .env.')
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Borra del navegador las claves de sesión de Supabase (empiezan con "sb-"), igual que Núcleo.
export function clearStoredSession(storage: Storage = window.localStorage): void {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k?.startsWith('sb-')) keys.push(k)
  }
  keys.forEach((k) => storage.removeItem(k))
}
