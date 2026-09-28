import { renderHook } from '@testing-library/react'
import { useIdleSignOut } from './useIdleSignOut'

describe('useIdleSignOut', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('cierra la sesión después del tiempo sin actividad', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleSignOut(onIdle, 1, 1000))
    vi.advanceTimersByTime(59_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)
    expect(onIdle).toHaveBeenCalled()
  })

  it('la actividad reinicia la cuenta', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleSignOut(onIdle, 1, 1000))
    vi.advanceTimersByTime(50_000)
    window.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(50_000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
