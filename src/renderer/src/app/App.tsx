import { useState } from 'react'
import { ToastHost } from '@/ui/Toast'
import { Consent } from './Consent'
import { Mirror } from './Mirror'
import { Setup } from './Setup'
import { StoreProvider, useStore } from './store'

/**
 * Three screens, in one order: consent, setup, mirror. Setup is skipped once
 * a key is stored, so the second run opens straight into the mirror.
 */
function Screens(): JSX.Element | null {
  const { ready, settings, hasApiKey } = useStore()
  const [setupDone, setSetupDone] = useState(false)

  if (!ready) return null
  if (!settings.consentAcceptedAt) return <Consent />
  if (!hasApiKey && !setupDone) return <Setup onDone={() => setSetupDone(true)} />
  return <Mirror />
}

export function App(): JSX.Element {
  return (
    <StoreProvider>
      <ToastHost>
        <div className="relative h-full w-full overflow-hidden">
          <Screens />
        </div>
      </ToastHost>
    </StoreProvider>
  )
}
