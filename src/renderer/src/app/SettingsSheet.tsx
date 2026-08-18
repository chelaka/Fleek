import { useState } from 'react'
import { platform } from '@/platform'
import { FolderOpen, Key, VideoCamera } from '@phosphor-icons/react'
import {
  CAP_MAX_SECONDS,
  CAP_MIN_SECONDS,
  COST_PER_SECOND,
  DEFAULT_PROMPT
} from '@shared/types'
import { Button } from '@/ui/Button'
import { SelectField, SliderField, TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/Toast'
import type { CameraDevice } from '@/features/camera/useCamera'
import { testApiKey } from '@/features/session/upload'
import { useStore } from './store'

export interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  devices: CameraDevice[]
  /** Settings that would disturb a running session are locked while it runs. */
  sessionActive: boolean
}

export function SettingsSheet({
  open,
  onClose,
  devices,
  sessionActive
}: SettingsSheetProps): JSX.Element {
  const { settings, hasApiKey, appVersion, updateSettings, setApiKey, reset } = useStore()
  const toast = useToast()
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const capCost = (settings.capSeconds * COST_PER_SECOND).toFixed(2)

  const saveKey = async (): Promise<void> => {
    if (!key.trim()) return
    await setApiKey(key.trim())
    setKey('')
    toast.say('Key saved.')
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    const candidate = key.trim() || (await platform.getApiKey()) || ''
    const result = await testApiKey(candidate)
    setTesting(false)
    toast.say(result.ok ? 'fal accepted the key.' : result.message, result.ok ? 'plain' : 'alarm')
  }

  const pickFolder = async (): Promise<void> => {
    const dir = await platform.pickCaptureDir()
    if (dir) await updateSettings({ captureDir: dir })
  }

  return (
    <Sheet open={open} title="Settings" onClose={onClose} size="settings">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <TextField
            label="fal API key"
            type="password"
            icon={<Key size={20} />}
            autoComplete="off"
            spellCheck={false}
            placeholder={hasApiKey ? 'Stored. Type to replace it.' : 'Paste your key from fal.ai'}
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            hint={
              platform.can.secureKeyStorage
                ? 'Encrypted at rest with Windows credential storage. Anyone signed in to this Windows account can read it back through Fleek, so treat it as yours, not as a secret.'
                : 'Your key stays in this browser and is sent only to fal. It is kept in localStorage, which any script on this page could read — so use a key scoped to API access, and clear it with Reset when you are done.'
            }
          />
          <div className="flex gap-4">
            <Button variant="secondary" onClick={() => void saveKey()} disabled={!key.trim()}>
              Save key
            </Button>
            <Button variant="ghost" onClick={() => void runTest()} disabled={testing}>
              {testing ? 'Testing' : 'Test connection'}
            </Button>
          </div>
        </div>

        <SelectField
          label="Camera"
          icon={<VideoCamera size={20} />}
          value={settings.cameraDeviceId}
          disabled={sessionActive}
          hint={sessionActive ? 'Stop the session to change camera.' : undefined}
          onChange={(e) => void updateSettings({ cameraDeviceId: e.currentTarget.value })}
        >
          <option value="">System default</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </SelectField>

        <SliderField
          label="Session cap"
          min={CAP_MIN_SECONDS}
          max={CAP_MAX_SECONDS}
          step={10}
          value={settings.capSeconds}
          readout={settings.capSeconds + 's  ·  $' + capCost}
          hint="Fleek closes the session itself at this point, and says so."
          onChange={(value) => void updateSettings({ capSeconds: value })}
        />

        <div className="flex flex-col gap-2">
          <span className="text-12 font-medium uppercase tracking-wide text-glass-600">
            Captures
          </span>
          <div className="flex items-center gap-3">
            <span className="flex-1 truncate font-mono text-12 text-glass-900">
              {settings.captureDir}
            </span>
            {platform.can.pickCaptureDir ? (
              <Button variant="secondary" icon={<FolderOpen size={20} />} onClick={() => void pickFolder()}>
                Change
              </Button>
            ) : null}
          </div>
        </div>

        <TextField
          label="Advanced: prompt override"
          placeholder={DEFAULT_PROMPT}
          value={settings.promptOverride}
          spellCheck={false}
          onChange={(e) => void updateSettings({ promptOverride: e.currentTarget.value })}
          hint="Leave this empty unless you know what the model does with it. Takes effect on the next session."
        />

        <div className="flex flex-col gap-3 border-t border-glass-200 pt-4">
          {confirmReset ? (
            <>
              <p className="text-14 text-glass-900">
                This clears your API key, your garment library, and your consent. Stills you have
                already saved are left alone.
              </p>
              <div className="flex gap-4">
                <Button
                  variant="danger"
                  onClick={() => {
                    void reset()
                    onClose()
                  }}
                >
                  Reset Fleek
                </Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  Keep everything
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-mono text-12 text-glass-400">fleek {appVersion}</span>
              <Button variant="danger" onClick={() => setConfirmReset(true)} disabled={sessionActive}>
                Reset Fleek
              </Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
