/**
 * Play the score back, highlighting what is sounding.
 *
 * This is the fastest way to check an OCR result. A misread pitch is nearly
 * invisible on screen and unmistakable through the speakers, so playback is
 * less a nice-to-have than the review tool the scanner was missing.
 *
 * Verovio can emit a MIDI file, but playing that needs a synthesiser and a
 * sound font -- megabytes of download for a checking aid. The timemap it also
 * emits carries note ids and timings, which is everything needed to drive a
 * small Web Audio voice and to highlight the score in step. The sound is a
 * plain tone, deliberately: the job is verifying pitches and rhythm.
 */

import { midiOf } from './mei.js'

const ATTACK = 0.008
const RELEASE = 0.09
const MAX_VOICES = 24

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12)
}

export class Playback {
  constructor() {
    this.context = null
    this.master = null
    this.voices = new Map()
    this.timers = []
    this.playing = false
    this.startedAt = 0
    this.offsetMs = 0
    this.schedule = []
    this.durationMs = 0
    this.onHighlight = null
    this.onEnded = null
    this.onProgress = null
    this.progressTimer = null
  }

  get available() {
    return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext)
  }

  /**
   * Build the schedule from a Verovio timemap and the score document.
   *
   * Pitches come from the MEI rather than from the timemap, which carries ids
   * and timings but not what to sound.
   */
  prepare(timemap, doc, { tempoScale = 1 } = {}) {
    const events = []
    const sounding = new Map()

    for (const entry of timemap) {
      const at = Number(entry.tstamp ?? entry.qstamp ?? 0) / tempoScale
      for (const id of entry.off || []) {
        const started = sounding.get(id)
        if (started != null) {
          const note = events.find((event) => event.id === id && event.endMs == null)
          if (note) note.endMs = at
          sounding.delete(id)
        }
      }
      for (const id of entry.on || []) {
        const element = doc.byId(id)
        const midi = element ? midiOf(element) : null
        if (midi == null) continue
        events.push({ id, midi, startMs: at, endMs: null })
        sounding.set(id, at)
      }
    }

    // Anything still sounding at the end gets a sensible tail.
    const last = events.reduce((max, event) => Math.max(max, event.endMs ?? event.startMs), 0)
    for (const event of events) {
      if (event.endMs == null) event.endMs = last + 500
      if (event.endMs <= event.startMs) event.endMs = event.startMs + 120
    }

    events.sort((a, b) => a.startMs - b.startMs)
    this.schedule = events
    this.durationMs = events.length ? Math.max(...events.map((event) => event.endMs)) : 0
    return this.durationMs
  }

  play(fromMs = 0) {
    if (!this.schedule.length) return false
    if (!this.available) return false
    this.stop({ silent: true })

    const Context = window.AudioContext || window.webkitAudioContext
    this.context = new Context()
    this.master = this.context.createGain()
    this.master.gain.value = 0.22
    this.master.connect(this.context.destination)

    this.playing = true
    this.offsetMs = fromMs
    this.startedAt = performance.now()

    const upcoming = this.schedule.filter((event) => event.endMs > fromMs)
    // Web Audio schedules ahead precisely; the highlight has to be driven by
    // timers, so both are queued from the same numbers.
    for (const event of upcoming) {
      const startMs = Math.max(0, event.startMs - fromMs)
      const endMs = Math.max(startMs + 40, event.endMs - fromMs)
      this.#scheduleTone(event.midi, startMs / 1000, (endMs - startMs) / 1000)
      this.timers.push(
        window.setTimeout(() => this.#highlight(event.id, true), startMs),
        window.setTimeout(() => this.#highlight(event.id, false), endMs),
      )
    }

    this.timers.push(
      window.setTimeout(() => {
        this.stop()
        this.onEnded?.()
      }, Math.max(0, this.durationMs - fromMs) + 250),
    )

    if (this.onProgress) {
      this.progressTimer = window.setInterval(() => {
        this.onProgress?.(this.positionMs)
      }, 100)
    }
    return true
  }

  get positionMs() {
    if (!this.playing) return this.offsetMs
    return this.offsetMs + (performance.now() - this.startedAt)
  }

  #scheduleTone(midi, atSeconds, durationSeconds) {
    if (!this.context) return
    if (this.voices.size > MAX_VOICES) return
    const start = this.context.currentTime + atSeconds
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    // A triangle wave carries pitch clearly without the harshness of a saw,
    // which matters when the point is hearing whether a note is right.
    oscillator.type = 'triangle'
    oscillator.frequency.value = midiToFrequency(midi)

    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(1, start + ATTACK)
    gain.gain.setValueAtTime(1, start + Math.max(ATTACK, durationSeconds - RELEASE))
    gain.gain.linearRampToValueAtTime(0, start + durationSeconds)

    oscillator.connect(gain)
    gain.connect(this.master)
    oscillator.start(start)
    oscillator.stop(start + durationSeconds + 0.02)
    const key = `${midi}-${start}`
    this.voices.set(key, oscillator)
    oscillator.onended = () => this.voices.delete(key)
  }

  #highlight(id, on) {
    this.onHighlight?.(id, on)
  }

  stop({ silent = false } = {}) {
    for (const timer of this.timers) window.clearTimeout(timer)
    this.timers = []
    if (this.progressTimer) {
      window.clearInterval(this.progressTimer)
      this.progressTimer = null
    }
    for (const oscillator of this.voices.values()) {
      try {
        oscillator.stop()
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear()
    if (this.context) {
      const context = this.context
      this.context = null
      this.master = null
      // Close on a delay so the release tails are not clipped.
      window.setTimeout(() => context.close().catch(() => {}), 120)
    }
    if (this.playing && !silent) this.offsetMs = 0
    this.playing = false
    if (!silent) this.onHighlight?.(null, false)
  }

  /** Sound one note on its own, for checking a single pitch. */
  preview(midi, durationMs = 400) {
    if (midi == null || !this.available) return
    const Context = window.AudioContext || window.webkitAudioContext
    const context = new Context()
    const gain = context.createGain()
    gain.gain.value = 0.2
    gain.connect(context.destination)
    const oscillator = context.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = midiToFrequency(midi)
    oscillator.connect(gain)
    const now = context.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.2, now + ATTACK)
    gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000)
    oscillator.start(now)
    oscillator.stop(now + durationMs / 1000 + 0.02)
    window.setTimeout(() => context.close().catch(() => {}), durationMs + 200)
  }
}
