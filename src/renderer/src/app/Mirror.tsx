import { useEffect, useRef, useState } from 'react'
import { platform } from '@/platform'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Camera, Gear, Record, Stop } from '@phosphor-icons/react'
import { Button, IconButton } from '@/ui/Button'
import { StatusDot } from '@/ui/StatusDot'
import { useToast } from '@/ui/Toast'
import { useCamera } from '@/features/camera/useCamera'
import { GarmentTray } from '@/features/garments/GarmentTray'
import { IntakeSheet } from '@/features/garments/IntakeSheet'
import { SessionHud } from '@/features/session/SessionHud'
import { Wipe } from '@/features/session/Wipe'
import { useSession } from '@/features/session/useSession'
import { useCapture } from '@/features/capture/useCapture'
import { SettingsSheet } from './SettingsSheet'
import { useStore } from './store'

export function Mirror(): JSX.Element {
  const {
    settings,
    garments,
    activeBySlot,
    activeGarments,
    toggleGarment,
    addGarment,
    removeGarment
  } = useStore()
  const toast = useToast()
  const reduced = useReducedMotion()

  const camera = useCamera(settings.cameraDeviceId)
  const session = useSession({
    localStream: camera.stream,
    capSeconds: settings.capSeconds,
    promptOverride: settings.promptOverride
  })
  const capture = useCapture()

  const localRef = useRef<HTMLVideoElement>(null)
  const outputRef = useRef<HTMLVideoElement>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = camera.stream
  }, [camera.stream])

  useEffect(() => {
    if (outputRef.current) outputRef.current.srcObject = session.remoteStream
  }, [session.remoteStream])

  // Every way a session can end says so in one sentence, once.
  useEffect(() => {
    const last = session.state.last
    if (!last) return
    toast.say(last.message, last.reason === 'failed' ? 'alarm' : 'plain')
    if (last.reason === 'failed') {
      setShake(true)
      window.setTimeout(() => setShake(false), 220)
    }
  }, [session.state.last, toast])

  useEffect(() => {
    if (camera.error) toast.say(camera.error, 'alarm')
  }, [camera.error, toast])

  // Changing what is worn mid-session changes clothes rather than restarting.
  // The swap is driven by the whole worn set rather than by the click, because
  // one click can fill a slot, empty one, or replace another slot's garment.
  // useSession ignores a set it is already wearing, so re-running is free.
  const wornKey = activeGarments.map((g) => g.id).join('|')
  useEffect(() => {
    if (session.state.status !== 'live' && session.state.status !== 'degraded') return
    if (activeGarments.length === 0) return
    session.swap(activeGarments)
    // Keyed on the worn set, not on the session object, which changes identity
    // every tick of the meter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wornKey, session.state.status])

  const primaryDisabled =
    activeGarments.length === 0 || !camera.stream || session.state.status === 'closing'
  const primaryLabel = session.active ? 'Stop fitting' : 'Start fitting'
  const primaryHint =
    activeGarments.length === 0
      ? 'Pick a garment first.'
    : !camera.stream
      ? 'The camera is not open.'
      : undefined

  const showOutput = session.remoteStream !== null && session.billing

  return (
    <div className="relative flex h-full w-full flex-col bg-glass-000">
      {/* Top bar. On desktop the right end is left clear for the window
          controls; in a browser there are none, so the space is reclaimed. */}
      <header className="drag-region flex h-bar flex-none items-center justify-between border-b border-glass-200 px-4 sm:px-6">
        <span data-face="display" className="text-20 text-glass-900">
          fleek
        </span>
        <div
          className={
            'no-drag flex items-center gap-2 sm:gap-4 ' +
            (platform.kind === 'electron' ? 'pr-24' : '')
          }
        >
          <StatusDot status={session.status} />
          <IconButton
            aria-label="Settings"
            icon={<Gear size={20} weight={settingsOpen ? 'fill' : 'regular'} />}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </header>

      {/* The mirror. */}
      <main className="on-stage relative min-h-0 flex-1 overflow-hidden bg-stage-000">
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={
            'mirrored absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ' +
            (showOutput ? 'opacity-0' : 'opacity-60')
          }
        />
        <video
          ref={outputRef}
          autoPlay
          playsInline
          muted
          className={
            'mirrored absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ' +
            (showOutput ? 'opacity-100' : 'opacity-0')
          }
        />

        <Wipe trigger={session.wipeKey} />

        {!showOutput ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center sm:px-12">
            <p data-face="display" className="text-20 text-stage-900 sm:text-32">
              {camera.error
                ? camera.error
                : session.status === 'connecting'
                  ? 'Opening the mirror.'
                  : garments.length === 0
                    ? 'Drop a garment photo here.'
                    : 'Pick a garment, then start fitting.'}
            </p>
          </div>
        ) : null}

        {camera.blockedByOs && platform.can.osCameraSettings ? (
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            <Button variant="secondary" onClick={() => void platform.openCameraPrivacySettings()}>
              Open camera privacy settings
            </Button>
          </div>
        ) : null}

        {/* The shutter flash, then the still arcing into the corner. */}
        <AnimatePresence>
          {capture.flashing ? (
            <motion.div
              key="flash"
              className="pointer-events-none absolute inset-0 z-10"
              style={{ background: 'var(--flash)' }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              aria-hidden
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence onExitComplete={capture.clearFlying}>
          {capture.flying ? (
            <motion.button
              key={capture.flying.id}
              type="button"
              aria-label={
                platform.can.revealCapture ? 'Show the saved still in Explorer' : 'Saved still'
              }
              onClick={() => {
                if (platform.can.revealCapture) {
                  void platform.revealCapture(capture.flying?.filePath ?? '')
                }
              }}
              className="absolute left-1/2 top-1/2 z-10 h-16 w-16 overflow-hidden rounded border border-glass-200"
              initial={
                reduced
                  ? { opacity: 0, x: '-50%', y: '-50%' }
                  : { opacity: 1, scale: 2.5, x: '-50%', y: '-50%' }
              }
              animate={
                reduced
                  ? { opacity: 1, x: '-50%', y: '-50%' }
                  : { opacity: 1, scale: 1, left: '32px', top: 'calc(100% - 96px)', x: 0, y: 0 }
              }
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.4, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => window.setTimeout(capture.clearFlying, 1600)}
            >
              <img src={capture.flying.dataUrl} alt="" className="h-full w-full object-cover" />
            </motion.button>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {session.billing ? (
            <SessionHud
              key="hud"
              meter={session.meter}
              capSeconds={settings.capSeconds}
              shake={shake}
            />
          ) : null}
        </AnimatePresence>

        <IntakeSheet
          open={intakeOpen}
          onClose={() => setIntakeOpen(false)}
          localStream={camera.stream}
          onAdd={addGarment}
        />
        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          devices={camera.devices}
          sessionActive={session.active}
        />
      </main>

      {/* Tray. */}
      <footer className="flex flex-none flex-col gap-3 border-t border-glass-200 bg-glass-100 px-4 py-3 sm:h-tray sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-0">
        <div className="min-w-0 flex-1">
          <GarmentTray
            garments={garments}
            activeBySlot={activeBySlot}
            onToggle={toggleGarment}
            onRemove={(id) => void removeGarment(id)}
            onAdd={() => setIntakeOpen(true)}
          />
        </div>

        <div className="flex flex-none items-center gap-3 sm:gap-4">
          <Button
            className="flex-1 sm:flex-none"
            variant={session.active ? 'secondary' : 'primary'}
            disabled={primaryDisabled}
            title={primaryHint}
            onClick={() => {
              if (session.active) {
                session.stop()
              } else if (activeGarments.length > 0) {
                void session.start(activeGarments)
              }
            }}
            icon={session.active ? <Stop size={20} weight="fill" /> : <Record size={20} weight="fill" />}
          >
            {primaryLabel}
          </Button>

          <IconButton
            aria-label="Capture a still"
            icon={<Camera size={20} />}
            variant="secondary"
            disabled={!session.billing}
            onClick={() => void capture.capture(outputRef.current)}
          />
        </div>
      </footer>
    </div>
  )
}
