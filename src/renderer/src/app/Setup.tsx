import { useEffect, useRef, useState } from 'react'
import { platform } from '@/platform'
import { motion } from 'motion/react'
import { Key, VideoCamera } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { SelectField, TextField } from '@/ui/Field'
import { useCamera } from '@/features/camera/useCamera'
import { testApiKey } from '@/features/session/client'
import { useStore } from './store'

type TestResult = { state: 'idle' } | { state: 'busy' } | { state: 'done'; ok: boolean; message: string }

/** Both fields are required before the mirror unlocks. */
export function Setup({ onDone }: { onDone: () => void }): JSX.Element {
  const { settings, hasApiKey, updateSettings, setApiKey } = useStore()
  const [key, setKey] = useState('')
  const [test, setTest] = useState<TestResult>({ state: 'idle' })
  const camera = useCamera(settings.cameraDeviceId)
  const previewRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = camera.stream
  }, [camera.stream])

  const keyReady = hasApiKey || key.trim().length > 0
  const canOpen = keyReady && camera.stream !== null

  const runTest = async (): Promise<void> => {
    setTest({ state: 'busy' })
    const candidate = key.trim() || (await platform.getApiKey()) || ''
    const result = await testApiKey(candidate)
    setTest({
      state: 'done',
      ok: result.ok,
      message: result.ok ? 'Decart accepted the key.' : result.message
    })
  }

  const open = async (): Promise<void> => {
    if (key.trim()) await setApiKey(key.trim())
    onDone()
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-glass-000 px-4 py-6 sm:px-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24 }}
        className="flex w-full max-w-[480px] flex-col gap-5 sm:gap-6"
      >
        <h1 className="text-20 font-medium text-glass-900 sm:text-24">
          Two things and you&rsquo;re set.
        </h1>

        <div className="flex flex-col gap-3">
          <TextField
            label="Decart API key"
            type="password"
            icon={<Key size={20} />}
            autoComplete="off"
            spellCheck={false}
            placeholder={hasApiKey ? 'Stored. Type to replace it.' : 'Paste your key from decart.ai'}
            value={key}
            onChange={(e) => {
              setKey(e.currentTarget.value)
              setTest({ state: 'idle' })
            }}
            hint={
              platform.can.secureKeyStorage
                ? 'Encrypted on this machine with Windows credential storage.'
                : 'Your key stays in this browser and is sent only to Decart.'
            }
          />
          <div className="flex items-center gap-4">
            <Button variant="secondary" onClick={() => void runTest()} disabled={test.state === 'busy' || !keyReady}>
              {test.state === 'busy' ? 'Testing' : 'Test connection'}
            </Button>
            {test.state === 'done' ? (
              <span className={'text-12 ' + (test.ok ? 'text-glass-600' : 'text-alarm-700')}>
                {test.message}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <SelectField
            label="Camera"
            icon={<VideoCamera size={20} />}
            value={settings.cameraDeviceId}
            error={camera.error}
            onChange={(e) => void updateSettings({ cameraDeviceId: e.currentTarget.value })}
          >
            <option value="">System default</option>
            {camera.devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </SelectField>

          <div className="relative h-24 w-full overflow-hidden rounded border border-glass-200 bg-stage-000">
            <video
              ref={previewRef}
              autoPlay
              playsInline
              muted
              className="mirrored h-full w-full object-cover"
            />
            {!camera.stream ? (
              <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-12 text-stage-600">
                {camera.opening ? 'Opening the camera' : (camera.error ?? 'No preview')}
              </div>
            ) : null}
          </div>

          {camera.blockedByOs ? (
            <div className="flex items-center gap-4">
              {platform.can.osCameraSettings ? (
                <Button variant="secondary" onClick={() => void platform.openCameraPrivacySettings()}>
                  Open camera privacy settings
                </Button>
              ) : null}
              <Button variant="ghost" onClick={camera.retry}>
                Try again
              </Button>
            </div>
          ) : null}
        </div>

        <div>
          <Button variant="primary" disabled={!canOpen} onClick={() => void open()}>
            Open the mirror
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
