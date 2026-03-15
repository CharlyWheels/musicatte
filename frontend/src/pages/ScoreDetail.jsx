import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { scoreService } from '../services/scoreService'
import { repositoryService } from '../services/repositoryService'
import { getToolkit } from '../editor/verovioEngine'
import {
  ArrowLeft,
  Clock,
  Download,
  Edit3,
  Globe,
  Loader2,
  Music,
  Save,
  Star,
  Trash2,
  User,
} from 'lucide-react'

const INSTRUMENTS = ['piano', 'guitar', 'violin', 'cello', 'flute', 'clarinet', 'trumpet', 'saxophone', 'drums', 'voice', 'other']
const GENRES = ['general', 'classical', 'jazz', 'pop', 'rock', 'folk', 'latin', 'film', 'religious', 'educational', 'other']

export default function ScoreDetail() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const previewRef = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await scoreService.get(id, token)
        setScore(data)
        setForm({
          title: data.title,
          composer: data.composer || '',
          instrument: data.instrument,
          genre: data.genre,
        })
      } catch {
        showToast('Error al cargar la partitura', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, token])

  // Render preview with Verovio
  useEffect(() => {
    if (!score?.musicxml || !previewRef.current) return
    getToolkit().then((tk) => {
      tk.loadData(score.musicxml)
      // Render all pages
      const pageCount = tk.getPageCount()
      let svgHtml = ''
      for (let i = 1; i <= Math.min(pageCount, 5); i++) {
        svgHtml += tk.renderToSVG(i)
      }
      if (previewRef.current) {
        previewRef.current.innerHTML = svgHtml
      }
    })
  }, [score?.musicxml])

  async function handleSaveProperties() {
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        composer: form.composer || null,
        instrument: form.instrument,
        genre: form.genre,
        musicxml: score.musicxml,
      }
      const updated = await scoreService.update(id, payload, token)
      setScore(updated)
      setEditing(false)
      showToast('Propiedades guardadas')
    } catch {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    try {
      await repositoryService.publish(id, token)
      setScore((s) => ({ ...s, status: 'published' }))
      showToast('Publicada en el repositorio')
    } catch {
      showToast('Error al publicar', 'error')
    }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta partitura permanentemente?')) return
    try {
      await scoreService.remove(id, token)
      navigate('/')
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }

  function handleExport() {
    if (!score) return
    const blob = new Blob([score.musicxml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${score.title || 'partitura'}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openInEditor() {
    navigate('/editor', { state: { musicxml: score.musicxml, scoreId: score.id } })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  if (!score) {
    return (
      <div className="py-16 text-center text-slate-500">Partitura no encontrada</div>
    )
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed right-4 top-20 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft size={16} /> Mis partituras
      </button>

      {/* Header + Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Music size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{score.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {score.composer && (
                <span className="flex items-center gap-1"><User size={14} /> {score.composer}</span>
              )}
              <span className="flex items-center gap-1"><Clock size={14} /> v{score.version}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${score.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {score.status === 'published' ? 'Publicada' : 'Borrador'}
              </span>
              {score.avg_rating > 0 && (
                <span className="flex items-center gap-1"><Star size={14} className="text-amber-400" /> {score.avg_rating.toFixed(1)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={openInEditor} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95">
            <Edit3 size={16} /> Editar partitura
          </button>
          {score.status === 'draft' && (
            <button onClick={handlePublish} className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 active:scale-95">
              <Globe size={16} /> Publicar
            </button>
          )}
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95">
            <Download size={16} /> Exportar
          </button>
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 active:scale-95">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Score preview */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Vista previa</h2>
            <div ref={previewRef} className="verovio-canvas overflow-x-auto" style={{ minHeight: '200px' }}>
              <div className="flex h-48 items-center justify-center text-slate-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            </div>
          </div>
        </div>

        {/* Properties panel */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Propiedades</h2>
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  Editar
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Título</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Compositor</label>
                  <input
                    value={form.composer}
                    onChange={(e) => setForm((f) => ({ ...f, composer: e.target.value }))}
                    placeholder="Ej: Mozart, Bach..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Instrumento</label>
                  <select
                    value={form.instrument}
                    onChange={(e) => setForm((f) => ({ ...f, instrument: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {INSTRUMENTS.map((i) => (
                      <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Género</label>
                  <select
                    value={form.genre}
                    onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {GENRES.map((g) => (
                      <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveProperties}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
                  >
                    <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setForm({ title: score.title, composer: score.composer || '', instrument: score.instrument, genre: score.genre }) }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-slate-400">Título</dt>
                  <dd className="font-medium text-slate-900">{score.title}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-400">Compositor</dt>
                  <dd className="text-slate-700">{score.composer || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-400">Instrumento</dt>
                  <dd className="text-slate-700">{score.instrument}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-400">Género</dt>
                  <dd className="text-slate-700">{score.genre}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-400">Versión</dt>
                  <dd className="text-slate-700">{score.version}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-400">Estado</dt>
                  <dd className="text-slate-700">{score.status === 'published' ? 'Publicada' : 'Borrador'}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
