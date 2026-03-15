import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { repositoryService } from '../services/repositoryService'
import { Library, Search, Star, Loader2 } from 'lucide-react'

export default function Repository() {
  const { token, isAuthenticated } = useAuth()
  const [q, setQ] = useState('')
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (query = '') => {
    setLoading(true)
    try {
      const data = await repositoryService.list({ q: query, page: 1, page_size: 20, sort: 'recent' })
      setScores(data.items || [])
    } finally {
      setLoading(false)
    }
  }, [])

  async function rate(scoreId, value) {
    if (!isAuthenticated) {
      alert('Inicia sesión para valorar')
      return
    }
    await repositoryService.rate(scoreId, value, token)
    load(q)
  }

  useEffect(() => {
    load('')
  }, [load])

  function handleSearch(e) {
    e.preventDefault()
    load(q)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
          <Library size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Repositorio comunitario</h1>
          <p className="text-sm text-slate-500">Explora y valora partituras de la comunidad</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            placeholder="Buscar por título..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95"
        >
          Buscar
        </button>
      </form>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      )}

      {/* Scores grid */}
      {!loading && scores.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <Library size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-400">No hay partituras publicadas todavía</p>
          <p className="text-sm text-slate-400">Sé el primero en publicar una</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scores.map((score) => (
          <article
            key={score.id}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
          >
            <h2 className="mb-1 font-bold text-slate-900 group-hover:text-indigo-600">
              {score.title}
            </h2>
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium">
                {score.instrument}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium">
                {score.genre}
              </span>
            </div>

            {/* Rating display */}
            <div className="mb-3 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <Star
                  key={v}
                  size={16}
                  className={
                    v <= Math.round(score.avg_rating || 0)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-300'
                  }
                />
              ))}
              <span className="ml-1 text-sm font-medium text-slate-500">
                {Number(score.avg_rating || 0).toFixed(1)}
              </span>
            </div>

            {/* Rating buttons */}
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => rate(score.id, v)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600 active:scale-95"
                >
                  {v}★
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
