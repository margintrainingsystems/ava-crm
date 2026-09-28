import { supabase } from './supabase'
import type { Permission } from './permissions'

export async function fetchPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase
    .from('crm_permissions')
    .select('key, area, label, description, sort_order')
    .order('sort_order')
  if (error) throw error
  return data
}
