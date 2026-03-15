import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { scoreService } from '../services/scoreService'
import {
  Music,
  Plus,
  Edit3,
  Globe,
  Loader2,
  FileMusic,
  Clock,
  Camera,
  ChevronRight,
  Star,
  User,
} from 'lucide-react'

export default function Dashboard() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await scoreService.listMine(token, 1, 50)
      setScores(data.items || [])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const drafts = scores.filter((s) => s.status === 'draft')
  const published = scores.filter((s) => s.status === 'published')

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mis partituras</h1>
          <p className="text-sm text-slate-500">Gestiona tus partituras y crea nuevas</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/scanner"
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <Camera size={16} /> Scanner OCR
          </Link>
          <Link
            to="/editor"
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
          >
            <Plus size={16} /> Nueva partitura
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      )}

      {!loading && scores.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 py-16 text-center">
          <FileMusic size={48} className="mx-auto mb-4 text-slate-300" />
          <h2 className="mb-2 text-lg font-semibold text-slate-600">No tienes partituras todavía</h2>
          <p className="mb-6 text-sm text-slate-400">Crea una nueva partitura o escanea una con OCR</p>
          <div className="flex justify-center gap-3">
            <Link to="/editor" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
              <Plus size={16} /> Crear partitura
            </Link>
            <Link to="/scanner" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Camera size={16} /> Escanear imagen
            </Link>
          </div>
        </div>
      )}

      {drafts.length > 0 && (
        <ScoreSection
          icon={Edit3}
          label={`Borradores (${drafts.length})`}
          scores={drafts}
          navigate={navigate}
        />
      )}

      {published.length > 0 && (
        <ScoreSection
          icon={Globe}
          label={`Publicadas (${published.length})`}
          scores={published}
          navigate={navigate}
        />
      )}
    </div>
  )
}

function ScoreSection({ icon: Icon, label, scores, navigate }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
        <Icon size={14} /> {label}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scores.map((score) => (
          <button
            key={score.id}
            onClick={() => navigate(`/score/${score.id}`)}
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-bold text-slate-900 group-hover:text-indigo-600">
                  {score.title}
                </h3>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock size={12} /> v{score.version}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    score.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {score.status === 'published' ? 'Publicada' : 'Borrador'}
                  </span>
                </div>
              </div>
              <ChevronRight size={18} className="mt-1 flex-shrink-0 text-slate-300 transition group-hover:text-indigo-400" />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded-md bg-slate-100 px-2 py-0.5">{score.instrument}</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5">{score.genre}</span>
              {score.composer && (
                <span className="flex items-center gap-1 truncate text-slate-400">
                  <User size={10} /> {score.composer}
                </span>
              )}
              {score.avg_rating > 0 && (
                <span className="ml-auto flex items-center gap-0.5 text-amber-500">
                  <Star size={10} className="fill-amber-400" /> {score.avg_rating.toFixed(1)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
