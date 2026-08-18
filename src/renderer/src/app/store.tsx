import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { platform } from '@/platform'
import {
  DEFAULT_SETTINGS,
  slotOrder,
  type AppState,
  type GarmentInput,
  type GarmentWithThumb,
  type Settings,
  type SlotId
} from '@shared/types'

interface Store {
  ready: boolean
  settings: Settings
  hasApiKey: boolean
  appVersion: string
  garments: GarmentWithThumb[]
  /** One active garment per slot. Absent means that slot is empty. */
  activeBySlot: Partial<Record<SlotId, string>>
  /** Everything currently worn, ordered head-down. */
  activeGarments: GarmentWithThumb[]
  /** Picking a garment fills its own slot, replacing whatever was there. */
  toggleGarment: (garment: GarmentWithThumb) => void
  clearSlot: (slot: SlotId) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  acceptConsent: () => Promise<void>
  setApiKey: (key: string) => Promise<void>
  addGarment: (input: GarmentInput) => Promise<GarmentWithThumb>
  removeGarment: (id: string) => Promise<void>
  reset: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore called outside StoreProvider')
  return store
}

/**
 * One place that talks to the main process, so no component has to know
 * whether a value lives on disk, in the OS credential store, or in memory.
 */
export function StoreProvider({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [garments, setGarments] = useState<GarmentWithThumb[]>([])
  const [activeBySlot, setActiveBySlot] = useState<Partial<Record<SlotId, string>>>({})

  useEffect(() => {
    async function load(): Promise<void> {
      const state: AppState = await platform.getState()
      setSettings(state.settings)
      setHasApiKey(state.hasApiKey)
      setAppVersion(state.appVersion)
      const list = await platform.listGarments()
      setGarments(list)
      // Whatever was worn most recently is the obvious thing to try again.
      const newest = list[0]
      if (newest) setActiveBySlot({ [newest.slot]: newest.id })
      setReady(true)
    }
    void load()
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Settings>): Promise<void> => {
    setSettings(await platform.updateSettings(patch))
  }, [])

  const acceptConsent = useCallback(async (): Promise<void> => {
    setSettings(await platform.acceptConsent())
  }, [])

  const setApiKey = useCallback(async (key: string): Promise<void> => {
    await platform.setApiKey(key)
    setHasApiKey(key.trim().length > 0)
  }, [])

  const addGarment = useCallback(async (input: GarmentInput): Promise<GarmentWithThumb> => {
    const garment = await platform.addGarment(input)
    setGarments((current) => [garment, ...current])
    // A garment you just added is the one you want to see, so it takes its slot.
    setActiveBySlot((current) => ({ ...current, [garment.slot]: garment.id }))
    return garment
  }, [])

  const removeGarment = useCallback(async (id: string): Promise<void> => {
    await platform.removeGarment(id)
    setGarments((current) => current.filter((g) => g.id !== id))
    setActiveBySlot((current) => {
      const next = { ...current }
      for (const [slot, activeId] of Object.entries(next)) {
        if (activeId === id) delete next[slot as SlotId]
      }
      return next
    })
  }, [])

  const reset = useCallback(async (): Promise<void> => {
    await platform.reset()
    const state = await platform.getState()
    setSettings(state.settings)
    setHasApiKey(false)
    setGarments([])
    setActiveBySlot({})
  }, [])

  /** Clicking the active garment in a slot takes it off; anything else swaps it in. */
  const toggleGarment = useCallback((garment: GarmentWithThumb): void => {
    setActiveBySlot((current) =>
      current[garment.slot] === garment.id
        ? Object.fromEntries(Object.entries(current).filter(([slot]) => slot !== garment.slot))
        : { ...current, [garment.slot]: garment.id }
    )
  }, [])

  const clearSlot = useCallback((slot: SlotId): void => {
    setActiveBySlot((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== slot))
    )
  }, [])

  const activeGarments = useMemo(
    () =>
      Object.values(activeBySlot)
        .map((id) => garments.find((g) => g.id === id))
        .filter((g): g is GarmentWithThumb => g !== undefined)
        .sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot)),
    [garments, activeBySlot]
  )

  const value = useMemo<Store>(
    () => ({
      ready,
      settings,
      hasApiKey,
      appVersion,
      garments,
      activeBySlot,
      activeGarments,
      toggleGarment,
      clearSlot,
      updateSettings,
      acceptConsent,
      setApiKey,
      addGarment,
      removeGarment,
      reset
    }),
    [
      ready,
      settings,
      hasApiKey,
      appVersion,
      garments,
      activeBySlot,
      activeGarments,
      toggleGarment,
      clearSlot,
      updateSettings,
      acceptConsent,
      setApiKey,
      addGarment,
      removeGarment,
      reset
    ]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
