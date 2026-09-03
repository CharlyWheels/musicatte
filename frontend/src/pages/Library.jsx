/**
 * The user's own scores.
 *
 * Replaces the Dashboard that lived at `/` and also at `/dashboard`, competing
 * with a marketing home page for the same address. This has one address and
 * one job, and the nav label matches it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Camera,
  FileMusic,
  Globe,
  Loader2,
  Music,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext.jsx'
import { scoreService } from '../services/scoreService.js'
import { INSTRUMENTS } from '../editor/constants.js'

function instrumentLabel(value) {
  return INSTRUMENTS.find((item) => item.value === value)?.label || value
}

export default function Library() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const importRef = useRef(null)

  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (search = '') => {
      setLoading(true)
      try {
        const data = await scoreService.listMine(token, { q: search })
        setScores(data.items || [])
        setError('')
      } catch (cause) {
        setError(cause?.response?.data?.detail || 'No se pudieron cargar tus partituras.')
      } finally {
        setLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    load('')
  }, [load])

  const remove = useCallback(
    async (score) => {
      if (!window.confirm(`¿Eliminar «${score.title}»? No se puede deshacer.`)) return
      try {
        await scoreService.remove(score.id, token)
        setScores((current) => current.filter((item) => item.id !== score.id))
      } catch {
        setError('No se pudo eliminar la partitura.')
      }
    },
    [token],
  )

  const onImport = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      setImporting(true)
      setError('')
      try {
        const imported = await scoreService.importFile(file, token)
        navigate('/editor', {
          state: { scoreData: imported.score_data, importedTitle: imported.title },
        })
      } catch (cause) {
        setError(cause?.response?.data?.detail || 'No se pudo importar ese archivo.')
      } finally {
        setImporting(false)
      }
    },
    [navigate, token],
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
          <FileMusic size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900">Mis partituras</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Cargando…' : `${scores.length} guardada${scores.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/escanear"
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Camera size={16} /> Escanear
          </Link>
          <Link
            to="/editor"
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Plus size={16} /> Nueva
          </Link>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            title="Abrir un MusicXML, MEI o MIDI que ya tengas"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Importar
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".musicxml,.xml,.mxl,.mei,.mid,.midi"
            onChange={onImport}
            className="hidden"
          />
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          load(query)
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-900"
        >
          Buscar
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={22} className="animate-spin text-indigo-500" />
        </div>
      ) : scores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center">
          <Music size={38} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-600">Todavía no tienes partituras</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
            Haz una foto de una partitura para digitalizarla, empieza una en blanco o importa un
            archivo que ya tengas.
          </p>
          <Link
            to="/escanear"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Camera size={16} /> Escanear la primera
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scores.map((score) => (
            <li
              key={score.id}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
            >
              <Link to={`/editor/${score.id}`} className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-slate-900 group-hover:text-indigo-700">
                  {score.title}
                </h2>
                {score.composer && (
                  <p className="truncate text-sm text-slate-500">{score.composer}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {instrumentLabel(score.instrument)}
                  </span>
                  {score.status === 'published' && (
                    <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <Globe size={11} /> Publicada
                    </span>
                  )}
                  {score.rating_count > 0 && (
                    <span className="text-xs text-amber-600">
                      ★ {score.avg_rating.toFixed(1)} ({score.rating_count})
                    </span>
                  )}
                </div>
              </Link>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span className="text-xs text-slate-400">
                  {score.updated_at
                    ? new Date(score.updated_at).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                      })
                    : ''}
                </span>
                <div className="flex gap-1">
                  {score.status === 'published' && (
                    <Link
                      to={`/partitura/${score.id}`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="Ver la página pública"
                    >
                      <Globe size={15} />
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(score)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
