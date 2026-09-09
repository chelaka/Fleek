import { useEffect, useState } from 'react'
import { platform } from '@/platform'

/**
 * An object URL for a stored original, for as long as it is on screen.
 *
 * Full-resolution images used to be displayable straight from the URL the
 * uploader handed back. Now that nothing is uploaded, showing one means
 * reading the bytes off this machine and minting an object URL -- and an
 * object URL is a manual allocation, so the revoke is the whole point of
 * this hook existing rather than the fetch.
 *
 * Returns null while loading, and null if the original is gone. Callers
 * render the same empty state for both, because to the person looking at it
 * there is no difference.
 */
export function useStoredImage(kind: 'garment' | 'photo', id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setUrl(null)
      return
    }

    let objectUrl: string | null = null
    let cancelled = false

    void (async () => {
      try {
        const blob = await platform.getImage(kind, id)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        // A missing original is not worth an alarm here: the library row that
        // owns it will say so when it is actually used.
        if (!cancelled) setUrl(null)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [kind, id])

  return url
}
