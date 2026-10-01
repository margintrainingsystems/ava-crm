// Invitaciones al Campus (repo ava-campus). La Edge Function campus-acceso crea la cuenta del
// alumno y le manda el email; la base revisa que quien invita tenga "Gestionar suscripciones".
// El acceso a los cursos no depende de la invitación: lo da la suscripción.
import { supabase } from './supabase'

export const CAMPUS_URL = 'https://ava-campus.netlify.app'

export type CampusLocale = 'es' | 'en' | 'pt'

export const CAMPUS_LOCALE_LABEL: Record<CampusLocale, string> = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
}

export type CampusInviteResult = { estado: 'invitada' | 'ya_tiene_cuenta' }

export async function inviteToCampus(subscriptionId: string, locale: CampusLocale): Promise<CampusInviteResult> {
  const { data, error } = await supabase.functions.invoke('campus-acceso', {
    body: { action: 'invitar', subscription_id: subscriptionId, locale },
  })
  if (error) {
    let message = 'No hubo respuesta del Campus. Probá de nuevo en unos minutos.'
    try {
      const context = (error as { context?: Response }).context
      if (context && typeof context.json === 'function') {
        const payload = (await context.json()) as { mensaje?: string }
        if (payload.mensaje) message = payload.mensaje
      }
    } catch {
      // La respuesta no era JSON: queda el mensaje general.
    }
    throw new Error(message)
  }
  return data as CampusInviteResult
}

export function campusInviteText(result: CampusInviteResult): string {
  return result.estado === 'ya_tiene_cuenta'
    ? 'Ya tenía cuenta en AVA: entra al Campus con su contraseña de siempre.'
    : 'Le mandamos la invitación al Campus por email.'
}
