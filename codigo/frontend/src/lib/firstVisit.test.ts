import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasSeenIntro, markIntroSeen } from './firstVisit'

describe('hasSeenIntro / markIntroSeen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false until the flag is marked, then true', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
    expect(hasSeenIntro()).toBe(false)
    markIntroSeen()
    expect(hasSeenIntro()).toBe(true)
  })

  it('fails closed (false, no throw) when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(hasSeenIntro()).toBe(false)
    expect(() => markIntroSeen()).not.toThrow()
  })

  it('is false when localStorage is unavailable entirely', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(hasSeenIntro()).toBe(false)
    expect(() => markIntroSeen()).not.toThrow()
  })
})
