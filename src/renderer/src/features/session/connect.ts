import { fal } from '@fal-ai/client'
import { DEFAULT_PROMPT, FAL_MODEL_ID } from '@shared/types'
import { describeFalError, logFalError } from './errors'

/**
 * Everything Fleek knows about fal lives in this file and its sibling
 * `upload.ts`. Swapping providers means rewriting these two and nothing else.
 *
 * The transport is WebRTC: we open a signalling channel to the realtime
 * endpoint, hand it our webcam tracks, and bind the returned track to the
 * output video element. The model repaints each frame.
 */

/** Anything we could not classify is still worth seeing in the dev console. */
type Signal = Record<string, unknown> & { type?: string }

export interface FalSessionOptions {
  apiKey: string
  /** The garment the session opens with. */
  referenceImageUrl: string
  prompt?: string
  /** The mirrored webcam feed. Its tracks are added to the peer connection. */
  localStream: MediaStream
  /** How long to wait for the first generated frame before giving up. */
  firstFrameTimeoutMs?: number
  onNegotiating: () => void
  onGenerationStarted: () => void
  onRemoteStream: (stream: MediaStream) => void
  onDegraded: () => void
  onRecovered: () => void
  /** Always receives a sentence, never a code. */
  onFailure: (reason: string) => void
}

const FIRST_FRAME_TIMEOUT_MS = 20_000

function sentenceFor(error: unknown, where: string): string {
  logFalError(where, error)
  return describeFalError(error, 'session')
}

export class FalSession {
  private connection: { send: (payload: unknown) => void; close: () => void } | null = null
  private pc: RTCPeerConnection | null = null
  private iceServers: RTCIceServer[] = []
  private firstFrameTimer: ReturnType<typeof setTimeout> | null = null
  private prompt: string
  private referenceImageUrl: string
  private started = false
  /** Set the moment teardown begins, so late signals are ignored. */
  private disposed = false
  private sawFirstFrame = false

  constructor(private readonly options: FalSessionOptions) {
    this.prompt = options.prompt?.trim() || DEFAULT_PROMPT
    this.referenceImageUrl = options.referenceImageUrl
  }

  /** Opens signalling and sends the opening message. */
  start(): void {
    if (this.started) return
    this.started = true

    fal.config({ credentials: this.options.apiKey })

    try {
      this.connection = fal.realtime.connect(FAL_MODEL_ID, {
        connectionKey: 'fleek-mirror',
        throttleInterval: 0,
        onResult: (message: unknown) => this.handleSignal(message as Signal),
        onError: (error: unknown) => this.fail(sentenceFor(error, 'realtime.onError'))
      }) as unknown as { send: (payload: unknown) => void; close: () => void }
    } catch (error) {
      this.fail(sentenceFor(error, 'realtime.connect threw'))
      return
    }

    this.send({ prompt: this.prompt, reference_image_url: this.referenceImageUrl })

    this.firstFrameTimer = setTimeout(() => {
      if (!this.sawFirstFrame) {
        this.fail('fal did not send a frame back in time. Nothing was billed. Try again.')
      }
    }, this.options.firstFrameTimeoutMs ?? FIRST_FRAME_TIMEOUT_MS)
  }

  /**
   * Change clothes without tearing anything down. A new reference on the open
   * channel is the whole operation -- rebuilding the peer connection here
   * would restart the connect cost and blank the mirror for seconds.
   */
  swap(referenceImageUrl: string, prompt?: string): void {
    if (this.disposed || !this.connection) return
    this.referenceImageUrl = referenceImageUrl
    if (prompt !== undefined) this.prompt = prompt.trim() || DEFAULT_PROMPT
    this.send({ prompt: this.prompt, reference_image_url: this.referenceImageUrl })
  }

