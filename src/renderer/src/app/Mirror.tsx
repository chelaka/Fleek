import { useEffect, useMemo, useRef, useState } from 'react'
import { platform } from '@/platform'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Camera, Gear, ImageSquare, Person, Record, Sparkle, Stop } from '@phosphor-icons/react'
import type { FitMode } from '@shared/types'
import { Button, IconButton } from '@/ui/Button'
import { StatusDot } from '@/ui/StatusDot'
import { useToast } from '@/ui/Toast'
import { useCamera } from '@/features/camera/useCamera'
import { GarmentTray } from '@/features/garments/GarmentTray'
import { IntakeSheet } from '@/features/garments/IntakeSheet'
import { ModelSheet } from '@/features/models/ModelSheet'
import { SessionHud } from '@/features/session/SessionHud'
import { Wipe } from '@/features/session/Wipe'
import { formatCost } from '@/features/session/machine'
import { useSession } from '@/features/session/useSession'
import { describeSkipped, planStill } from '@/features/generate/fashn'
import { useGeneration } from '@/features/generate/useGeneration'
import { useCapture } from '@/features/capture/useCapture'
import { SettingsSheet } from './SettingsSheet'
import { useStore } from './store'

/**
 * Two ways to see a garment on yourself, sharing one tray.
 *
 * The mirror is the confirming tool: it costs $0.02 a second and shows real
 * drape on a moving body. Photo mode is the browsing tool: a still costs a
 * fixed $0.075 per garment and the clock is not running while you decide.
 * Everything above the mode switch -- the library, the slots, the tray -- is
 * the same in both, because what you are choosing between is how to look,
 * not what to look at.
 */
