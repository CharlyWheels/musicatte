import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ocrService } from '../services/ocrService'

export default function Scanner() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')

  const canUpload = useMemo(() => Boolean(file) && !job, [file, job])

  async function onUpload() {
    try {
      const created = await ocrService.createJob(file, token)
      setJob(created)
      setError('')
    } catch {
      setError('No se pudo iniciar el OCR')
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

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Scanner OCR</h1>
      <div className="rounded-lg border bg-white p-4">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-3 block"
        />
        <button
          onClick={onUpload}
          disabled={!canUpload}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Procesar imagen
        </button>
      </div>

      {job ? (
        <div className="rounded-lg border bg-white p-4">
          <p>
            Job: <strong>{job.id}</strong>
          </p>
          <p>
            Estado: <strong>{job.status}</strong>
          </p>
          {job.status === 'succeeded' ? (
            <button
              className="mt-3 rounded-md border px-3 py-2"
              onClick={() => navigate('/editor', { state: { importedScore: job.score_data } })}
            >
              Abrir resultado en editor
            </button>
          ) : null}
          {job.status === 'failed' ? <p className="text-red-600">El OCR falló.</p> : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  )
}
