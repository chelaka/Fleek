import type { ConnectionState, DecartSDKError, RealTimeClient } from '@decartai/sdk'
import { DEFAULT_PROMPT } from '@shared/types'
import { decart, mintSessionKey, vtonModel } from './client'
import { describeDecartError, logDecartError } from './errors'

/**
 * Everything Fleek knows about Decart's realtime API lives in this file and
 * its sibling `client.ts`. Swapping providers means rewriting these two and
 * nothing else -- which is exactly what happened when it was fal, and the
 * seam held.
 *
 * The transport is still WebRTC, but the SDK owns it now: signalling, ICE,
 * codec negotiation and reconnection are all behind `connect()`. What used to
 * be three hundred lines of offer/answer plumbing is a connection and five
 * event listeners, and the reconnection is better than the hand-rolled ICE
 * restart it replaces -- it backs off and retries five times before giving up
 * rather than re-offering once and hoping.
 */

export interface DecartSessionOptions {
  /** The user's own permanent key. Exchanged for a capped session key. */
  apiKey: string
  /** The hard spend ceiling, which Decart enforces as well as Fleek. */
  capSeconds: number
  /** The garment the session opens with, as bytes. Nothing is uploaded. */
  reference: Blob
  prompt?: string
  /** The webcam feed. Its tracks are handed to the peer connection. */
  localStream: MediaStream
  onNegotiating: () => void
  /** The first generated frame, which is the moment billing starts. */
  onGenerationStarted: () => void
  onRemoteStream: (stream: MediaStream) => void
  onDegraded: () => void
  onRecovered: () => void
  /** Always receives a sentence, never a code. */
  onFailure: (reason: string) => void
}

export class DecartSession {
  private client: RealTimeClient | null = null
  private prompt: string
  private reference: Blob
  private started = false
  /** Set the moment teardown begins, so late events are ignored. */
  private disposed = false
  private generating = false
  private lastStatsAt = 0

  constructor(private readonly options: DecartSessionOptions) {
    this.prompt = options.prompt?.trim() || DEFAULT_PROMPT
    this.reference = options.reference
  }

  /** Mints a capped key, connects, and opens with the first garment. */
  start(): void {
    if (this.started) return
    this.started = true
    void this.open()
  }

  private async open(): Promise<void> {
    this.options.onNegotiating()

    try {
      const sessionKey = await mintSessionKey(this.options.apiKey, this.options.capSeconds)
      if (this.disposed) return

      const client = await decart(sessionKey).realtime.connect(this.options.localStream, {
        model: vtonModel,
        // The webcam feed is already mirrored for the person looking at it.
        // Letting the SDK mirror it again would hand the model a reversed
        // body, and it would faithfully paint the buttons on the wrong side.
        mirror: false,
        resolution: '720p',
        onRemoteStream: (stream) => {
          if (!this.disposed) this.options.onRemoteStream(stream)
        },
        onConnectionChange: (state) => this.handleState(state),
        initialState: {
          prompt: { text: this.prompt, enhance: false },
          image: this.reference
        }
      })

      // Disposed while the connection was still being established. The
      // session exists on Decart's side now, so it has to be closed, not
      // just forgotten -- an orphaned session is two cents a second.
      if (this.disposed) {
        client.disconnect()
        return
      }

      this.client = client
      client.on('error', (error: DecartSDKError) => this.fail(this.sentence(error, 'realtime')))
      client.on('stats', (stats) => {
        if (this.disposed || stats.timestamp - this.lastStatsAt < 5000) return
        this.lastStatsAt = stats.timestamp
        // Local diagnostics only. Do not log raw SDK stats: ICE candidates
        // contain IP addresses. These timings distinguish network, buffering
        // and device bottlenecks without recording camera content or tokens.
        console.info('[Fleek playback] ' + JSON.stringify({
          latency: stats.glassToGlass,
          rttMs: stats.connection.currentRoundTripTime === null
            ? null : stats.connection.currentRoundTripTime * 1000,
          availableUpstreamKbps: stats.connection.availableOutgoingBitrate === null
            ? null : stats.connection.availableOutgoingBitrate / 1000,
          outboundFps: stats.outboundVideo?.framesPerSecond,
          inboundFps: stats.video?.framesPerSecond,
          encoderLimit: stats.outboundVideo?.qualityLimitationReason,
          encodeMs: stats.outboundVideo?.avgEncodeTimeMs,
          sendDelayMs: stats.outboundVideo?.avgPacketSendDelayMs,
          decodeMs: stats.video?.avgDecodeTimeMs,
          jitterBufferMs: stats.video?.avgJitterBufferMs,
          processingMs: stats.video?.avgProcessingDelayMs,
          upstreamLoss: stats.remoteInbound?.fractionLost,
          downstreamPacketsLost: stats.video?.packetsLostDelta,
          framesDropped: stats.video?.framesDroppedDelta,
          freezes: stats.video?.freezeCountDelta,
          transport: stats.connection.selectedCandidatePairs.map(({ local, remote }) => ({
            local: local.candidateType, remote: remote.candidateType,
            protocol: local.protocol
          }))
        }))
      })
    } catch (error) {
      this.fail(this.sentence(error, 'realtime.connect'))
    }
  }

