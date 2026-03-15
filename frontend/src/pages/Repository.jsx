import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { repositoryService } from '../services/repositoryService'

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
      alert('Debes iniciar sesión para valorar')
      return
    }
    await repositoryService.rate(scoreId, value, token)
    load()
  }

  useEffect(() => {
    load('')
  }, [load])

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Repositorio comunitario</h1>
      <div className="flex gap-2">
        <input
          className="w-full rounded-md border px-3 py-2"
          placeholder="Buscar por título o autor"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="rounded-md border px-4 py-2" onClick={() => load(q)}>
          Buscar
        </button>
      </div>
      {loading ? <p>Cargando...</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {scores.map((score) => (
          <article key={score.id} className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold">{score.title}</h2>
            <p className="text-sm text-slate-600">
              {score.instrument} - {score.genre}
            </p>
            <p className="text-sm">Rating: {Number(score.avg_rating || 0).toFixed(1)} / 5</p>
            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} className="rounded border px-2 py-1 text-xs" onClick={() => rate(score.id, v)}>
                  {v}★
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