  /**
   * Peer connection first, then signalling. Order matters: closing the socket
   * first can leave the media path up, and a leaked media path is a leaked
   * dollar a minute.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    if (this.firstFrameTimer !== null) {
      clearTimeout(this.firstFrameTimer)
      this.firstFrameTimer = null
    }

    // The local tracks are deliberately left running: they belong to the
    // camera feature, which keeps showing the idle preview after a session.
    try {
      this.pc?.close()
    } catch {
      /* already closed */
    }
    this.pc = null

    try {
      this.connection?.close()
    } catch {
      /* already closed */
    }
    this.connection = null
  }

  private send(payload: unknown): void {
    try {
      this.connection?.send(payload)
    } catch (error) {
      this.fail(sentenceFor(error, 'send'))
    }
  }

  private fail(reason: string): void {
    if (this.disposed) return
    // Tear the connection down before reporting. Billing must never outlive
    // the UI that is about to show an error.
    this.dispose()
    this.options.onFailure(reason)
  }

  private handleSignal(message: Signal): void {
    if (this.disposed || !message || typeof message !== 'object') return

    // Shapes only, never values: an SDP blob is noise and a token is a leak.
    console.warn(
      '[fleek] signal type=' + String(message.type) + ' keys=' + Object.keys(message).join(',')
    )

    switch (message.type) {
      case 'iceservers':
        this.iceServers = normaliseIceServers(message['servers'] ?? message['iceServers'])
        void this.openPeerConnection()
        break

      case 'answer':
        void this.applyAnswer(message)
        break

      case 'icecandidate':
        void this.applyRemoteCandidate(message)
        break

      case 'ice-restart':
        this.iceServers = normaliseIceServers(
          message['servers'] ?? message['iceServers'] ?? message['turn']
        )
        this.options.onDegraded()
        void this.restartIce()
        break

      case 'generation_started':
        this.sawFirstFrame = true
        if (this.firstFrameTimer !== null) {
          clearTimeout(this.firstFrameTimer)
          this.firstFrameTimer = null
        }
        this.options.onGenerationStarted()
        break

      case 'error':
        this.fail(sentenceFor(message, 'signal error'))
        break

      default:
        break
    }
  }

  private async openPeerConnection(): Promise<void> {
    if (this.disposed || this.pc) return
    this.options.onNegotiating()

    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    this.pc = pc

    for (const track of this.options.localStream.getTracks()) {
      pc.addTrack(track, this.options.localStream)
    }

    pc.ontrack = (event): void => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      this.options.onRemoteStream(stream)
    }

    pc.onicecandidate = (event): void => {
      if (event.candidate) {
        this.send({ type: 'icecandidate', candidate: event.candidate.toJSON() })
      }
    }

    pc.oniceconnectionstatechange = (): void => {
      if (this.disposed) return
      switch (pc.iceConnectionState) {
        case 'disconnected':
        case 'checking':
          this.options.onDegraded()
          break
        case 'connected':
        case 'completed':
          this.options.onRecovered()
          break
        case 'failed':
          this.fail('Lost the connection to fal. Your session stopped and stopped billing.')
          break
        default:
          break
      }
    }

    await this.offer(false)
  }

  private async offer(iceRestart: boolean): Promise<void> {
    const pc = this.pc
    if (!pc || this.disposed) return
    try {
      const offer = await pc.createOffer({ iceRestart })
      await pc.setLocalDescription(offer)
      this.send({ type: 'offer', sdp: offer.sdp })
    } catch (error) {
      this.fail(sentenceFor(error, 'createOffer'))
    }
  }

  private async restartIce(): Promise<void> {
    const pc = this.pc
    if (!pc || this.disposed) return
    try {
      pc.setConfiguration({ iceServers: this.iceServers })
    } catch {
      // Some Chromium builds refuse a reconfigure mid-flight; the re-offer
      // below still gives the connection a chance to recover.
    }
    await this.offer(true)
  }

  private async applyAnswer(message: Signal): Promise<void> {
    const pc = this.pc
    const sdp = message['sdp']
    if (!pc || typeof sdp !== 'string') return
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp })
    } catch (error) {
      this.fail(sentenceFor(error, 'setRemoteDescription'))
    }
  }

  private async applyRemoteCandidate(message: Signal): Promise<void> {
    const pc = this.pc
    const candidate = message['candidate']
    if (!pc || !candidate) return
    try {
      await pc.addIceCandidate(candidate as RTCIceCandidateInit)
    } catch {
      // A candidate that arrives before the remote description, or one that
      // simply does not apply, is normal ICE noise -- not a session failure.
    }
  }
}

function normaliseIceServers(raw: unknown): RTCIceServer[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): RTCIceServer[] => {
    if (typeof entry === 'string') return [{ urls: entry }]
    if (entry && typeof entry === 'object') {
      const server = entry as Record<string, unknown>
      const urls = server['urls'] ?? server['url']
      if (typeof urls === 'string' || Array.isArray(urls)) {
        return [
          {
            urls: urls as string | string[],
            ...(typeof server['username'] === 'string' ? { username: server['username'] } : {}),
            ...(typeof server['credential'] === 'string'
              ? { credential: server['credential'] }
              : {})
          }
        ]
      }
    }
    return []
  })
}