export function Mirror(): JSX.Element {
  const {
    settings,
    garments,
    activeBySlot,
    activeGarments,
    toggleGarment,
    addGarment,
    removeGarment,
    modelPhotos,
    activePhoto,
    pickModelPhoto,
    addModelPhoto,
    removeModelPhoto
  } = useStore()
  const toast = useToast()
  const reduced = useReducedMotion()

  const camera = useCamera(settings.cameraDeviceId)
  const session = useSession({
    localStream: camera.stream,
    capSeconds: settings.capSeconds,
    promptOverride: settings.promptOverride
  })
  const generation = useGeneration()
  const capture = useCapture()

  const localRef = useRef<HTMLVideoElement>(null)
  const outputRef = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<FitMode>('live')
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [photosOpen, setPhotosOpen] = useState(false)
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

  // A failed generation says what happened and what it cost, since a run that
  // fell over on the third garment has still paid for the first two.
  useEffect(() => {
    if (generation.status !== 'failed' || !generation.error) return
    toast.say(
      generation.error + (generation.spent > 0 ? ' Billed ' + formatCost(generation.spent) + '.' : ''),
      'alarm'
    )
  }, [generation.status, generation.error, generation.spent, toast])

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

  // What is worn has changed, so the still on screen is of something else.
  useEffect(() => {
    generation.discard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wornKey])

  /** What photo mode would actually generate, and what it would leave out. */
  const plan = useMemo(() => planStill(activeGarments), [activeGarments])
  const skippedNote = describeSkipped(plan.skipped)

  const still = mode === 'still'
  const working = generation.status === 'working'

  const primaryDisabled = still
    ? plan.steps.length === 0 || !activePhoto || working
    : activeGarments.length === 0 || !camera.stream || session.state.status === 'closing'

  // The price is on the button, because the whole point of photo mode is
  // that you can see what looking will cost before you look.
  const primaryLabel = still
    ? working
      ? 'Generating'
      : plan.steps.length > 0
        ? 'Generate ' + formatCost(plan.cost)
        : 'Generate'
    : session.active
      ? 'Stop fitting'
      : 'Start fitting'

  const primaryHint = still
    ? activeGarments.length === 0
      ? 'Pick a garment first.'
      : !activePhoto
        ? 'Add a photo of yourself first.'
        : plan.steps.length === 0
          ? skippedNote
          : undefined
    : activeGarments.length === 0
      ? 'Pick a garment first.'
      : !camera.stream
        ? 'The camera is not open.'
        : undefined

  const showOutput = !still && session.remoteStream !== null && session.billing
  const showResult = still && generation.imageUrl !== null

  const stageLine = still
    ? working
      ? generation.progress
        ? 'Wearing ' + generation.progress.step + ' of ' + generation.progress.total + '.'
        : 'Generating.'
      : !activePhoto
        ? 'Add a photo of yourself to generate onto.'
        : activeGarments.length === 0
          ? 'Pick a garment, then generate.'
          : 'Generate to see it on.'
    : camera.error
      ? camera.error
      : session.status === 'connecting'
        ? 'Opening the mirror.'
        : garments.length === 0
          ? 'Drop a garment photo here.'
          : 'Pick a garment, then start fitting.'

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
            (showOutput || still ? 'opacity-0' : 'opacity-60')
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

        {/* Photo mode. The stored photo stands in for the live preview, and
            the generated still replaces it the way the model's frames
            replace the webcam. `contain` rather than `cover`: a photo is a
            fixed frame and cropping it hides the shoes. */}
        {still ? (
          <div className="absolute inset-0 flex items-center justify-center">
            {activePhoto ? (
              <img
                src={showResult ? (generation.imageUrl ?? '') : activePhoto.remoteUrl}
                alt={showResult ? 'The generated try-on' : 'The photo stills are generated onto'}
                className={
                  'h-full w-full object-contain transition-opacity duration-300 ' +
                  (showResult ? 'opacity-100' : 'opacity-40')
                }
              />
            ) : null}
          </div>
        ) : null}

        <Wipe trigger={session.wipeKey} />

        {!showOutput && !showResult ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center sm:px-12">
            <p data-face="display" className="text-20 text-stage-900 sm:text-32">
              {stageLine}
            </p>
          </div>
        ) : null}

        {/* What a still cannot wear is said before it is generated, not after
            it comes back missing a hat. */}
        {still && skippedNote && !working ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
            <p className="rounded bg-glass-100 px-3 py-2 text-12 text-bulb-700 shadow-hud">
              {skippedNote}
            </p>
          </div>
        ) : null}

        {camera.blockedByOs && platform.can.osCameraSettings && !still ? (
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
        <ModelSheet
          open={photosOpen}
          onClose={() => setPhotosOpen(false)}
          localStream={camera.stream}
          photos={modelPhotos}
          activeId={activePhoto?.id ?? ''}
          onPick={(id) => void pickModelPhoto(id)}
          onAdd={addModelPhoto}
          onRemove={(id) => void removeModelPhoto(id)}
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
          <ModeSwitch mode={mode} onChange={setMode} locked={session.active} />

          {still ? (
            <IconButton
              aria-label="Photos of you"
              icon={<Person size={20} weight={activePhoto ? 'fill' : 'regular'} />}
              variant="secondary"
              onClick={() => setPhotosOpen(true)}
            />
          ) : null}

          <Button
            className="flex-1 sm:flex-none"
            variant={session.active ? 'secondary' : 'primary'}
            disabled={primaryDisabled}
            title={primaryHint}
            onClick={() => {
              if (still) {
                if (activePhoto) void generation.generate(activePhoto, activeGarments)
              } else if (session.active) {
                session.stop()
              } else if (activeGarments.length > 0) {
                void session.start(activeGarments)
              }
            }}
            icon={
              still ? (
                <Sparkle size={20} weight="fill" />
              ) : session.active ? (
                <Stop size={20} weight="fill" />
              ) : (
                <Record size={20} weight="fill" />
              )
            }
          >
            {primaryLabel}
          </Button>

          <IconButton
            aria-label={still ? 'Save this image' : 'Capture a still'}
            icon={still ? <ImageSquare size={20} /> : <Camera size={20} />}
            variant="secondary"
            disabled={still ? !showResult : !session.billing}
            onClick={() =>
              still ? void capture.save(generation.imageUrl) : void capture.capture(outputRef.current)
            }
          />
        </div>
      </footer>
    </div>
  )
}

/**
 * Which mirror the primary action drives. Locked while a live session is
 * running: switching away would leave a paid connection open behind a UI
 * that no longer mentions it.
 */
function ModeSwitch({
  mode,
  onChange,
  locked
}: {
  mode: FitMode
  onChange: (mode: FitMode) => void
  locked: boolean
}): JSX.Element {
  const options: { id: FitMode; label: string }[] = [
    { id: 'live', label: 'Mirror' },
    { id: 'still', label: 'Photo' }
  ]

  return (
    <div
      className="flex flex-none items-center gap-1 rounded-full bg-glass-200 p-1"
      role="radiogroup"
      aria-label="How to try it on"
    >
      {options.map((option) => {
        const selected = option.id === mode
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={locked && !selected}
            title={locked && !selected ? 'Stop the session first.' : undefined}
            onClick={() => onChange(option.id)}
            className={
              'h-8 rounded-full px-4 text-12 font-medium transition-colors disabled:cursor-not-allowed disabled:text-glass-400 ' +
              (selected ? 'bg-glass-000 text-glass-900' : 'text-glass-600 hover:text-glass-900')
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
