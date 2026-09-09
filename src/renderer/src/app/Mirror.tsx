import { useEffect, useMemo, useRef, useState } from 'react'
import { platform } from '@/platform'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Camera,
  Gear,
  ImageSquare,
  Person,
  Record,
  Sparkle,
  Stop,
  TShirt
} from '@phosphor-icons/react'
import type { FitMode, SlotId } from '@shared/types'
import { Button, IconButton } from '@/ui/Button'
import { StatusDot } from '@/ui/StatusDot'
import { useToast } from '@/ui/Toast'
import { useCamera } from '@/features/camera/useCamera'
import { Wardrobe } from '@/features/garments/Wardrobe'
import { IntakeSheet } from '@/features/garments/IntakeSheet'
import { ModelSheet } from '@/features/models/ModelSheet'
import { SessionHud } from '@/features/session/SessionHud'
import { Wipe } from '@/features/session/Wipe'
import { formatCost } from '@/features/session/machine'
import { useSession } from '@/features/session/useSession'
import { planStill } from '@/features/generate/still'
import { useGeneration } from '@/features/generate/useGeneration'
import { useCapture } from '@/features/capture/useCapture'
import { decidePresence, describePresence } from '@/features/presence/presence'
import { usePresence } from '@/features/presence/usePresence'
import { useStoredImage } from '@/lib/useStoredImage'
import { SettingsSheet } from './SettingsSheet'
import { useStore } from './store'