  /**
   * Change clothes without tearing anything down. `set` replaces the whole
   * state atomically -- prompt and garment together -- which is the operation
   * we want: rebuilding the connection here would blank the mirror for
   * seconds and start a second session's worth of connect latency.
   */
  swap(reference: Blob, prompt?: string): void {
    if (this.disposed || !this.client) return
    this.reference = reference
    if (prompt !== undefined) this.prompt = prompt.trim() || DEFAULT_PROMPT
    // `set` is a promise, but a rejected swap must not end a paid session:
    // the model keeps wearing what it already had.
    void this.client
      .set({ prompt: this.prompt, image: this.reference, enhance: false })
      .catch((error: unknown) => logDecartError('realtime.set', error))
  }

  /**
   * The connection first, then everything else. A leaked media path is a
   * leaked two cents a second, so this is the one method that must always
   * work, including from an unload handler.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    // The local tracks are deliberately left running: they belong to the
    // camera feature, which keeps showing the idle preview after a session.
    try {
      this.client?.disconnect()
    } catch {
      /* already closed */
    }
    this.client = null
  }

  /**
   * The SDK's five states, mapped onto the four the machine knows.
   *
   * `generating` is the important one: it is the first frame coming back, and
   * therefore the moment money starts moving. Everything before it is setup
   * and free.
   */
  private handleState(state: ConnectionState): void {
    if (this.disposed) return

    switch (state) {
      case 'connecting':
        this.options.onNegotiating()
        break

      case 'connected':
        // Connected but not yet generating. If we had been generating, this
        // is a drop back to a live-but-idle link, which reads as degraded.
        if (this.generating) this.options.onDegraded()
        break

      case 'generating':
        if (!this.generating) {
          this.generating = true
          this.options.onGenerationStarted()
        } else {
          this.options.onRecovered()
        }
        break

      case 'reconnecting':
        this.options.onDegraded()
        break

      case 'disconnected':
        // The SDK only reaches `disconnected` after its retries are spent, so
        // by here the session is genuinely over rather than merely wobbling.
        this.fail('Lost the connection to Decart. Your session stopped and stopped billing.')
        break

      default:
        break
    }
  }

  private sentence(error: unknown, where: string): string {
    logDecartError(where, error)
    return describeDecartError(error, 'session')
  }

  private fail(reason: string): void {
    if (this.disposed) return
    // Tear the connection down before reporting. Billing must never outlive
    // the UI that is about to show an error.
    this.dispose()
    this.options.onFailure(reason)
  }
}
