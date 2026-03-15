import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ocrService } from '../services/ocrService'
import {
  Camera,
  CheckCircle2,
  FileMusic,
  Loader2,
  Upload,
  XCircle,
  ArrowRight,
  SplitSquareHorizontal,
} from 'lucide-react'

export default function Scanner() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  // Restore last job on mount
  useEffect(() => {
    const savedJobId = sessionStorage.getItem('musicatte_ocr_job_id')
    if (savedJobId && !job) {
      ocrService.getJob(savedJobId, token).then(setJob).catch(() => {
        sessionStorage.removeItem('musicatte_ocr_job_id')
      })
    }
  }, [token])

  const canUpload = useMemo(() => Boolean(file) && !job && !uploading, [file, job, uploading])

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null
    setFile(f)
    setJob(null)
    setError('')
    if (f) {
      if (f.type === 'application/pdf') {
        setPreview('pdf')
      } else {
        const reader = new FileReader()
        reader.onload = (ev) => setPreview(ev.target.result)
        reader.readAsDataURL(f)
      }
    } else {
      setPreview(null)
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  async function onUpload() {
    setUploading(true)
    try {
      const created = await ocrService.createJob(file, token)
      setJob(created)
      sessionStorage.setItem('musicatte_ocr_job_id', String(created.id))
      setError('')
    } catch {
      setError('No se pudo iniciar el OCR')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    if (!job?.id || job.status === 'succeeded' || job.status === 'failed') return
    const id = setInterval(async () => {
      try {
        const latest = await ocrService.getJob(job.id, token)
        setJob(latest)
      } catch {
        setError('Error consultando estado de OCR')
      }
    }, 2000)
    return () => clearInterval(id)
  }, [job, token])

  function openInEditor(musicxml) {
    navigate('/editor', { state: { musicxml } })
  }

  const hasPieces = job?.status === 'succeeded' && job?.pieces && job.pieces.length > 1
  const singleResult = job?.status === 'succeeded' && !hasPieces

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <Camera size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Scanner OCR</h1>
          <p className="text-sm text-slate-500">
            Sube una foto o PDF de una partitura y conviértela a MusicXML editable
          </p>
        </div>
      </div>

      {/* Upload area */}
      <button
        type="button"
        onClick={openFilePicker}
        className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      >
        {preview ? (
          <div className="space-y-4">
            {preview === 'pdf' ? (
              <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-lg bg-red-50">
                <span className="text-3xl font-bold text-red-400">PDF</span>
              </div>
            ) : (
              <img
                src={preview}
                alt="Preview"
                className="mx-auto max-h-64 rounded-lg object-contain shadow-sm"
              />
            )}
            <p className="text-sm font-medium text-slate-600">{file?.name}</p>
            <p className="text-xs text-indigo-500">Haz clic para cambiar</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Upload size={24} className="text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">Haz clic para seleccionar una imagen o PDF</p>
            <p className="text-xs text-slate-400">JPG, PNG o PDF, máximo 8 MB</p>
          </div>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      <button
        onClick={onUpload}
        disabled={!canUpload}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {uploading ? (
          <><Loader2 size={18} className="animate-spin" /> Subiendo...</>
        ) : (
          <><Camera size={18} /> Procesar archivo</>
        )}
      </button>

      {/* Job status — processing */}
      {job && (job.status === 'queued' || job.status === 'processing') && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-indigo-500" />
            <div>
              <p className="font-medium text-slate-900">
                {job.status === 'queued' ? 'En cola...' : 'Procesando...'}
              </p>
              <p className="text-sm text-slate-500">Job #{job.id}</p>
            </div>
          </div>
        </div>
      )}

      {/* Job status — failed */}
      {job?.status === 'failed' && (
        <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <XCircle size={20} className="text-red-500" />
            <div>
              <p className="font-medium text-slate-900">El reconocimiento falló</p>
              {job.error && (
                <p className="mt-1 text-sm text-red-600">{job.error}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Single result */}
      {singleResult && (
        <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-500" />
            <div className="flex-1">
              <p className="font-medium text-slate-900">Reconocimiento completado</p>
              <p className="text-sm text-slate-500">1 pieza detectada</p>
            </div>
            <button
              onClick={() => openInEditor(job.musicxml)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
            >
              Abrir en editor <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Multiple pieces detected */}
      {hasPieces && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-3">
              <SplitSquareHorizontal size={20} className="text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">
                  {job.pieces.length} piezas detectadas en el documento
                </p>
                <p className="text-sm text-amber-700">
                  Hemos detectado varias piezas separadas. Selecciona la que quieras editar.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {job.pieces.map((piece, idx) => (
              <div
                key={idx}
                className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-400">
                  <FileMusic size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-slate-900 group-hover:text-indigo-600">
                    {piece.title}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Páginas: {piece.pages.join(', ')}
                  </p>
                </div>
                <button
                  onClick={() => openInEditor(piece.musicxml)}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
                >
                  Abrir <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New scan button when job is done */}
      {job && (job.status === 'succeeded' || job.status === 'failed') && (
        <button
          onClick={() => {
            setJob(null)
            setFile(null)
            setPreview(null)
            setError('')
            sessionStorage.removeItem('musicatte_ocr_job_id')
          }}
          className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Nuevo escaneo
        </button>
      )}

      {error && !job && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
