/**
 * Reviewing one recognised piece before editing it.
 *
 * The missing step in the old flow: recognition finished and the user was sent
 * straight to the editor with no idea what had been read correctly. Here they
 * get the engraved result, the measures that do not add up, and a play button
 * — which is the fastest way there is to catch a misread pitch, because a
 * wrong note is nearly invisible on the page and obvious through the speakers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Pause,
  Play,
} from 'lucide-react'

import { MeiDoc } from '../../editor/mei.js'
import { ScoreEngine } from '../../editor/scoreEngine.js'
import { Playback } from '../../editor/playback.js'

const SEVERITY = {
  error: {
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    icon: AlertTriangle,
    iconClass: 'text-rose-500',
  },
  warning: {
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: AlertTriangle,
    iconClass: 'text-amber-600',
  },
  info: {
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: Info,
    iconClass: 'text-slate-400',
  },
}

export default function ScoreReview({ piece, index, total, onOpen }) {
  const containerRef = useRef(null)
  const engineRef = useRef(null)
  const playbackRef = useRef(null)
  const docRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const warnings = useMemo(() => piece.warnings || [], [piece.warnings])
  const counts = piece.warning_counts || {}
  const consistency = Math.round((piece.consistency ?? 0) * 100)

  // ── render the recognised score ────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const engine = await ScoreEngine.create({ scale: 34, pageWidth: 2400 })
        if (cancelled) {
          engine.destroy()
          return
        }
        engineRef.current = engine
        if (!engine.load(piece.musicxml)) {
          setFailed(true)
          setReady(true)
          return
        }
        docRef.current = new MeiDoc(engine.getMEI())
        if (containerRef.current) {
          // Only the first page here: this is a check, not a reading copy.
          containerRef.current.innerHTML = engine.renderPage(1)
        }
        setReady(true)
      } catch {
        if (!cancelled) {
          setFailed(true)
          setReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
      playbackRef.current?.stop({ silent: true })
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [piece.musicxml])

  // ── playback ───────────────────────────────────────────────────────

  const highlight = useCallback((id, on) => {
    const container = containerRef.current
    if (!container) return
    if (id == null) {
      for (const element of container.querySelectorAll('.is-sounding')) {
        element.classList.remove('is-sounding')
      }
      return
    }
    const element = container.querySelector(`g[data-id="${id}"]`)
    if (element) element.classList.toggle('is-sounding', on)
  }, [])

  const togglePlay = useCallback(() => {
    if (!playbackRef.current) {
      playbackRef.current = new Playback()
      playbackRef.current.onHighlight = highlight
      playbackRef.current.onEnded = () => setPlaying(false)
    }
    const playback = playbackRef.current
    if (playing) {
      playback.stop()
      setPlaying(false)
      return
    }
    const engine = engineRef.current
    const doc = docRef.current
    if (!engine || !doc) return
    if (!playback.prepare(engine.timemap(), doc)) return
    playback.play(0)
    setPlaying(true)
  }, [highlight, playing])

  const shown = useMemo(() => (showAll ? warnings : warnings.slice(0, 4)), [showAll, warnings])

  const quality =
    consistency >= 95
      ? { text: 'Todos los compases cuadran', tone: 'good' }
      : consistency >= 70
        ? { text: `${consistency}% de los compases cuadran`, tone: 'fair' }
        : { text: `Solo el ${consistency}% de los compases cuadra`, tone: 'poor' }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-3">
        <div className="mb-2">
          <h2 className="font-semibold text-slate-900">
            {piece.title || `Pieza ${index + 1}`}
          </h2>
          <p className="text-xs text-slate-400">
            {total > 1 && `Pieza ${index + 1} de ${total} · `}
            {piece.measures} {piece.measures === 1 ? 'compás' : 'compases'}
            {piece.pages?.length
              ? ` · ${piece.pages.length === 1 ? 'página' : 'páginas'} ${piece.pages.join(', ')}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            quality.tone === 'good'
              ? 'bg-emerald-50 text-emerald-700'
              : quality.tone === 'fair'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-rose-50 text-rose-700'
          }`}
        >
          {quality.tone === 'good' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {quality.text}
        </span>

        <button
          type="button"
          onClick={togglePlay}
          disabled={!ready || failed}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          title="Escuchar lo que se ha reconocido"
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
          {playing ? 'Parar' : 'Escuchar'}
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
        >
          Corregir en el editor <ArrowRight size={15} />
        </button>
        </div>
      </header>

      <div className="score-view max-h-72 overflow-auto bg-white px-2 py-3">
        {!ready && (
          <p className="py-8 text-center text-sm text-slate-400">Dibujando la partitura…</p>
        )}
        {failed && (
          <p className="py-8 text-center text-sm text-rose-600">
            El resultado no se puede dibujar. Ábrelo en el editor para ver qué pasó.
          </p>
        )}
        <div ref={containerRef} />
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Qué conviene revisar
            {counts.error
              ? ` · ${counts.error} ${counts.error === 1 ? 'importante' : 'importantes'}`
              : ''}
          </p>
          {shown.map((warning, position) => {
            const style = SEVERITY[warning.severity] || SEVERITY.info
            const Icon = style.icon
            return (
              <p
                key={`${warning.kind}-${warning.measure}-${position}`}
                className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${style.className}`}
              >
                <Icon size={14} className={`mt-0.5 shrink-0 ${style.iconClass}`} />
                {warning.message}
              </p>
            )
          })}
          {warnings.length > shown.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Ver{' '}
              {warnings.length - shown.length === 1
                ? 'el aviso restante'
                : `los ${warnings.length - shown.length} avisos restantes`}
            </button>
          )}
        </div>
      )}

      {warnings.length === 0 && ready && !failed && (
        <p className="flex items-center gap-2 border-t border-slate-100 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 size={15} className="text-emerald-600" />
          No hemos encontrado nada raro. Escúchalo antes de darlo por bueno.
        </p>
      )}
    </article>
  )
}
