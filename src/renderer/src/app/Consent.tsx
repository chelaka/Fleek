import { useState } from 'react'
import { platform } from '@/platform'
import { motion } from 'motion/react'
import { Button } from '@/ui/Button'
import { useStore } from './store'

/**
 * First run, and again after a reset. No dismissible banner, no "don't show
 * again" -- the user is about to send live video of themselves to a third
 * party, and that deserves one deliberate keystroke.
 */
export function Consent(): JSX.Element {
  const { acceptConsent } = useStore()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)

  const openFalPrivacy = (): void => {
    void platform.openExternal('https://fal.ai/privacy')
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-glass-000 px-4 py-6 sm:px-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24 }}
        className="flex w-full max-w-[480px] flex-col gap-5 sm:gap-6"
      >
        <p data-face="display" className="text-32 text-glass-900">
          fleek
        </p>

        <h1 className="text-20 font-medium text-glass-900 sm:text-24">
          Your camera feed goes to a server.
        </h1>

        <div className="flex flex-col gap-4 text-14 text-glass-600">
          <p>
            Fleek sends live video from your webcam to fal.ai, where a model repaints the clothing
            and sends the frames back. Nothing is stored by Fleek unless you capture a still.{' '}
            <button
              type="button"
              onClick={openFalPrivacy}
              className="text-glass-900 underline underline-offset-2 hover:text-bulb-700"
            >
              Read fal&rsquo;s privacy policy
            </button>{' '}
            before you continue.
          </p>
          <p>
            Photo mode is the other half: it dresses a photo of you rather than the live feed.
            Photos you add are kept on this machine and sent to fal each time you generate. You
            can remove them at any time.
          </p>
          <p>
            Live video costs $0.02 per second and Fleek shows a running total and stops itself at
            your time limit. A generated image costs $0.075 per garment, and the price is on the
            button before you press it.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded border border-glass-200 bg-glass-100 p-4 text-14 text-glass-900">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.currentTarget.checked)}
            className="mt-1 h-4 w-4 accent-bulb-500"
          />
          <span>
            I understand my camera feed and any photos I add are sent to a third-party server.
          </span>
        </label>

        <div>
          <Button
            variant="primary"
            disabled={!checked || busy}
            onClick={() => {
              setBusy(true)
              void acceptConsent()
            }}
          >
            Continue
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