/**
 * Two ways to see a garment on yourself, sharing one wardrobe.
 *
 * The mirror is the confirming tool: it costs $0.02 a second and shows real
 * drape on a moving body. Photo mode is the browsing tool: a still costs a
 * fixed $0.02 per garment and the clock is not running while you decide.
 * What you are choosing between is how to look, not what to look at, so the
 * wardrobe is the same in both.
 *
 * The reflection now fills the whole frame and every control floats on it as
 * a panel of light glass, because in a mirror app the reflection is the
 * product and any chrome that pushes it smaller is charging rent.
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
  const generation = useGeneration({ mode: settings.stillMode })
  const capture = useCapture()

  const localRef = useRef<HTMLVideoElement>(null)
  const outputRef = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<FitMode>('live')
  const [intakeSlot, setIntakeSlot] = useState<SlotId | undefined>(undefined)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [photosOpen, setPhotosOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wardrobeOpen, setWardrobeOpen] = useState(true)
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


  /** What photo mode would generate, and what it would cost. */
  const plan = useMemo(() => planStill(activeGarments), [activeGarments])

  // The photo is on this machine now rather than at a URL, so showing it
  // means reading the bytes back and holding an object URL while it is up.
  const photoUrl = useStoredImage('photo', activePhoto?.id ?? null)

  const still = mode === 'still'
  const working = generation.status === 'working'

  const primaryDisabled = still
    ? plan.steps.length === 0 || !activePhoto || working
    : activeGarments.length === 0 || !camera.stream || session.state.status === 'closing'

  /**
   * Whether the camera is watching for a person, and what it may do about it.
   *
   * Only in the live mirror: photo mode dresses a stored photograph, so
   * whether anyone is in front of the webcam is beside the point -- and
   * running a detector there would be spending CPU to answer a question
   * nobody asked.
   */
  const presenceOn = !still && settings.presenceMode !== 'manual'
  const presence = usePresence(camera.stream, presenceOn)
  const presenceLine = describePresence(
    still ? 'manual' : settings.presenceMode,
    presence.signal.seen,
    session.active,
    presence.ready
  )

  // Presence detection says nothing until it has failed, and then says it
  // once -- a missing model must not leave the mirror silently on manual.
  useEffect(() => {
    if (presence.error) toast.say(presence.error, 'alarm')
  }, [presence.error, toast])

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
        : undefined
    : activeGarments.length === 0
      ? 'Pick a garment first.'
      : !camera.stream
        ? 'The camera is not open.'
        : undefined

  /**
   * Acting on what the camera sees.
   *
   * Kept in a ref and driven by one interval, rather than an effect keyed on
   * the signal: the thresholds are elapsed-time, so a signal that has not
   * changed for four seconds still becomes actionable on its own. The ref
   * keeps the closure fresh without rebuilding the timer every render.
   */
  const actOnPresenceRef = useRef<() => void>(() => undefined)
  actOnPresenceRef.current = () => {
    const action = decidePresence({
      mode: settings.presenceMode,
      signal: presence.signal,
      active: session.active,
      // The same conditions the button enforces. Presence is allowed to press
      // it, never to bypass what it is guarding.
      canStart: !primaryDisabled && session.state.status === 'idle',
      at: Date.now()
    })

    if (action === 'start') void session.start(activeGarments)
    else if (action === 'stop') session.stop()
  }

  useEffect(() => {
    if (!presenceOn || !presence.ready) return
    const id = window.setInterval(() => actOnPresenceRef.current(), 500)
    return () => window.clearInterval(id)
  }, [presenceOn, presence.ready])

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
          ? 'Add a garment to get started.'
          : // What the camera is waiting for outranks the generic instruction,
            // since in Auto it is the thing that will actually start the mirror.
            (presenceLine ?? 'Pick a garment, then start fitting.')

  function openIntake(slot?: SlotId): void {
    setIntakeSlot(slot)
    setIntakeOpen(true)
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-glass-000 sm:p-4">
      {/* On desktop the window is frameless, so the strip the native controls
          live in doubles as the drag handle. A browser has none, and reclaims
          the space for the mirror. */}
      {platform.kind === 'electron' ? <div className="drag-region h-bar flex-none" /> : null}

      {/* The mirror. Everything else in this component floats on top of it. */}
      <main className="on-stage relative min-h-0 w-full flex-1 overflow-hidden bg-stage-000 sm:rounded-sheet sm:shadow-stage">
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
                src={showResult ? (generation.imageUrl ?? '') : (photoUrl ?? '')}
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

        {/* Light chrome over moving video needs ground under it. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: 'var(--stage-shade-top)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{ background: 'var(--stage-shade-bottom)' }}
          aria-hidden
        />

        {!showOutput && !showResult ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center sm:px-12">
            <p data-face="display" className="text-20 text-stage-900 sm:text-32">
              {stageLine}
            </p>
            {camera.blockedByOs && platform.can.osCameraSettings && !still ? (
              <Button
                className="pointer-events-auto"
                variant="secondary"
                onClick={() => void platform.openCameraPrivacySettings()}
              >
                Open camera privacy settings
              </Button>
            ) : null}
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
              className="absolute left-1/2 top-1/2 z-10 h-16 w-16 overflow-hidden rounded-lg shadow-lift"
              initial={
                reduced
                  ? { opacity: 0, x: '-50%', y: '-50%' }
                  : { opacity: 1, scale: 2.5, x: '-50%', y: '-50%' }
              }
              animate={
                reduced
                  ? { opacity: 1, x: '-50%', y: '-50%' }
                  : {
                      opacity: 1,
                      scale: 1,
                      // Bottom right, clear of both the wardrobe rail and the
                      // dock. The meter is top right, and never at the same
                      // time as a capture on this corner.
                      left: 'calc(100% - 96px)',
                      top: 'calc(100% - 176px)',
                      x: 0,
                      y: 0
                    }
              }
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.4, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => window.setTimeout(capture.clearFlying, 1600)}
            >
              <img src={capture.flying.dataUrl} alt="" className="h-full w-full object-cover" />
            </motion.button>
          ) : null}
        </AnimatePresence>

        {/*
          The floating chrome, as one column: identity at the top, the
          wardrobe filling the middle, the controls at the bottom. The column
          itself never takes clicks -- only the panels in it do -- so the
          mirror stays reachable everywhere between them.
        */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-3 p-3 sm:gap-4 sm:p-4">
          <header className="flex flex-none items-start justify-between gap-3">
            <div className="panel pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2">
              <span data-face="display" className="text-20 leading-none text-glass-900">
                fleek
              </span>
              <span className="h-4 w-[1px] flex-none bg-glass-200" aria-hidden />
              <StatusDot status={session.status} />
            </div>

            <div className="panel pointer-events-auto flex items-center gap-1 rounded-full p-1">
              {still ? (
                <IconButton
                  aria-label="Photos of you"
                  icon={<Person size={20} weight={activePhoto ? 'fill' : 'regular'} />}
                  onClick={() => setPhotosOpen(true)}
                />
              ) : null}
              <IconButton
                aria-label="Settings"
                icon={<Gear size={20} weight={settingsOpen ? 'fill' : 'regular'} />}
                onClick={() => setSettingsOpen(true)}
              />
            </div>
          </header>

          {/* Middle. The wardrobe is a rail beside the reflection on a wide
              screen and a shelf under it on a narrow one, and folds away in
              both when you would rather just look. */}
          <div className="relative flex min-h-0 flex-1 flex-col justify-end sm:flex-row sm:items-start sm:justify-start">
            <AnimatePresence initial={false}>
              {wardrobeOpen ? (
                <motion.div
                  key="wardrobe"
                  // On a phone the wardrobe is a shelf under the reflection,
                  // so it is capped: a rail that grew to twelve garments
                  // would leave nothing of you to look at.
                  className="pointer-events-auto flex max-h-[45%] min-h-0 w-full sm:max-h-full sm:w-rail"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Wardrobe
                    garments={garments}
                    activeBySlot={activeBySlot}
                    onToggle={toggleGarment}
                    onRemove={(id) => void removeGarment(id)}
                    onAdd={openIntake}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* A session about to end itself says so while it can still be
                prevented, and says it over the reflection -- during a live
                session the stage line underneath is covered by video. */}
            {session.active && presenceLine ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
                <p className="panel rounded-full px-4 py-2 text-12 text-bulb-700">{presenceLine}</p>
              </div>
            ) : null}

            <div className="pointer-events-none absolute right-0 top-0">
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
            </div>
          </div>

          {/* The dock. Two panels rather than one, so the mode switch reads as
              a question about the app and the rest as things to press. */}
          <div className="flex flex-none flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <ModeSwitch mode={mode} onChange={setMode} locked={session.active} />

            <div className="panel pointer-events-auto flex w-full items-center gap-2 rounded-full p-2 sm:w-auto">
              <IconButton
                aria-label={wardrobeOpen ? 'Hide the wardrobe' : 'Show the wardrobe'}
                aria-pressed={wardrobeOpen}
                icon={<TShirt size={20} weight={wardrobeOpen ? 'fill' : 'regular'} />}
                variant={wardrobeOpen ? 'secondary' : 'ghost'}
                onClick={() => setWardrobeOpen((open) => !open)}
              />

              <Button
                className="min-w-0 flex-1 sm:flex-none"
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
                  still
                    ? void capture.save(generation.imageUrl)
                    : void capture.capture(outputRef.current)
                }
              />
            </div>
          </div>
        </div>

        <IntakeSheet
          open={intakeOpen}
          onClose={() => setIntakeOpen(false)}
          localStream={camera.stream}
          defaultSlot={intakeSlot}
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
  const reduced = useReducedMotion()

  const options: { id: FitMode; label: string }[] = [
    { id: 'live', label: 'Mirror' },
    { id: 'still', label: 'Photo' }
  ]

  return (
    <div
      className="panel pointer-events-auto flex flex-none items-center gap-1 rounded-full p-1"
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
              'relative h-10 rounded-full px-4 text-12 font-medium transition-colors ' +
              'disabled:cursor-not-allowed disabled:text-glass-400 ' +
              (selected ? 'text-glass-000' : 'text-glass-600 hover:text-glass-900')
            }
          >
            {/* The selected pill slides between the two rather than blinking,
                which is the only motion in the dock. */}
            {selected ? (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-full bg-glass-900"
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 420, damping: 34 }
                }
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
