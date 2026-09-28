import { memberState, type MemberStatus } from './team'
import type { TeamMember } from './queries'

const member: TeamMember = {
  userId: 'u2',
  email: 'ana@example.com',
  displayName: 'Ana',
  isOwner: false,
  active: true,
  roleId: 'r1',
  createdAt: '2026-09-28T12:00:00Z',
}

const pending: MemberStatus = { user_id: 'u2', invitada_el: '2026-09-28T12:00:00Z', confirmada: false, ultimo_ingreso: null }

describe('memberState', () => {
  it('distingue propietaria, desactivada, pendiente y activa', () => {
    expect(memberState({ ...member, isOwner: true }, undefined, true)).toBe('propietaria')
    expect(memberState({ ...member, active: false }, pending, true)).toBe('desactivada')
    expect(memberState(member, pending, true)).toBe('pendiente')
    expect(memberState(member, { ...pending, confirmada: true, ultimo_ingreso: '2026-09-29T10:00:00Z' }, true)).toBe(
      'activa',
    )
  })

  it('no inventa un estado si no pudo consultar las invitaciones', () => {
    expect(memberState(member, undefined, false)).toBe('desconocido')
  })
})
