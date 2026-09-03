/**
 * A published score, readable by anyone.
 *
 * The page the community section was missing entirely. Publishing used to add
 * a score to a list with no way to open it: the only endpoint that returned
 * notation required being its owner, so people were being asked to rate
 * scores they could not see.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  Loader2,
  Pause,
  Pencil,
  Play,
  Star,
  User,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext.jsx'
import { repositoryService } from '../services/repositoryService.js'
import { MeiDoc } from '../editor/mei.js'
import { ScoreEngine } from '../editor/scoreEngine.js'
import { Playback } from '../editor/playback.js'
import { EXPORT_FORMATS, GENRES, INSTRUMENTS } from '../editor/constants.js'

function label(list, value) {
  return list.find((item) => item.value === value)?.label || value
}

export default function PublicScore() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, isAuthenticated } = useAuth()

  const containerRef = useRef(null)
  const engineRef = useRef(null)
  const docRef = useRef(null)
  const playbackRef = useRef(null)

  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [rating, setRating] = useState(null)
  const [downloading, setDownloading] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await repositoryService.get(id)
        if (cancelled) return
        setScore(data)
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause?.response?.status === 404
              ? 'Esta partitura no existe o ya no está publicada.'
              : 'No se pudo cargar la partitura.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!score?.score_data) return undefined
    let cancelled = false
    ;(async () => {
      const engine = await ScoreEngine.create({ scale: 40 })
      if (cancelled) {
        engine.destroy()
        return
      }
      engineRef.current = engine
      if (engine.load(score.score_data)) {
        docRef.current = new MeiDoc(engine.getMEI())
        if (containerRef.current) {
          containerRef.current.innerHTML = Array.from(
            { length: engine.pageCount },
            (_, index) => `<div class="score-page">${engine.renderPage(index + 1)}</div>`,
          ).join('')
        }
      }
    })()
    return () => {
      cancelled = true
      playbackRef.current?.stop({ silent: true })
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [score?.score_data])

  const togglePlay = useCallback(() => {
    if (!playbackRef.current) {
      playbackRef.current = new Playback()
      playbackRef.current.onHighlight = (noteId, on) => {
        const container = containerRef.current
        if (!container) return
        if (noteId == null) {
          for (const element of container.querySelectorAll('.is-sounding')) {
            element.classList.remove('is-sounding')
          }
          return
        }
        const element = container.querySelector(`g[data-id="${noteId}"]`)
        if (element) element.classList.toggle('is-sounding', on)
      }
      playbackRef.current.onEnded = () => setPlaying(false)
    }
    const playback = playbackRef.current
    if (playing) {
      playback.stop()
      setPlaying(false)
      return
    }
    if (!engineRef.current || !docRef.current) return
    if (!playback.prepare(engineRef.current.timemap(), docRef.current)) return
    playback.play(0)
    setPlaying(true)
  }, [playing])

  const download = useCallback(
    async (format) => {
      setDownloading(format)
      try {
        const { blob, filename } = await repositoryService.exportScore(id, format)
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      } catch {
        setError('No se pudo preparar la descarga en ese formato.')
      } finally {
        setDownloading('')
      }
    },
    [id],
  )

  const rate = useCallback(
    async (value) => {
      if (!isAuthenticated) {
        navigate('/entrar', { state: { from: `/partitura/${id}` } })
        return
      }
      try {
        const result = await repositoryService.rate(id, value, token)
        setRating(value)
        setScore((current) =>
          current
            ? {
                ...current,
                avg_rating: result.avg_rating,
                rating_count: result.rating_count,
              }
            : current,
        )
      } catch (cause) {
        setError(cause?.response?.data?.detail || 'No se pudo guardar tu valoración.')
      }
    },
    [id, isAuthenticated, navigate, token],
  )

  const openCopy = useCallback(() => {
    if (!score) return
    // A copy, not the original: the reader is not its owner.
    navigate('/editor', {
      state: { scoreData: score.score_data, copyOf: score.id },
    })
  }, [navigate, score])

  if (loading) {
    return <p className="py-12 text-center text-sm text-slate-400">Cargando la partitura…</p>
  }

  if (error && !score) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-600">{error}</p>
        <Link
          to="/repositorio"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          <ArrowLeft size={15} /> Volver al repositorio
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        to="/repositorio"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft size={15} /> Repositorio
      </Link>

      <header className="flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{score.title}</h1>
          {score.composer && <p className="text-slate-600">{score.composer}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1 text-slate-500">
              <User size={13} /> {score.author}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {label(INSTRUMENTS, score.instrument)}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {label(GENRES, score.genre)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
            {playing ? 'Parar' : 'Escuchar'}
          </button>
          <button
            type="button"
            onClick={openCopy}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
            title="Abre una copia en tu editor; no modifica el original"
          >
            <Pencil size={15} /> Abrir una copia
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => rate(value)}
              title={`Valorar con ${value} ${value === 1 ? 'estrella' : 'estrellas'}`}
              aria-label={`Valorar con ${value} de 5`}
              className="rounded p-0.5 transition hover:scale-110"
            >
              <Star
                size={19}
                className={
                  value <= Math.round(rating ?? score.avg_rating ?? 0)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-300'
                }
              />
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">
          {score.rating_count > 0
            ? `${score.avg_rating.toFixed(1)} de ${score.rating_count} ${
                score.rating_count === 1 ? 'valoración' : 'valoraciones'
              }`
            : 'Sin valoraciones todavía'}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Download size={13} /> Descargar:
          </span>
          {EXPORT_FORMATS.filter((format) => format.value !== 'mei').map((format) => (
            <button
              key={format.value}
              type="button"
              onClick={() => download(format.value)}
              disabled={Boolean(downloading)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              title={format.hint}
            >
              {downloading === format.value ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                format.label
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      <div
        ref={containerRef}
        className="score-view overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      />
    </div>
  )
}
