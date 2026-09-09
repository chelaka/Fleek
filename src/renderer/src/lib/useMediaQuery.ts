import { useEffect, useState } from 'react'

/**
 * Whether a CSS media query matches, and keeps matching as the window moves.
 *
 * Tailwind covers everything CSS can decide on its own. This exists for the
 * handful of places where JavaScript has to make the same call -- a sheet
 * that slides up from the bottom of a phone but scales into the middle of a
 * desktop is one animation or the other, and no class can choose between two
 * sets of keyframes.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = (): void => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** The `sm` breakpoint, which is where the layout stops being a phone. */
export const WIDE = '(min-width: 640px)'
