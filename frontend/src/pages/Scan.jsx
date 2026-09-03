/**
 * Photo to editable score, as one guided flow.
 *
 * The scanner used to be a bare file picker followed by a two-minute wait and
 * a "done" card. Four things are different here:
 *
 * 1. The photo is judged before it is sent, so a bad one costs a second rather
 *    than two minutes.
 * 2. Progress is per page, because a fifteen-page PDF is a long wait to spend
 *    looking at an unlabelled spinner.
 * 3. The result is reviewed against the photo, with the measures that do not
 *    add up called out and playback to check them by ear.
 * 4. Piece boundaries are proposed, not imposed: the user confirms them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileMusic,
  Image as ImageIcon,
  Loader2,
  RotateCw,
  Scissors,
  Upload,
  XCircle,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext.jsx'
import { ocrService } from '../services/ocrService.js'
import { preparePhoto, rotatePhoto } from '../editor/imageQuality.js'
import ScoreReview from '../components/scan/ScoreReview.jsx'

const JOB_KEY = 'musicatte_scan_job'
const POLL_MS = 1500

const STEPS = [
  { id: 'capture', label: 'Capturar' },
  { id: 'review', label: 'Revisar' },
  { id: 'edit', label: 'Editar' },
]

function Steps({ current }) {
  const index = STEPS.findIndex((step) => step.id === current)
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((step, position) => {
        const state = position < index ? 'done' : position === index ? 'current' : 'todo'
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                state === 'done'
                  ? 'bg-emerald-600 text-white'
                  : state === 'current'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {position + 1}
            </span>
            <span
              className={
                state === 'todo' ? 'text-slate-400' : 'font-medium text-slate-700'
              }
            >
              {step.label}
            </span>
            {position < STEPS.length - 1 && (
              <span className="mx-1 h-px w-6 bg-slate-200" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function Scan() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const [limits, setLimits] = useState({ max_upload_bytes: 16 * 1024 * 1024, max_pages: 15 })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [quality, setQuality] = useState(null)
  const [checking, setChecking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [boundaries, setBoundaries] = useState([])
  const [resplitting, setResplitting] = useState(false)

  useEffect(() => {
    ocrService
      .limits()
      .then(setLimits)
      .catch(() => {
        /* the defaults above are fine if this fails */
      })
  }, [])

  // Restore a scan the user navigated away from.
  useEffect(() => {
    const saved = window.sessionStorage.getItem(JOB_KEY)
    if (!saved || !token) return
    ocrService
      .getJob(saved, token)
      .then(setJob)
      .catch(() => window.sessionStorage.removeItem(JOB_KEY))
  }, [token])

  useEffect(() => {
    if (job?.suggested_boundaries?.length) setBoundaries(job.suggested_boundaries)
  }, [job?.suggested_boundaries])

  // ── polling ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!job?.id) return undefined
    if (job.status === 'succeeded' || job.status === 'failed') return undefined
    const timer = window.setInterval(async () => {
      try {
        setJob(await ocrService.getJob(job.id, token))
      } catch {
        setError('Se perdió la conexión con el servidor mientras se procesaba el escaneo.')
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status, token])

  // ── picking a file ─────────────────────────────────────────────────

  const inspect = useCallback(
    async (chosen) => {
      setChecking(true)
      setError('')
      setQuality(null)
      try {
        const report = await preparePhoto(chosen)
        setFile(report.file)
        setQuality(report)
        if (chosen.type !== 'application/pdf') {
          setPreview(URL.createObjectURL(report.file))
        } else {
          setPreview('pdf')
        }
      } catch (cause) {
        setError(cause?.message || 'No se pudo leer el archivo.')
        setFile(null)
        setPreview(null)
      } finally {
        setChecking(false)
      }
    },
    [],
  )

  const onPick = useCallback(
    (event) => {
      const chosen = event.target.files?.[0]
      event.target.value = ''
      if (!chosen) return
      if (chosen.size > limits.max_upload_bytes * 4) {
        // Wildly oversized: say so before spending time decoding it.
        setError(
          `Ese archivo pesa ${(chosen.size / 1048576).toFixed(0)} MB, demasiado incluso para comprimirlo. Hazle una foto con menos resolución.`,
        )
        return
      }
      setJob(null)
      window.sessionStorage.removeItem(JOB_KEY)
      inspect(chosen)
    },
    [inspect, limits.max_upload_bytes],
  )

  const rotate = useCallback(async () => {
    if (!file || file.type === 'application/pdf') return
    const rotated = await rotatePhoto(file, 1)
    inspect(rotated)
  }, [file, inspect])

  const start = useCallback(async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const created = await ocrService.createJob(file, token)
      setJob(created)
      window.sessionStorage.setItem(JOB_KEY, String(created.id))
    } catch (cause) {
      // The server's own explanation, not a generic message: "the file is too
      // large" is something the user can act on, "could not start OCR" is not.
      setError(
        cause?.response?.data?.detail ||
          'No se pudo iniciar el reconocimiento. Inténtalo de nuevo.',
      )
    } finally {
      setUploading(false)
    }
  }, [file, token])

  const reset = useCallback(() => {
    setFile(null)
    setPreview(null)
    setQuality(null)
    setJob(null)
    setError('')
    setBoundaries([])
    window.sessionStorage.removeItem(JOB_KEY)
  }, [])

  const retry = useCallback(async () => {
    if (!job?.id) return
    try {
      setJob(await ocrService.retry(job.id, token))
    } catch (cause) {
      setError(cause?.response?.data?.detail || 'No se pudo reintentar el escaneo.')
    }
  }, [job?.id, token])

  const applySplit = useCallback(async () => {
    if (!job?.id) return
    setResplitting(true)
    try {
      setJob(await ocrService.resplit(job.id, boundaries, token))
    } catch (cause) {
      setError(cause?.response?.data?.detail || 'No se pudo separar así.')
    } finally {
      setResplitting(false)
    }
  }, [boundaries, job?.id, token])

  const openInEditor = useCallback(
    (scoreData) => {
      window.sessionStorage.removeItem(JOB_KEY)
      navigate('/editor', { state: { scoreData, fromScan: true } })
    },
    [navigate],
  )

  const step = job?.status === 'succeeded' ? 'review' : 'capture'
  const pieces = job?.pieces || []
  const pages = useMemo(() => job?.pages || [], [job?.pages])
  const progress = job?.progress || { current: 0, total: 0 }
  const percent = progress.total ? Math.round((100 * progress.current) / progress.total) : 0

  const maxMb = Math.round(limits.max_upload_bytes / 1048576)

  const problemsByPage = useMemo(
    () => pages.filter((page) => page.image_problems?.length),
    [pages],
  )

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Camera size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Escanear una partitura</h1>
            <p className="text-sm text-slate-500">
              De una foto o un PDF a una partitura que puedes editar
            </p>
          </div>
        </div>
        <Steps current={step} />
      </header>

      {step === 'capture' && !job && (
        <>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
            <h2 className="mb-2 text-sm font-semibold text-indigo-900">
              Para que salga bien
            </h2>
            <ul className="grid gap-1.5 text-sm text-indigo-800 sm:grid-cols-2">
              <li>· Encaja la hoja entera y recorta lo que sobre</li>
              <li>· Ponla lo más plana que puedas</li>
              <li>· Luz uniforme, sin la sombra de tu mano</li>
              <li>· Sujeta el móvil con las dos manos</li>
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99]"
            >
              <Camera size={18} />
              Hacer una foto
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3.5 font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]"
            >
              <Upload size={18} />
              Elegir un archivo
            </button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={onPick}
            className="hidden"
          />

          {checking && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" />
              Comprobando la foto…
            </p>
          )}

          {preview && quality && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="capture-frame relative bg-slate-900/5 p-4">
                {preview === 'pdf' ? (
                  <div className="mx-auto flex h-40 w-32 items-center justify-center rounded-lg bg-white shadow-sm">
                    <FileMusic size={36} className="text-slate-400" />
                  </div>
                ) : (
                  <img
                    src={preview}
                    alt="La foto que vas a enviar"
                    className="mx-auto max-h-72 rounded-lg object-contain shadow-sm"
                  />
                )}
              </div>

              <div className="space-y-3 p-4">
                <div
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                    quality.usable
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  {quality.usable ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  )}
                  <div>
                    <p className="font-medium">{quality.advice}</p>
                    {quality.warnings.slice(1).map((warning) => (
                      <p key={warning} className="mt-1">
                        {warning}
                      </p>
                    ))}
                    {quality.shrunkFrom && (
                      <p className="mt-1 text-xs opacity-80">
                        Comprimida de {(quality.shrunkFrom / 1048576).toFixed(1)} MB a{' '}
                        {(quality.file.size / 1048576).toFixed(1)} MB para subirla más rápido.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={start}
                    disabled={uploading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={17} className="animate-spin" /> Subiendo…
                      </>
                    ) : quality.usable ? (
                      <>
                        Reconocer la partitura <ArrowRight size={17} />
                      </>
                    ) : (
                      <>Intentarlo de todas formas</>
                    )}
                  </button>
                  {preview !== 'pdf' && (
                    <button
                      type="button"
                      onClick={rotate}
                      title="Girar 90°"
                      className="rounded-xl border border-slate-200 px-3 py-3 text-slate-600 transition hover:bg-slate-50"
                    >
                      <RotateCw size={17} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Otra foto
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  JPG, PNG, WEBP o PDF · hasta {maxMb} MB · máximo {limits.max_pages} páginas
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── in progress ── */}
      {job && (job.status === 'queued' || job.status === 'processing') && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-indigo-500" />
            <div className="flex-1">
              <p className="font-medium text-slate-900">
                {job.status === 'queued' ? 'En cola…' : 'Reconociendo la partitura…'}
              </p>
              <p className="text-sm text-slate-500">
                {progress.total > 1
                  ? `Página ${Math.max(1, progress.current)} de ${progress.total}`
                  : 'Esto puede tardar un par de minutos.'}
              </p>
            </div>
          </div>
          {progress.total > 1 && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Puedes salir de esta pantalla: el escaneo sigue en el servidor y lo recuperamos al
            volver.
          </p>
        </div>
      )}

      {/* ── failed ── */}
      {job?.status === 'failed' && (
        <div className="rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <XCircle size={20} className="mt-0.5 text-rose-500" />
            <div className="flex-1">
              <p className="font-medium text-slate-900">No se pudo reconocer la partitura</p>
              {job.error && <p className="mt-1 text-sm text-rose-700">{job.error}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
                >
                  Volver a intentarlo
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Empezar de nuevo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── review ── */}
      {job?.status === 'succeeded' && (
        <div className="space-y-4">
          {problemsByPage.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle size={15} className="text-amber-600" />
                La calidad de la imagen limitó el reconocimiento
              </p>
              <ul className="mt-1 space-y-0.5 text-amber-800">
                {problemsByPage.map((page) => (
                  <li key={page.page}>
                    Página {page.page}: {page.image_problems.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pages.length > 1 && (
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700">
                <Scissors size={15} className="text-slate-400" />
                Separación en piezas
                <span className="text-slate-400">
                  ({pieces.length} {pieces.length === 1 ? 'pieza' : 'piezas'})
                </span>
              </summary>
              <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                <p className="text-sm text-slate-500">
                  Marca en qué página empieza cada pieza. Lo hemos propuesto por ti, pero tú
                  tienes la última palabra.
                </p>
                <div className="flex flex-wrap gap-2">
                  {pages.map((page) => {
                    const isStart = boundaries.includes(page.page)
                    const isFirst = page.page === pages[0].page
                    return (
                      <button
                        key={page.page}
                        type="button"
                        disabled={isFirst}
                        onClick={() =>
                          setBoundaries((current) =>
                            current.includes(page.page)
                              ? current.filter((value) => value !== page.page)
                              : [...current, page.page].sort((a, b) => a - b),
                          )
                        }
                        title={
                          isFirst
                            ? 'La primera página siempre empieza una pieza'
                            : page.ends_piece
                              ? 'La página anterior acaba en barra final'
                              : undefined
                        }
                        className={`flex flex-col items-center rounded-lg border px-3 py-2 text-xs transition disabled:opacity-60 ${
                          isStart
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <ImageIcon size={14} />
                        <span className="mt-1 font-medium">Pág. {page.page}</span>
                        <span className={isStart ? 'text-indigo-100' : 'text-slate-400'}>
                          {page.staff_count || '?'} pentagramas
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={applySplit}
                  disabled={resplitting}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:opacity-60"
                >
                  {resplitting ? 'Aplicando…' : 'Aplicar esta separación'}
                </button>
              </div>
            </details>
          )}

          {pieces.map((piece, index) => (
            <ScoreReview
              key={`${piece.title}-${index}`}
              piece={piece}
              index={index}
              total={pieces.length}
              onOpen={() => openInEditor(piece.musicxml)}
            />
          ))}

          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Escanear otra partitura
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}
